"""Strategy registry: the single place the engine looks strategies up.

* ``AttackGenerator`` reads every strategy (seeds, escalations, partners) through a
  ``StrategyRegistry``, so registering a custom strategy changes what the generator plans,
  escalates and mutates - no engine edits needed.
* ``strategies.py`` stays the plain-data library of the built-in strategies; the registry is
  loaded from it by default.
* ``next_strategy`` / ``EXPLOIT_CHAIN`` hold the deterministic "if it works, push the
  adjacent weakness" knowledge. The generator uses the same chain when it re-prioritises,
  so there is one definition of how an attack campaign escalates.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.model.test import AttackCategory, TargetSpec, TestResult
from app.services.strategies import STRATEGIES, Strategy, build_slots, render


@runtime_checkable
class AttackStrategy(Protocol):
    """A pluggable attack strategy.

    ``seeds`` are opening templates; ``escalations`` are follow-ups used when the target
    resists. Templates may use ``{action}``, ``{Action}``, ``{asset}``, ``{key}``, ``{value}``.
    """

    id: str
    category: AttackCategory
    description: str
    seeds: tuple[str, ...]
    escalations: tuple[str, ...]

    def generate_probes(self, spec: TargetSpec) -> list[str]:
        """Opening attack prompts tailored to the target spec."""
        ...


class BaseTemplateStrategy:
    """Strategy backed by a ``Strategy`` data object (the built-in ones)."""

    def __init__(self, strategy_data: Strategy) -> None:
        self.strategy_data = strategy_data
        self.id = strategy_data.id
        self.category = strategy_data.category
        self.description = strategy_data.description
        self.seeds = strategy_data.seeds
        self.escalations = strategy_data.escalations

    def generate_probes(self, spec: TargetSpec) -> list[str]:
        slots = build_slots(spec)
        return [render(seed, **slots) for seed in self.seeds]


class StrategyRegistry:
    """Central registry of attack strategies, keyed by attack category."""

    def __init__(self, load_defaults: bool = True) -> None:
        self._strategies: dict[AttackCategory, AttackStrategy] = {}
        if load_defaults:
            for cat, strat in STRATEGIES.items():
                self._strategies[cat] = BaseTemplateStrategy(strat)

    def register(self, strategy: AttackStrategy) -> None:
        """Add a strategy, replacing any existing one for the same category."""
        self._strategies[strategy.category] = strategy

    def get(self, category: AttackCategory) -> AttackStrategy | None:
        return self._strategies.get(category)

    def require(self, category: AttackCategory) -> AttackStrategy:
        strat = self._strategies.get(category)
        if strat is None:
            known = ", ".join(c.value for c in self._strategies) or "none"
            raise KeyError(f"No strategy registered for category '{category.value}' (registered: {known})")
        return strat

    def category_of(self, strategy_id: str) -> AttackCategory | None:
        """Resolve a strategy id (or a category value) back to its category."""
        for cat, strat in self._strategies.items():
            if strat.id == strategy_id or cat.value == strategy_id:
                return cat
        return None

    def partners(self, strategy: AttackStrategy) -> list[AttackStrategy]:
        """Other strategies with escalations, in registration order (used to compose attacks)."""
        return [s for s in self._strategies.values() if s.id != strategy.id and s.escalations]

    def categories(self) -> list[AttackCategory]:
        return list(self._strategies)

    def list_all(self) -> list[AttackStrategy]:
        return list(self._strategies.values())


# Shared default registry (what the engine uses unless a registry is injected).
strategy_registry = StrategyRegistry()


# ── Adaptive category selection ─────────────────────────────────────────────────

CATEGORY_ROTATION = [
    AttackCategory.GOAL_HIJACKING,
    AttackCategory.IDENTITY_CONFUSION,
    AttackCategory.POLICY_VIOLATION,
    AttackCategory.UNAUTHORIZED_ACTION,
    AttackCategory.CONTEXT_MANIPULATION,
    AttackCategory.TOOL_MISUSE,
    AttackCategory.INFORMATION_EXTRACTION,
]

# "If this category broke the target, the adjacent one is the next thing to try."
EXPLOIT_CHAIN: dict[AttackCategory, AttackCategory] = {
    AttackCategory.IDENTITY_CONFUSION: AttackCategory.UNAUTHORIZED_ACTION,
    AttackCategory.GOAL_HIJACKING: AttackCategory.POLICY_VIOLATION,
}


def chained_category(category: AttackCategory) -> AttackCategory | None:
    """The category worth probing next after ``category`` produced a failure."""
    return EXPLOIT_CHAIN.get(category)


def next_strategy(
    previous_result: TestResult | None,
    available_categories: list[AttackCategory] | None = None,
    consecutive_passes: int = 0,
) -> AttackCategory:
    """Deterministic, explainable adaptive category selection.

    1. No previous result: start with the first allowed category.
    2. Previous probe failed (vulnerability found): exploit - follow ``EXPLOIT_CHAIN`` if the
       chained category is allowed, otherwise stay on the vulnerable category.
    3. Target resisted: explore - rotate to the next allowed category.
    """
    allowed = available_categories or CATEGORY_ROTATION
    if not allowed:
        return AttackCategory.POLICY_VIOLATION

    if previous_result is None:
        return allowed[0]

    prev_cat = previous_result.category or AttackCategory.POLICY_VIOLATION

    if previous_result.status == "failed":
        chained = chained_category(prev_cat)
        return chained if chained in allowed else prev_cat

    try:
        return allowed[(allowed.index(prev_cat) + 1) % len(allowed)]
    except ValueError:
        return allowed[0]
