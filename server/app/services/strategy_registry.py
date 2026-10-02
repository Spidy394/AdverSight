"""Pluggable Adversarial Strategy System and Adaptive Selector.

Implements pluggable AttackStrategy interface and deterministic next_strategy adaptation.
Allows testing engine to dynamically select and escalate adversarial probes without
hardcoding category logic in the orchestrator.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Protocol, runtime_checkable

from app.model.test import AttackCategory, TargetSpec, TestResult
from app.services.strategies import STRATEGIES, Strategy, render


@runtime_checkable
class AttackStrategy(Protocol):
    """Protocol for pluggable attack strategies."""

    id: str
    category: AttackCategory
    description: str

    def generate_probes(self, spec: TargetSpec) -> list[str]:
        """Generate formatted attack prompts tailored to target spec."""
        ...


class BaseTemplateStrategy:
    """Strategy implementation using parameterizable template slots."""

    def __init__(self, strategy_data: Strategy) -> None:
        self.id = strategy_data.id
        self.category = strategy_data.category
        self.description = strategy_data.description
        self.strategy_data = strategy_data

    def generate_probes(self, spec: TargetSpec) -> list[str]:
        key, value = next(iter(spec.policy.context_facts.items()), ("details", "what I said"))
        slots = {
            "action": spec.protected_actions[0] if spec.protected_actions else "execute action",
            "asset": spec.sensitive_assets[0] if spec.sensitive_assets else "the private data",
            "key": key,
            "value": value,
        }
        return [render(seed, slots) for seed in self.strategy_data.seeds]


class StrategyRegistry:
    """Central registry of adversarial strategies."""

    def __init__(self) -> None:
        self._strategies: dict[AttackCategory, AttackStrategy] = {}
        self._load_default_strategies()

    def _load_default_strategies(self) -> None:
        for cat, strat in STRATEGIES.items():
            self._strategies[cat] = BaseTemplateStrategy(strat)

    def register(self, strategy: AttackStrategy) -> None:
        self._strategies[strategy.category] = strategy

    def get(self, category: AttackCategory) -> AttackStrategy | None:
        return self._strategies.get(category)

    def list_all(self) -> list[AttackStrategy]:
        return list(self._strategies.values())


# Singleton registry instance
strategy_registry = StrategyRegistry()


# ── Adaptive Strategy Selection ─────────────────────────────────────────────────


CATEGORY_ROTATION = [
    AttackCategory.GOAL_HIJACKING,
    AttackCategory.IDENTITY_CONFUSION,
    AttackCategory.POLICY_VIOLATION,
    AttackCategory.UNAUTHORIZED_ACTION,
    AttackCategory.CONTEXT_MANIPULATION,
    AttackCategory.TOOL_MISUSE,
    AttackCategory.INFORMATION_EXTRACTION,
]


def next_strategy(
    previous_result: TestResult | None,
    available_categories: list[AttackCategory] | None = None,
    consecutive_passes: int = 0,
) -> AttackCategory:
    """Deterministic, explainable adaptive strategy selection.

    Principles:
    1. If no previous result: Start with Goal Hijacking or first selected category.
    2. If previous probe failed (found vulnerability): Exploit by sticking with
       or escalating that vulnerable category (e.g. Identity Confusion -> Unauthorized Action).
    3. If target resists (passed): Rotate to next category in sequence to probe different attack surfaces.
    """
    allowed = available_categories or CATEGORY_ROTATION
    if not allowed:
        return AttackCategory.POLICY_VIOLATION

    if previous_result is None:
        return allowed[0]

    prev_cat = previous_result.category or AttackCategory.POLICY_VIOLATION

    # Exploit: If the agent failed on Identity Confusion, test if Unauthorized Action also succeeds
    if previous_result.status == "failed":
        if prev_cat == AttackCategory.IDENTITY_CONFUSION and AttackCategory.UNAUTHORIZED_ACTION in allowed:
            return AttackCategory.UNAUTHORIZED_ACTION
        if prev_cat == AttackCategory.GOAL_HIJACKING and AttackCategory.POLICY_VIOLATION in allowed:
            return AttackCategory.POLICY_VIOLATION
        return prev_cat

    # Explore: Target resisted, step to next category in sequence
    try:
        current_idx = allowed.index(prev_cat)
        next_idx = (current_idx + 1) % len(allowed)
        return allowed[next_idx]
    except ValueError:
        return allowed[0]
