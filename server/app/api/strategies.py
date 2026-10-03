"""Attack strategy catalog routes.

Read-only view of the strategy registry so the dashboard can render the attack-category
picker from the backend instead of hardcoding it.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.model.session import AdverSightModel
from app.services.strategy_registry import strategy_registry

router = APIRouter(tags=["strategies"])


class StrategyInfo(AdverSightModel):
    category: str
    id: str
    label: str
    description: str
    probe_count: int  # number of opening probes the strategy ships with


@router.get("", response_model=list[StrategyInfo])
async def list_strategies() -> list[StrategyInfo]:
    """Every registered attack strategy, in registration order."""
    return [
        StrategyInfo(
            category=s.category.value,
            id=s.id,
            label=s.category.value.replace("_", " ").title(),
            description=s.description,
            probe_count=len(s.seeds),
        )
        for s in strategy_registry.list_all()
    ]
