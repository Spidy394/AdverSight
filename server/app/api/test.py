"""Test case execution and replay routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.services import session_service as service

router = APIRouter(tags=["tests"])


@router.post("/{test_id}/replay")
async def replay_test(test_id: str) -> dict[str, Any]:
    """Replay a specific test case deterministically and return reproduction verdict and metrics."""
    try:
        return await service.replay_test_case(test_id)
    except service.SessionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replay execution failed: {exc}",
        ) from exc
