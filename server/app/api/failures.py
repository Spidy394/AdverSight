"""Failure Evidence and Exact Replay routes."""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, status

from app.model.session import Failure, FailureReplayResponse, ReplayRequest
from app.services import session_service as service
from app.util.sanitizer import sanitize_text

router = APIRouter(tags=["failures"])


@router.get("/{failure_id}", response_model=Failure)
async def get_failure(failure_id: str) -> Failure:
    """Retrieve detailed failure evidence record by its failure ID."""
    failure = await service.get_failure(failure_id)
    if not failure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Failure evidence '{failure_id}' not found.",
        )
    return failure


@router.post(
    "/{failure_id}/replay",
    response_model=FailureReplayResponse,
    status_code=status.HTTP_200_OK,
    summary="Replay a recorded failure",
    description=(
        "Executes an exact replay of a previously detected failure against its target agent "
        "using recorded attacker turns without generating new attacks, and evaluates reproduction consistency."
    ),
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "Failure evidence record was not found.",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "Invalid replay configuration (attempts out of 1-10 range) or missing conversation evidence.",
        },
        status.HTTP_502_BAD_GATEWAY: {
            "description": "Target agent adapter is unreachable or unavailable.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "description": "Unexpected server error during replay execution.",
        },
    },
)
async def replay_failure(
    failure_id: str,
    payload: ReplayRequest | None = Body(default=None),
) -> FailureReplayResponse:
    """Execute exact deterministic replay of a recorded failure."""
    attempts = payload.attempts if payload is not None else 1
    try:
        return await service.replay_failure(failure_id=failure_id, attempts=attempts)
    except service.FailureNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except service.MissingReplayEvidenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except service.TargetAdapterError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replay execution failed: {sanitize_text(str(exc))}",
        ) from exc
