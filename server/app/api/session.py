"""Testing Session routes.

Thin HTTP layer: validate, call the service, translate service errors into
status codes. No business logic lives here.
"""

from fastapi import APIRouter, HTTPException, status

from app.model.session import SessionCreate, SessionDashboard
from app.services import session_service as service

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