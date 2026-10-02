"""Failure Evidence routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.model.session import Failure
from app.services import session_service as service

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
