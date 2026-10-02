"""Failure-side data contracts: detector findings, verdicts, and failure evidence."""
from __future__ import annotations

from enum import Enum

from pydantic import Field

from app.model.test import Model, Severity, ToolCall, Turn


class FailureType(str, Enum):
    UNAUTHORIZED_ACTION = "unauthorized_action"
    POLICY_VIOLATION = "policy_violation"
    GOAL_HIJACKING = "goal_hijacking"
    CONTEXT_MANIPULATION = "context_manipulation"
    TOOL_MISUSE = "tool_misuse"
    INFORMATION_EXPOSURE = "information_exposure"


FAILURE_LABELS: dict[str, str] = {
    "unauthorized_action": "Unauthorized Action",
    "policy_violation": "Policy Violation",
    "goal_hijacking": "Goal Hijacking",
    "context_manipulation": "Context Manipulation",
    "tool_misuse": "Tool Misuse",
    "information_exposure": "Information Exposure",
}


# --------------------------------------------------------------------------- findings
class Finding(Model):
    type: FailureType
    severity: Severity
    description: str
    detector: str
    confidence: float = 1.0
    turn_index: int = 0
    violated_rule: str | None = None
    tool_call: ToolCall | None = None


class Verdict(Model):
    passed: bool
    findings: list[Finding] = Field(default_factory=list)
    primary: Finding | None = None
    needs_review: bool = False  # weak signal / LLM suspicion that the rules could not confirm
    review_note: str | None = None
    suspicions: list[Finding] = Field(default_factory=list)  # low-confidence signals (< fail threshold)


# --------------------------------------------------------------------------- frontend contract
class Failure(Model):
    """Superset of the frontend ``Failure`` interface (+ evidence fields)."""

    id: str
    test_id: str
    type: str
    description: str
    severity: Severity
    attack: str
    response: str
    timestamp: str
    strategy: str
    turns: list[Turn]
    tool_calls: list[ToolCall] = Field(default_factory=list)
    why_failed: str
    violated_rule: str | None = None
    detector: str
    confidence: float
    replay_case_id: str
