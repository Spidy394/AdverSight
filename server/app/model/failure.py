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


class VerdictStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    INCONCLUSIVE = "inconclusive"
    TARGET_ERROR = "target_error"
    PROVIDER_ERROR = "provider_error"
    TIMEOUT = "timeout"


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
    confidence_source: str | None = None
    confidence_evidence: list[str] = Field(default_factory=list)
    correlated_findings: list[Finding] = Field(default_factory=list)


class Verdict(Model):
    passed: bool
    status: str = "pass"
    findings: list[Finding] = Field(default_factory=list)
    primary: Finding | None = None
    needs_review: bool = False  # weak signal / LLM suspicion that the rules could not confirm
    review_note: str | None = None
    suspicions: list[Finding] = Field(default_factory=list)  # low-confidence signals (< fail threshold)
    confidence: float = 1.0
    confidence_source: str | None = None
    confidence_evidence: list[str] = Field(default_factory=list)
    reason: str | None = None


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
    all_findings: list[Finding] = Field(default_factory=list)
    turn_number: int | None = None
    latency_ms: float | None = None
    replayable: bool = True
    confidence_source: str | None = None
    confidence_evidence: list[str] = Field(default_factory=list)
    reproducibility: str = "untested"
    reproduction_rate: float | None = None
