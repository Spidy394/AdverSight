"""Strongly-typed event model for live session activity and SSE streaming."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class TestEventType(StrEnum):
    __test__ = False

    SESSION_STARTED = "session_started"
    TEST_STARTED = "test_started"
    ATTACK_GENERATED = "attack_generated"
    REQUEST_SENT = "request_sent"
    AGENT_RESPONSE_RECEIVED = "agent_response_received"
    TOOL_CALL = "tool_call"
    RESPONSE_ANALYZED = "response_analyzed"
    POLICY_CHECK = "policy_check"
    FAILURE_DETECTED = "failure_detected"
    FAILURE_RECORDED = "failure_recorded"
    TEST_PASSED = "test_passed"
    TEST_FAILED = "test_failed"
    SESSION_COMPLETED = "session_completed"
    SESSION_STOPPED = "session_stopped"
    SESSION_ERROR = "session_error"
    SESSION_STATE = "session_state"


class TestEvent(BaseModel):
    """Pydantic model representing an in-flight test event."""

    __test__ = False
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(default_factory=lambda: f"evt_{uuid4().hex[:12]}")
    session_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
    type: TestEventType
    test_id: str | None = None
    message: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
