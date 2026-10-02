"""Trace data contracts: observability log events, replay cases/results, full session report."""
from __future__ import annotations

from pydantic import Field

from app.model.failure import Failure, Finding
from app.model.test import Model, SessionSummary, TestResult, TestStatus, Turn


class LogEvent(Model):
    timestamp: str
    type: str
    message: str


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


# --------------------------------------------------------------------------- report
class SessionReport(Model):
    tests: list[TestResult]
    failures: list[Failure]
    logs: list[LogEvent]
    summary: SessionSummary
    replay_cases: list[ReplayCase]
