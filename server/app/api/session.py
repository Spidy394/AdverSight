"""Testing Session routes.

Thin HTTP layer: validate, call the service, translate service errors into
status codes. No business logic lives here.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.model.event import TestEventType
from app.model.session import SessionCreate, SessionDashboard
from app.services import session_service as service
from app.services.event_broker import event_broker

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


def _not_found(exc: service.SessionNotFoundError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


def _conflict(exc: service.SessionStateError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("", response_model=SessionDashboard, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate) -> SessionDashboard:
    """Create a testing session in ``idle`` state."""
    record = await service.create_session(payload.config)
    return service.build_dashboard(record)


@router.get("/{session_id}", response_model=SessionDashboard)
async def get_session(session_id: str) -> SessionDashboard:
    """Retrieve the full dashboard state for a session."""
    try:
        record = await service.get_session(session_id)
    except service.SessionNotFoundError as exc:
        raise _not_found(exc) from exc
    return service.build_dashboard(record)


@router.post("/{session_id}/start", response_model=SessionDashboard)
async def start_session(session_id: str) -> SessionDashboard:
    """Transition a session from ``idle`` to ``testing``.

    Idempotent while already testing. Returns 409 once the session has
    completed, since it cannot be restarted.
    """
    try:
        record = await service.start_session(session_id)
    except service.SessionNotFoundError as exc:
        raise _not_found(exc) from exc
    except service.SessionStateError as exc:
        raise _conflict(exc) from exc
    return service.build_dashboard(record)


@router.post("/{session_id}/stop", response_model=SessionDashboard)
async def stop_session(session_id: str) -> SessionDashboard:
    """Transition a session from ``testing`` to ``completed``.

    Idempotent once completed. Returns 409 if the session was never started.
    """
    try:
        record = await service.stop_session(session_id)
    except service.SessionNotFoundError as exc:
        raise _not_found(exc) from exc
    except service.SessionStateError as exc:
        raise _conflict(exc) from exc
    return service.build_dashboard(record)


async def _get_valid_session(session_id: str) -> service.SessionRecord:
    try:
        return await service.get_session(session_id)
    except service.SessionNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/{session_id}/stream", response_class=EventSourceResponse)
async def stream_session(
    record: service.SessionRecord = Depends(_get_valid_session),
):
    """Stream live session events via Server-Sent Events (SSE)."""
    session_id = record.session_id
    queue = await event_broker.subscribe(session_id)

    try:
        # 1. Initial state snapshot
        progress = service._derive_progress(record)
        initial_data = {
            "status": record.status.value,
            "testsCompleted": progress.completed,
            "testsPassed": progress.passed,
            "testsFailed": progress.failed,
            "progress": progress.model_dump(by_alias=True),
            "config": record.config.model_dump(by_alias=True),
            "activeTestId": record.active_test_id,
        }
        yield ServerSentEvent(
            id=f"state_{session_id}",
            event=TestEventType.SESSION_STATE.value,
            data=initial_data,
        )

        # If already completed, stream terminal event and return
        if record.status is service.SessionStatus.COMPLETED:
            yield ServerSentEvent(
                id=f"done_{session_id}",
                event=TestEventType.SESSION_COMPLETED.value,
                data={"progress": progress.model_dump(by_alias=True)},
            )
            return

        # 2. Real-time event loop
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield ServerSentEvent(comment="ping")
                continue

            event_data = event.model_dump(by_alias=True, mode="json")
            yield ServerSentEvent(
                id=event.id,
                event=event.type.value,
                data=event_data,
            )

            if event.type in (
                TestEventType.SESSION_COMPLETED,
                TestEventType.SESSION_STOPPED,
                TestEventType.SESSION_ERROR,
            ):
                break
    except (asyncio.CancelledError, GeneratorExit):
        pass
    finally:
        await event_broker.unsubscribe(session_id, queue)