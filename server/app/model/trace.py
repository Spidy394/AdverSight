"""Trace data contracts: observability log events, replay cases/results, full session report."""
from __future__ import annotations

from typing import Any

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


class ReplayAttempt(Model):
    attempt_number: int
    reproduced: bool
    status: str = "not_reproduced"
    failure_type: str | None = None
    turns: list[Turn] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    error: str | None = None


class ReplayResult(Model):
    replay_case_id: str
    reproduced: bool
    status: TestStatus
    findings: list[Finding] = Field(default_factory=list)
    turns: list[Turn] = Field(default_factory=list)
    attempts: int = 1
    completed_attempts: int = 1
    reproduced_count: int = 0
    reproduction_rate: float = 0.0  # LLM targets are non-deterministic: report how often it recurs
    reproducibility: str = "untested"
    attempt_details: list[ReplayAttempt] = Field(default_factory=list)


# --------------------------------------------------------------------------- report
class SessionReport(Model):
    tests: list[TestResult]
    failures: list[Failure]
    logs: list[LogEvent]
    summary: SessionSummary
    replay_cases: list[ReplayCase]
    adaptive_summary: dict[str, Any] | None = None
