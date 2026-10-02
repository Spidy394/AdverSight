"""Data contracts shared by the whole AdverSight engine.

Everything serialises to camelCase JSON (``model.model_dump(by_alias=True)``) so the
output matches ``client/src/types/testing.ts`` without any mapping layer.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


Severity = Literal["low", "medium", "high", "critical"]
TestStatus = Literal["pending", "running", "passed", "failed"]
SEVERITY_RANK: dict[str, int] = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AttackCategory(str, Enum):
    """Matches the 'Attack Categories' checkboxes in the dashboard."""

    GOAL_HIJACKING = "goal_hijacking"
    IDENTITY_CONFUSION = "identity_confusion"
    POLICY_VIOLATION = "policy_violation"
    UNAUTHORIZED_ACTION = "unauthorized_action"
    CONTEXT_MANIPULATION = "context_manipulation"
    TOOL_MISUSE = "tool_misuse"
    INFORMATION_EXTRACTION = "information_extraction"


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


# --------------------------------------------------------------------------- target
class ToolCall(Model):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(Model):
    text: str
    tool_calls: list[ToolCall] = Field(default_factory=list)


class Turn(Model):
    """One exchange: what AdverSight sent and what the target answered."""

    attack: str
    response: AgentResponse


class TargetPolicy(Model):
    """Machine-checkable rules the target agent is supposed to obey.

    This is what keeps the detectors domain-agnostic: swap the policy, keep the engine.
    """

    protected_tools: list[str] = Field(default_factory=list)
    protected_tool_patterns: list[str] = Field(default_factory=list)  # glob, e.g. "book_*"
    read_only_tools: list[str] = Field(default_factory=list)
    allowed_tools: list[str] | None = None  # None = don't check tool allow-list
    confirmation_argument: str = "confirmed"
    restricted_patterns: list[str] = Field(default_factory=list)  # regex: must never appear
    forbidden_response_patterns: list[str] = Field(default_factory=list)  # regex: policy breaches
    context_facts: dict[str, str] = Field(default_factory=dict)  # tool-arg facts the user set
    canaries: list[str] = Field(default_factory=list)  # planted secrets/records that must never leak
    system_prompt: str | None = None  # hidden prompt; paraphrased/verbatim leaks are detected
    scope_keywords: list[str] = Field(default_factory=list)  # what the agent is FOR (off-topic drift check)
    rules: list[str] = Field(default_factory=list)  # human-readable, shown in evidence


class TargetSpec(Model):
    name: str
    domain: str
    protected_actions: list[str]  # natural language, e.g. "book the flight"
    sensitive_assets: list[str] = Field(default_factory=list)  # e.g. "other customers' bookings"
    policy: TargetPolicy = Field(default_factory=TargetPolicy)


# --------------------------------------------------------------------------- attacks
class AttackScenario(Model):
    id: str
    strategy: str
    category: AttackCategory
    attack: str  # opening message
    origin: Literal["template", "llm"] = "template"
    max_turns: int = 5
    derived_from: str | None = None  # id of the failed test this variant was spawned from


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
class TestResult(Model):
    """Superset of the frontend ``TestCase`` interface."""

    id: str
    strategy: str
    attack: str
    status: TestStatus
    response: str | None = None
    failure_type: str | None = None
    category: AttackCategory | None = None
    turns: list[Turn] = Field(default_factory=list)
    needs_review: bool = False


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


class LogEvent(Model):
    timestamp: str
    type: str
    message: str


class SessionSummary(Model):
    total: int
    completed: int
    passed: int
    failed: int
    needs_review: int = 0
    by_category: dict[str, dict[str, int]] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)


# --------------------------------------------------------------------------- replay
class ReplayCase(Model):
    """Everything needed to reproduce a failure exactly."""

    id: str
    test_id: str
    strategy: str
    target_name: str
    attacker_messages: list[str]
    expected_failure_type: str
    created_at: str


class ReplayResult(Model):
    replay_case_id: str
    reproduced: bool
    status: TestStatus
    findings: list[Finding] = Field(default_factory=list)
    turns: list[Turn] = Field(default_factory=list)
    attempts: int = 1
    reproduced_count: int = 0
    reproduction_rate: float = 0.0  # LLM targets are non-deterministic: report how often it recurs


class SessionReport(Model):
    tests: list[TestResult]
    failures: list[Failure]
    logs: list[LogEvent]
    summary: SessionSummary
    replay_cases: list[ReplayCase]
