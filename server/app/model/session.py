"""Pydantic schemas for the Testing Session API.

Every model here mirrors an interface in ``client/src/types/testing.ts``. That
handoff is deliberate (see docs/AdverSight — Frontend Step 1 Team Briefing.md,
"Handoff to Backend Team"), so the JSON produced by this package is the
contract the frontend is typed against.

Serialization notes:

* ``alias_generator=to_camel`` turns ``test_number`` into ``testNumber`` so the
  payloads match the TypeScript interfaces without hand-written aliases.
  ``populate_by_name=True`` still accepts the snake_case name on input.
* Fields use ``StrEnum`` rather than ``Literal[...]`` so the allowed values are
  named once and reusable by the service layer. ``StrEnum`` serializes to its
  string value, so the JSON is still a plain string.
* ``SessionDashboard`` contains exactly the fields of the frontend's
  ``DashboardData``. Lifecycle timestamps are deliberately absent — they are
  internal bookkeeping and must not widen the frontend contract.
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# ── Enumerations (mirror of the TS string unions) ───────────────────────────────


class TestStatus(StrEnum):
    """TS: ``TestStatus``."""

    __test__ = False
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"


class SessionStatus(StrEnum):
    """TS: ``DashboardStatus``."""

    IDLE = "idle"
    TESTING = "testing"
    COMPLETED = "completed"


class Severity(StrEnum):
    """TS: ``Severity``."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AttackCategory(StrEnum):
    """TS: ``AttackCategory``."""

    GOAL_HIJACKING = "goal_hijacking"
    IDENTITY_CONFUSION = "identity_confusion"
    POLICY_VIOLATION = "policy_violation"
    UNAUTHORIZED_ACTION = "unauthorized_action"
    CONTEXT_MANIPULATION = "context_manipulation"
    TOOL_MISUSE = "tool_misuse"
    INFORMATION_EXTRACTION = "information_extraction"


class TestMode(StrEnum):
    """TS: ``TestMode``."""

    QUICK_SCAN = "quick_scan"
    FULL_ADVERSARIAL = "full_adversarial"
    CUSTOM = "custom"


class AgentType(StrEnum):
    """TS: ``AgentType``."""

    TOOL_CALLING = "tool_calling"
    REACT_AGENT = "react_agent"
    LLM_CHAIN = "llm_chain"
    CUSTOM = "custom"


class TurnRole(StrEnum):
    """TS: ``ConversationTurn["role"]``."""

    ADVERSIGHT = "adversight"
    TARGET = "target"


class LogEventType(StrEnum):
    """TS: ``LogEventType``."""

    TEST_STARTED = "TEST_STARTED"
    ATTACK_GENERATED = "ATTACK_GENERATED"
    REQUEST_SENT = "REQUEST_SENT"
    AGENT_RESPONSE_RECEIVED = "AGENT_RESPONSE_RECEIVED"
    TOOL_CALL = "TOOL_CALL"
    RESPONSE_ANALYZED = "RESPONSE_ANALYZED"
    POLICY_CHECK = "POLICY_CHECK"
    FAILURE_RECORDED = "FAILURE_RECORDED"
    TEST_COMPLETED = "TEST_COMPLETED"
    SESSION_STARTED = "SESSION_STARTED"
    SESSION_COMPLETED = "SESSION_COMPLETED"


# ── Shared base ─────────────────────────────────────────────────────────────────


class AdverSightModel(BaseModel):
    """Base model emitting camelCase JSON to match the TypeScript contract."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ── Target Agent ────────────────────────────────────────────────────────────────


class TargetAgent(AdverSightModel):
    """TS: ``TargetAgent``."""

    id: str
    name: str
    endpoint: str
    agent_type: AgentType
    connected: bool = False


class TestSessionConfig(AdverSightModel):
    """TS: ``TestSessionConfig``."""

    __test__ = False
    target_agent: TargetAgent
    test_mode: TestMode
    attack_categories: list[AttackCategory] = Field(default_factory=list)
    max_tests: int = Field(default=10, ge=1)
    max_turns_per_test: int = Field(default=8, ge=1)


# ── Individual Test Case ────────────────────────────────────────────────────────


class ConversationTurn(AdverSightModel):
    """TS: ``ConversationTurn``."""

    role: TurnRole
    content: str
    timestamp: str


class ToolCall(AdverSightModel):
    """TS: ``ToolCall``."""

    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    timestamp: str


class TestCase(AdverSightModel):
    """TS: ``TestCase``."""

    id: str
    test_number: int
    strategy: AttackCategory
    attack: str
    status: TestStatus
    conversation: list[ConversationTurn] = Field(default_factory=list)
    response: str | None = None
    tool_calls: list[ToolCall] | None = None
    failure_type: str | None = None
    failure_description: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


# ── Failure Evidence ────────────────────────────────────────────────────────────


class Failure(AdverSightModel):
    """TS: ``Failure``.

    ``type`` stays free text on purpose — the frontend carries human-readable
    labels here ("Policy Violation"), not a closed enum.
    """

    id: str
    test_id: str
    test_number: int
    type: str
    strategy: AttackCategory
    description: str
    severity: Severity
    attack: str
    response: str
    tool_calls: list[ToolCall] | None = None
    why_it_failed: str
    timestamp: str


# ── Observability Log ───────────────────────────────────────────────────────────


class LogEvent(AdverSightModel):
    """TS: ``LogEvent``."""

    id: str
    timestamp: str
    type: LogEventType
    message: str
    test_id: str | None = None
    meta: dict[str, Any] | None = None


# ── Dashboard State ─────────────────────────────────────────────────────────────


class TestProgress(AdverSightModel):
    """TS: ``TestProgress``."""

    total: int = 0
    completed: int = 0
    passed: int = 0
    failed: int = 0
    running: int = 0


class SessionDashboard(AdverSightModel):
    """TS: ``DashboardData`` — the single response shape for every route."""

    session_id: str
    status: SessionStatus
    config: TestSessionConfig
    progress: TestProgress
    tests: list[TestCase] = Field(default_factory=list)
    failures: list[Failure] = Field(default_factory=list)
    logs: list[LogEvent] = Field(default_factory=list)
    active_test_id: str | None = None


# ── Requests ────────────────────────────────────────────────────────────────────


class SessionCreate(AdverSightModel):
    """Body of ``POST /api/v1/sessions``."""

    config: TestSessionConfig


# ── Replay Contracts ────────────────────────────────────────────────────────────


class ReplayRequest(AdverSightModel):
    """Configuration for replaying a recorded failure or test."""

    attempts: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of replay attempts to verify reproduction consistency (1-10)",
    )


class ReplayAttemptDetail(AdverSightModel):
    """Detailed observation of a single replay attempt."""

    attempt_number: int
    reproduced: bool
    status: str
    error: str | None = None
    response_text: str | None = None
    tool_calls: list[ToolCall] | None = None
    timestamp: str | None = None


class FailureReplayResponse(AdverSightModel):
    """Structured result of replaying a previously recorded failure."""

    failure_id: str
    status: str  # "completed" | "error"
    verdict: str  # "REPRODUCED" | "NOT_REPRODUCED" | "ERROR"
    reproduced: bool
    attempts: int
    successful_reproductions: int
    reproduction_rate: float
    original_failure_type: str
    original_test_id: str
    replay_case_id: str
    summary: str
    replay_results: list[ReplayAttemptDetail] = Field(default_factory=list)