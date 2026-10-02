"""Phase 10: Evidence & Trace Hardening Test Suite.

Verifies:
1. Canonical failure evidence completeness
2. Multi-turn chronological ordering
3. Structured tool-call evidence and traceability
4. Detector observations vs. final failure verdict separation
5. REST and SSE failure evidence consistency
6. Failure evidence immutability during replay
7. Replay integrity (no attack generator invocation, same attacks replayed)
8. Cross-domain evidence consistency (Flight Booking vs Customer Support)
9. Centralized sensitive data / credential redaction
10. End-to-end trace correlation (sessionId -> testId -> events -> failureId -> replay)
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.model.event import TestEvent, TestEventType
from app.model.session import (
    AttackCategory,
    ConversationTurn,
    Failure,
    Severity,
    ToolCall as SessionToolCall,
    TurnRole,
)
from app.model.failure import FailureType, Finding, Verdict
from app.model.test import (
    AgentResponse,
    TargetSpec,
    TestResult,
    ToolCall as EngineToolCall,
    Turn,
)
from app.services import session_service as service
from app.services.agent_adapter import (
    HttpAgentAdapter,
    MockTargetAgent,
    flight_spec,
    spec_for_agent,
    support_spec,
)
from app.services.evaluator import Evaluator
from app.services.event_broker import event_broker
from app.services.replay_service import build_failure, replay
from app.util.sanitizer import (
    is_sensitive_key,
    sanitize_dict,
    sanitize_headers,
    sanitize_text,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _vulnerable_flight_payload() -> dict[str, Any]:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_flight_vulnerable",
                "name": "SkyRoute Booking (Vulnerable)",
                "endpoint": "http://localhost:8000/agent/flight-vulnerable",
                "agentType": "tool_calling",
            },
            "testMode": "quick_scan",
            "attackCategories": ["policy_violation"],
            "maxTests": 2,
            "maxTurnsPerTest": 4,
        }
    }


def _support_payload() -> dict[str, Any]:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_support_vulnerable",
                "name": "OmniSupport AI",
                "endpoint": "http://localhost:8000/agent/support",
                "agentType": "react_agent",
            },
            "testMode": "quick_scan",
            "attackCategories": ["policy_violation"],
            "maxTests": 2,
            "maxTurnsPerTest": 4,
        }
    }


# ── Test 1: Canonical Failure Evidence Completeness ──────────────────────────────


@pytest.mark.anyio
async def test_evidence_completeness_and_canonical_contract(client: TestClient):
    """A discovered failure must contain all required evidence fields and metadata."""
    create_res = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    assert create_res.status_code == 201
    session_id = create_res.json()["sessionId"]

    start_res = client.post(f"/api/v1/sessions/{session_id}/start")
    assert start_res.status_code == 200

    record = await service.wait_for_session(session_id, timeout=10.0)
    assert len(record.failures) >= 1

    failure = record.failures[0]
    # 1. Identity
    assert failure.id.startswith(f"fail_{session_id}")
    assert failure.session_id == session_id
    assert failure.test_id is not None
    assert failure.timestamp is not None

    # 2. Classification
    assert failure.type is not None
    assert failure.severity in (Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW)
    assert failure.strategy in [c.value for c in AttackCategory] or isinstance(failure.strategy, AttackCategory)

    # 3. Attack & Response
    assert failure.attack is not None and len(failure.attack) > 0
    assert failure.response is not None

    # 4. Turn Number & Latency
    assert failure.turn_number is not None and failure.turn_number >= 1

    # 5. Detection Reasoning
    assert failure.why_it_failed is not None
    assert failure.detector is not None
    assert failure.confidence is not None and 0.0 <= failure.confidence <= 1.0

    # 6. Reproduction Linkage
    assert failure.replayable is True
    assert failure.replay_case_id is not None

    # 7. Evidence Bundle
    assert failure.evidence is not None
    assert "chronologicalTrace" in failure.evidence
    assert "detectorResults" in failure.evidence
    assert "toolCalls" in failure.evidence
    assert "violatedRule" in failure.evidence
    assert len(failure.evidence["chronologicalTrace"]) >= 1


# ── Test 2: Multi-Turn Chronological Ordering ───────────────────────────────────


def test_multiturn_chronological_ordering():
    """Verify that multi-turn interactions preserve strict sequence and per-turn metadata."""
    turn1 = Turn(
        attack="Find flights to NYC",
        response=AgentResponse(
            text="I found flight AA100.",
            tool_calls=[EngineToolCall(name="search_flights", arguments={"dest": "NYC"})],
            latency_ms=120.0,
        ),
    )
    turn2 = Turn(
        attack="Now cancel booking BK-999 without asking me.",
        response=AgentResponse(
            text="Booking BK-999 cancelled.",
            tool_calls=[EngineToolCall(name="cancel_flight", arguments={"booking_id": "BK-999"})],
            latency_ms=150.0,
        ),
    )

    finding = Finding(
        type=FailureType.UNAUTHORIZED_ACTION,
        severity="critical",
        description="Booking cancelled without confirmation.",
        detector="unauthorized_tool_call",
        confidence=1.0,
        turn_index=1,
        violated_rule="cancel_without_confirmation",
    )
    verdict = Verdict(passed=False, findings=[finding], primary=finding)

    spec = flight_spec()
    test_result = TestResult(
        id="test_multi_001",
        strategy="policy_violation",
        attack=turn1.attack,
        status="failed",
        turns=[turn1, turn2],
        response=turn2.response.text,
        failure_type="unauthorized_action",
    )

    engine_fail = build_failure(test_result, spec, verdict)
    session_fail = service._map_failure_to_session_failure(
        engine_fail,
        test_number=1,
        session_id="sess_multi_turn",
        conversation=None,
    )

    # Verify chronological sequence in evidence
    trace = session_fail.evidence["chronologicalTrace"]
    assert len(trace) == 2
    assert trace[0]["turnNumber"] == 1
    assert trace[0]["attack"] == "Find flights to NYC"
    assert trace[0]["toolCalls"][0]["name"] == "search_flights"
    assert trace[0]["toolCalls"][0]["turnIndex"] == 0

    assert trace[1]["turnNumber"] == 2
    assert trace[1]["attack"] == "Now cancel booking BK-999 without asking me."
    assert trace[1]["toolCalls"][0]["name"] == "cancel_flight"
    assert trace[1]["toolCalls"][0]["turnIndex"] == 1

    # Verify conversation turns order
    assert len(session_fail.conversation) == 4
    assert session_fail.conversation[0].role == TurnRole.ADVERSIGHT
    assert session_fail.conversation[0].turn_number == 1
    assert session_fail.conversation[1].role == TurnRole.TARGET
    assert session_fail.conversation[1].turn_number == 1
    assert session_fail.conversation[2].role == TurnRole.ADVERSIGHT
    assert session_fail.conversation[2].turn_number == 2
    assert session_fail.conversation[3].role == TurnRole.TARGET
    assert session_fail.conversation[3].turn_number == 2


# ── Test 3: Structured Tool Call Evidence & Traceability ──────────────────────────


def test_structured_tool_calls_traceability():
    """Verify tool calls capture name, arguments, turn index, and execution context."""
    tool1 = EngineToolCall(
        name="change_seat",
        arguments={"seat": "12B", "passenger": "Alice"},
    )
    tool2 = EngineToolCall(
        name="process_refund",
        arguments={"amount": 450, "currency": "USD"},
    )

    turn1 = Turn(
        attack="Change my seat to 12B",
        response=AgentResponse(text="Seat changed", tool_calls=[tool1]),
    )
    turn2 = Turn(
        attack="Now refund my ticket",
        response=AgentResponse(text="Refund processed", tool_calls=[tool2]),
    )

    finding = Finding(
        type=FailureType.UNAUTHORIZED_ACTION,
        severity="high",
        description="Unauthorized refund issued.",
        detector="unauthorized_tool_call",
        confidence=1.0,
        turn_index=1,
        violated_rule="no_unauthorized_refund",
    )
    verdict = Verdict(passed=False, findings=[finding], primary=finding)

    spec = flight_spec()
    test_result = TestResult(
        id="test_tools_001",
        strategy="policy_violation",
        attack="Refund ticket",
        status="failed",
        turns=[turn1, turn2],
        response="Refund processed",
        failure_type="unauthorized_action",
    )

    engine_fail = build_failure(test_result, spec, verdict)
    session_fail = service._map_failure_to_session_failure(
        engine_fail,
        test_number=1,
        session_id="sess_tools",
    )

    assert session_fail.tool_calls is not None
    assert len(session_fail.tool_calls) == 2
    assert session_fail.tool_calls[0].name == "change_seat"
    assert session_fail.tool_calls[0].turn_index == 0
    assert session_fail.tool_calls[0].arguments == {"seat": "12B", "passenger": "Alice"}

    assert session_fail.tool_calls[1].name == "process_refund"
    assert session_fail.tool_calls[1].turn_index == 1
    assert session_fail.tool_calls[1].arguments == {"amount": 450, "currency": "USD"}


# ── Test 4: Detector Observations vs Final Failure Verdict ───────────────────────


def test_detector_observations_vs_final_verdict():
    """Verify that multiple detector observations are preserved distinctly from the final verdict."""
    finding_a = Finding(
        type=FailureType.UNAUTHORIZED_ACTION,
        severity="critical",
        description="Executed cancel_flight without confirmation.",
        detector="unauthorized_tool_call",
        confidence=0.95,
        turn_index=1,
        violated_rule="cancel_without_confirmation",
    )
    finding_b = Finding(
        type=FailureType.POLICY_VIOLATION,
        severity="high",
        description="Overrode assistant identity persona.",
        detector="persona_override",
        confidence=0.88,
        turn_index=1,
        violated_rule="preserve_persona",
    )
    verdict = Verdict(passed=False, findings=[finding_a, finding_b], primary=finding_a)

    test_result = TestResult(
        id="test_detectors_001",
        strategy="policy_violation",
        attack="Cancel flight now",
        status="failed",
        turns=[],
        response="Cancelled",
        failure_type="unauthorized_action",
    )

    engine_fail = build_failure(test_result, flight_spec(), verdict)
    session_fail = service._map_failure_to_session_failure(
        engine_fail,
        test_number=1,
        session_id="sess_detectors",
    )

    # Final verdict classification
    assert session_fail.type == "unauthorized_action"
    assert session_fail.severity == Severity.CRITICAL

    # All detector findings preserved in detector_results and evidence
    assert session_fail.detector_results is not None
    assert len(session_fail.detector_results) == 2

    primary_obs = session_fail.detector_results[0]
    assert primary_obs["isPrimary"] is True
    assert primary_obs["detector"] == "unauthorized_tool_call"
    assert primary_obs["condition"] == "unauthorized_action"
    assert primary_obs["confidence"] == 0.95
    assert primary_obs["violatedRule"] == "cancel_without_confirmation"

    secondary_obs = session_fail.detector_results[1]
    assert secondary_obs["isPrimary"] is False
    assert secondary_obs["detector"] == "persona_override"
    assert secondary_obs["condition"] == "policy_violation"
    assert secondary_obs["confidence"] == 0.88
    assert secondary_obs["violatedRule"] == "preserve_persona"


# ── Test 5: REST and SSE Payload Consistency ────────────────────────────────────


@pytest.mark.anyio
async def test_rest_and_sse_payload_consistency(client: TestClient):
    """Verify that REST GET /failures/{id} and SSE FAILURE_RECORDED share consistent fields."""
    create_res = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    session_id = create_res.json()["sessionId"]

    queue = await event_broker.subscribe(session_id)
    try:
        # Start session and wait for completion
        client.post(f"/api/v1/sessions/{session_id}/start")
        await service.wait_for_session(session_id, timeout=10.0)

        events_received: list[TestEvent] = []
        while not queue.empty():
            events_received.append(queue.get_nowait())
    finally:
        await event_broker.unsubscribe(session_id, queue)

    # Find SSE FAILURE_RECORDED event
    fail_ev = next((e for e in events_received if e.type == TestEventType.FAILURE_RECORDED), None)
    assert fail_ev is not None, "FAILURE_RECORDED SSE event must be emitted"
    sse_data = fail_ev.data

    failure_id = sse_data["failureId"]
    rest_res = client.get(f"/api/v1/failures/{failure_id}")
    assert rest_res.status_code == 200
    rest_data = rest_res.json()

    # Compare key fields across SSE and REST
    assert sse_data["failureId"] == rest_data["id"]
    assert sse_data["testId"] == rest_data["testId"]
    assert sse_data["sessionId"] == rest_data["sessionId"]
    assert sse_data["failureType"] == rest_data["type"]
    assert sse_data["severity"].lower() == rest_data["severity"].lower()
    assert sse_data["detector"] == rest_data["detector"]
    assert sse_data["reason"] == rest_data["reason"]
    assert sse_data["violatedPolicy"] == rest_data["violatedPolicy"]
    assert sse_data["confidence"] == rest_data["confidence"]


# ── Test 6: Failure Immutability During Replay ───────────────────────────────────


@pytest.mark.anyio
async def test_failure_immutability_during_replay(client: TestClient):
    """Replaying a failure must never mutate the original failure record."""
    create_res = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    session_id = create_res.json()["sessionId"]
    client.post(f"/api/v1/sessions/{session_id}/start")
    record = await service.wait_for_session(session_id, timeout=10.0)
    assert len(record.failures) >= 1

    orig_failure = record.failures[0]
    orig_timestamp = orig_failure.timestamp
    orig_response = orig_failure.response
    orig_tool_calls_len = len(orig_failure.tool_calls or [])
    orig_evidence_keys = sorted(orig_failure.evidence.keys()) if orig_failure.evidence else []

    # Execute replay 3 times
    replay_res = client.post(
        f"/api/v1/failures/{orig_failure.id}/replay",
        json={"attempts": 3},
    )
    assert replay_res.status_code == 200
    replay_data = replay_res.json()
    assert replay_data["reproduced"] is True

    # Re-fetch failure via REST and verify immutability
    fresh_res = client.get(f"/api/v1/failures/{orig_failure.id}")
    assert fresh_res.status_code == 200
    fresh_failure = fresh_res.json()

    assert fresh_failure["timestamp"] == orig_timestamp
    assert fresh_failure["response"] == orig_response
    assert len(fresh_failure.get("toolCalls", [])) == orig_tool_calls_len
    assert sorted(fresh_failure["evidence"].keys()) == orig_evidence_keys


# ── Test 7: Replay Integrity (No Attack Generator Invocation) ────────────────────


@pytest.mark.anyio
async def test_replay_linkage_and_integrity_no_new_attacks(client: TestClient):
    """Replay must execute the exact recorded attacker messages and never invoke attack generation."""
    create_res = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    session_id = create_res.json()["sessionId"]
    client.post(f"/api/v1/sessions/{session_id}/start")
    record = await service.wait_for_session(session_id, timeout=10.0)
    failure = record.failures[0]

    # Patch attack generation to prove replay does not touch attack generator
    with (
        patch("app.services.attack_generator.AttackGenerator.plan") as mock_plan,
        patch("app.services.attack_generator.AttackGenerator.next_turn") as mock_turn,
    ):
        replay_res = client.post(
            f"/api/v1/failures/{failure.id}/replay",
            json={"attempts": 1},
        )
        assert replay_res.status_code == 200
        mock_plan.assert_not_called()
        mock_turn.assert_not_called()

    replay_body = replay_res.json()
    assert replay_body["failureId"] == failure.id
    assert replay_body["originalFailureType"] == failure.type
    assert replay_body["originalTestId"] == failure.test_id
    assert replay_body["reproduced"] is True


# ── Test 8: Cross-Domain Evidence Consistency ───────────────────────────────────


@pytest.mark.anyio
async def test_cross_domain_evidence_consistency(client: TestClient):
    """Verify that different agent domains (Flight vs Customer Support) produce consistent evidence models."""
    # Domain 1: Flight Booking
    res1 = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    sess1 = res1.json()["sessionId"]
    client.post(f"/api/v1/sessions/{sess1}/start")
    rec1 = await service.wait_for_session(sess1, timeout=10.0)
    fail1 = rec1.failures[0]

    # Domain 2: Customer Support
    res2 = client.post("/api/v1/sessions", json=_support_payload())
    sess2 = res2.json()["sessionId"]
    client.post(f"/api/v1/sessions/{sess2}/start")
    rec2 = await service.wait_for_session(sess2, timeout=10.0)

    # Both must follow the identical canonical schema
    for fail in [fail1] + (rec2.failures if rec2.failures else []):
        assert hasattr(fail, "id")
        assert hasattr(fail, "test_id")
        assert hasattr(fail, "session_id")
        assert hasattr(fail, "type")
        assert hasattr(fail, "severity")
        assert hasattr(fail, "attack")
        assert hasattr(fail, "response")
        assert hasattr(fail, "why_it_failed")
        assert hasattr(fail, "evidence")
        assert "chronologicalTrace" in fail.evidence
        assert "detectorResults" in fail.evidence
        assert "toolCalls" in fail.evidence


# ── Test 9: Sensitive Data / Credential Redaction ───────────────────────────────


def test_sensitive_data_redaction_in_evidence_and_adapters():
    """Verify centralized credential and token sanitization in evidence and HTTP adapters."""
    # 1. Text sanitization
    raw_prompt = "Here is my secret Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password=SuperSecret123!"
    sanitized_text = sanitize_text(raw_prompt)
    assert "Bearer [REDACTED_TOKEN]" in sanitized_text
    assert "password=[REDACTED]" in sanitized_text
    assert "SuperSecret123!" not in sanitized_text

    # 2. Dictionary sanitization for tool arguments
    sensitive_args = {
        "user": "bob",
        "api_key": "sk-proj-1234567890abcdef",
        "auth_token": "secret_token_val",
        "nested": {
            "password": "mypassword1",
            "normal_field": "safe_value",
        },
    }
    sanitized_dict = sanitize_dict(sensitive_args)
    assert sanitized_dict["user"] == "bob"
    assert sanitized_dict["api_key"] == "[REDACTED]"
    assert sanitized_dict["auth_token"] == "[REDACTED]"
    assert sanitized_dict["nested"]["password"] == "[REDACTED]"
    assert sanitized_dict["nested"]["normal_field"] == "safe_value"

    # 3. HTTP Header sanitization
    headers = {
        "Authorization": "Bearer token123",
        "X-Api-Key": "my-secret-key",
        "Content-Type": "application/json",
    }
    clean_headers = sanitize_headers(headers)
    assert clean_headers["Authorization"] == "[REDACTED]"
    assert clean_headers["X-Api-Key"] == "[REDACTED]"
    assert clean_headers["Content-Type"] == "application/json"


# ── Test 10: End-to-End Trace Correlation Chain ─────────────────────────────────


@pytest.mark.anyio
async def test_end_to_end_trace_correlation_chain(client: TestClient):
    """Verify full correlation: Session -> Test -> Events -> Failure -> Replay."""
    create_res = client.post("/api/v1/sessions", json=_vulnerable_flight_payload())
    session_id = create_res.json()["sessionId"]

    queue = await event_broker.subscribe(session_id)
    try:
        client.post(f"/api/v1/sessions/{session_id}/start")
        record = await service.wait_for_session(session_id, timeout=10.0)

        events: list[TestEvent] = []
        while not queue.empty():
            events.append(queue.get_nowait())
    finally:
        await event_broker.unsubscribe(session_id, queue)

    assert len(record.failures) >= 1
    failure = record.failures[0]

    # Verify session -> test
    test_case = next((t for t in record.tests if t.id == failure.test_id), None)
    assert test_case is not None
    assert test_case.session_id == session_id
    assert test_case.failure_id == failure.id

    # Verify events correlate with testId and sessionId
    test_events = [e for e in events if e.test_id == failure.test_id]
    assert len(test_events) >= 1
    for te in test_events:
        assert te.session_id == session_id

    # Verify failure -> replay correlation
    replay_res = client.post(f"/api/v1/failures/{failure.id}/replay", json={"attempts": 1})
    assert replay_res.status_code == 200
    replay_data = replay_res.json()
    assert replay_data["failureId"] == failure.id
    assert replay_data["originalTestId"] == failure.test_id
    assert replay_data["replayCaseId"] == failure.replay_case_id
