"""Data contracts (serialise to camelCase JSON to match client/src/types/testing.ts)."""
from app.model.failure import FAILURE_LABELS, Failure, FailureType, Finding, Verdict
from app.model.test import (
    SEVERITY_RANK,
    AgentResponse,
    AttackCategory,
    AttackScenario,
    Model,
    SessionSummary,
    Severity,
    TargetPolicy,
    TargetSpec,
    TestResult,
    TestStatus,
    ToolCall,
    Turn,
)
from app.model.trace import LogEvent, ReplayCase, ReplayResult, SessionReport

__all__ = [
    "FAILURE_LABELS", "SEVERITY_RANK", "AgentResponse", "AttackCategory", "AttackScenario",
    "Failure", "FailureType", "Finding", "LogEvent", "Model", "ReplayCase", "ReplayResult",
    "SessionReport", "SessionSummary", "Severity", "TargetPolicy", "TargetSpec", "TestResult",
    "TestStatus", "ToolCall", "Turn", "Verdict",
]
