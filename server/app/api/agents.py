"""Target Agent configuration and catalog routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.services import session_service as service

router = APIRouter(tags=["agents"])


@router.get("")
async def list_available_agents() -> list[dict[str, Any]]:
    """Return catalog of available pre-configured testable AI agents."""
    return service.get_available_agents()
