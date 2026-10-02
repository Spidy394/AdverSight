"""Test case execution and replay routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, status

from app.model.session import ReplayRequest, TestCase
from app.services import session_service as service
from app.util.sanitizer import sanitize_text

router = APIRouter(tags=["tests"])


@router.get("/{test_id}", response_model=TestCase)
async def get_test(test_id: str) -> TestCase:
    """Retrieve details for a specific test case by ID."""
    test_case = await service.get_test_case(test_id)
    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Test case '{test_id}' not found.",
        )
    return test_case


@router.post("/{test_id}/replay")
async def replay_test(
    test_id: str,
    payload: ReplayRequest | None = Body(default=None),
) -> dict[str, Any]:
    """Replay a specific test case deterministically and return reproduction verdict and metrics."""
    attempts = payload.attempts if payload is not None else 1
    try:
        return await service.replay_test_case(test_id, attempts=attempts)
    except service.SessionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replay execution failed: {sanitize_text(str(exc))}",
        ) from exc
