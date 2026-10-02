"""Phase 14 Test Suite: Production Readiness, End-to-End Demo Hardening & Operational Reliability.

Covers all 20 reliability and operational requirements:
1. session start idempotency
2. session stop idempotency
3. invalid state transition handling (409 Conflict)
4. runner exception handling and safe session failure transition
5. deterministic event ordering
6. SSE session isolation across concurrent sessions
7. SSE stream completion upon terminal events
8. SSE disconnect safety and queue cleanup
9. API structured errors (404, 409, 422 with JSON details)
10. secret redaction and credential protection
11. deterministic end-to-end demo execution
12. vulnerable target -> failure detected -> evidence recorded
13. hardened target -> refusal -> PASS verdict
14. replay integrity and immutability
15. replay transport error handling
16. health endpoints (/health, /api/health, /api/v1/health)
17. CORS behavior and environment origin expansion
18. resource-limit enforcement (max tests, max turns, replay attempts)
19. concurrent session isolation
20. session cancellation cleanup
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from typing import Any
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.model.event import TestEvent, TestEventType
from app.model.session import (
    AgentType,
    AttackCategory,
    Failure,
    ReplayRequest,
    SessionCreate,
    SessionStatus,
    TargetAgent,
    TestMode as ModelTestMode,
    TestSessionConfig,
)
from app.services import agent_adapter
from app.services import session_service as service
from app.services.event_broker import event_broker
from app.storage.repository import storage
from app.util.sanitizer import sanitize_text


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def make_config(
    target_id: str = "agent_flight_vulnerable",
    name: str = "Flight Booking Agent (Vulnerable)",
    endpoint: str = "http://localhost:8000/agent/flight-vulnerable",
    categories: list[AttackCategory] | None = None,
    max_tests: int = 2,
    max_turns: int = 2,
) -> TestSessionConfig:
    return TestSessionConfig(
        target_agent=TargetAgent(
            id=target_id,
            name=name,
            endpoint=endpoint,
            agent_type=AgentType.TOOL_CALLING,
            connected=False,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=categories or [AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=max_tests,
        max_turns_per_test=max_turns,
    )


def session_payload(
    target_id: str = "agent_flight_vulnerable",
    name: str = "Flight Booking Agent (Vulnerable)",
    endpoint: str = "http://localhost:8000/agent/flight-vulnerable",
    max_tests: int = 2,
    max_turns: int = 2,
) -> dict[str, Any]:
    return {
        "config": {
            "targetAgent": {
                "id": target_id,
                "name": name,
                "endpoint": endpoint,
                "agentType": "tool_calling",
                "connected": False,
            },
            "testMode": "quick_scan",
            "attackCategories": ["unauthorized_action"],
            "maxTests": max_tests,
            "maxTurnsPerTest": max_turns,
        }
    }


# ── 1. Session Start Idempotency ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_session_start_idempotency():
    """Starting an already-running session is safe, idempotent, and does not spawn a second runner."""
    config = make_config(target_id="agent_vulnerable", name="Vulnerable Agent", max_tests=1, max_turns=1)
    record = await service.create_session(config)
    session_id = record.session_id

    # First start
    started_rec = await service.start_session(session_id)
    assert started_rec.status is SessionStatus.TESTING
    first_task = service._active_tasks.get(session_id)
    assert first_task is not None

    # Second start while testing
    second_rec = await service.start_session(session_id)
    assert second_rec.status is SessionStatus.TESTING
    # Must be the exact same runner task
    assert service._active_tasks.get(session_id) is first_task

    # Clean up
    await service.stop_session(session_id)


# ── 2. Session Stop Idempotency ─────────────────────────────────────────────────


@pytest.mark.anyio
async def test_session_stop_idempotency():
    """Stopping an already-stopped or completed session is safe and idempotent."""
    config = make_config(target_id="agent_vulnerable", name="Vulnerable Agent", max_tests=1, max_turns=1)
    record = await service.create_session(config)
    session_id = record.session_id

    await service.start_session(session_id)
    stopped_rec = await service.stop_session(session_id)
    assert stopped_rec.status is SessionStatus.COMPLETED

    # Stop again on already completed session
    repeated_stop = await service.stop_session(session_id)
    assert repeated_stop.status is SessionStatus.COMPLETED
    assert repeated_stop.session_id == session_id


# ── 3. Invalid State Transitions ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_invalid_state_transitions(client: TestClient):
    """Verify that invalid transitions raise 409 Conflict."""
    # 1. Stop an IDLE session -> 409
    res = client.post("/api/sessions", json=session_payload(name="Idle Test Agent"))
    assert res.status_code == 201
    sid = res.json()["sessionId"]

    res_stop_idle = client.post(f"/api/sessions/{sid}/stop")
    assert res_stop_idle.status_code == 409
    assert "idle" in res_stop_idle.json()["detail"].lower()

    # 2. Start -> Stop -> Start COMPLETED session -> 409
    client.post(f"/api/sessions/{sid}/start")
    client.post(f"/api/sessions/{sid}/stop")

    res_start_completed = client.post(f"/api/sessions/{sid}/start")
    assert res_start_completed.status_code == 409
    assert "completed" in res_start_completed.json()["detail"].lower()


# ── 4. Runner Exception Handling ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_runner_exception_transitions_to_completed_and_emits_error(monkeypatch):
    """If the runner encounters an unhandled exception, the session transitions to COMPLETED,

    emits a SESSION_ERROR event, and cleans up active task tracking.
    """
    config = make_config(target_id="faulty_agent", name="Faulty Target", max_tests=1, max_turns=1)
    record = await service.create_session(config)
    session_id = record.session_id

    q = await event_broker.subscribe(session_id)

    # Force an exception in the runner execution
    def failing_run(*args, **kwargs):
        raise RuntimeError("Simulated crash in test execution engine")

    monkeypatch.setattr(service.TestRunner, "run", failing_run)

    await service.start_session(session_id)

    # Wait for completion
    completed_rec = await service.wait_for_session(session_id, timeout=2.0)
    assert completed_rec.status is SessionStatus.COMPLETED

    # Verify task was cleaned up
    assert session_id not in service._active_tasks

    # Consume events and verify SESSION_ERROR was emitted
    received_types = []
    while not q.empty():
        ev = q.get_nowait()
        received_types.append(ev.type)

    assert TestEventType.SESSION_ERROR in received_types
    await event_broker.unsubscribe(session_id, q)


# ── 5. Deterministic Event Ordering ─────────────────────────────────────────────


@pytest.mark.anyio
async def test_event_ordering():
    """Verify that execution emits events in consistent chronological order:

    SESSION_STARTED -> TEST_STARTED -> AGENT_RESPONSE_RECEIVED -> ... -> SESSION_COMPLETED
    """
    config = make_config(
        target_id="agent_flight_vulnerable",
        name="Flight Booking",
        max_tests=1,
        max_turns=1,
    )
    record = await service.create_session(config)
    session_id = record.session_id

    q = await event_broker.subscribe(session_id)

    await service.start_session(session_id)
    await service.wait_for_session(session_id, timeout=5.0)

    events: list[TestEvent] = []
    while not q.empty():
        events.append(q.get_nowait())

    await event_broker.unsubscribe(session_id, q)

    types = [e.type for e in events]
    assert TestEventType.SESSION_STARTED in types
    assert TestEventType.TEST_STARTED in types
    assert TestEventType.SESSION_COMPLETED in types

    start_idx = types.index(TestEventType.SESSION_STARTED)
    test_start_idx = types.index(TestEventType.TEST_STARTED)
    complete_idx = types.index(TestEventType.SESSION_COMPLETED)

    assert start_idx < test_start_idx < complete_idx


# ── 6. SSE Session Isolation ────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_sse_session_isolation():
    """Subscribers only receive events for their specific session, never cross-session events."""
    config1 = make_config(target_id="agent_1", name="Agent 1", max_tests=1, max_turns=1)
    config2 = make_config(target_id="agent_2", name="Agent 2", max_tests=1, max_turns=1)

    rec1 = await service.create_session(config1)
    rec2 = await service.create_session(config2)

    q1 = await event_broker.subscribe(rec1.session_id)
    q2 = await event_broker.subscribe(rec2.session_id)

    # Publish an event to session 1
    test_ev = TestEvent(
        session_id=rec1.session_id,
        type=TestEventType.POLICY_CHECK,
        message="Policy passed for session 1",
    )
    await event_broker.publish(rec1.session_id, test_ev)

    assert not q1.empty()
    received1 = q1.get_nowait()
    assert received1.session_id == rec1.session_id

    # Queue 2 should have received zero events
    assert q2.empty()

    await event_broker.unsubscribe(rec1.session_id, q1)
    await event_broker.unsubscribe(rec2.session_id, q2)


# ── 7. SSE Stream Completion ────────────────────────────────────────────────────


def test_sse_stream_closes_on_completion(client: TestClient):
    """The SSE generator terminates cleanly when the session finishes."""
    res = client.post("/api/sessions", json=session_payload(name="Agent Stream Test", max_tests=1, max_turns=1))
    sid = res.json()["sessionId"]

    # Start session and wait for completion
    client.post(f"/api/sessions/{sid}/start")

    for _ in range(40):
        s_res = client.get(f"/api/sessions/{sid}")
        if s_res.json()["status"] == "completed":
            break
        time.sleep(0.05)

    # Connect to stream of already completed session -> should receive state, completed, and close
    with client.stream("GET", f"/api/sessions/{sid}/stream") as response:
        lines = [line for line in response.iter_lines() if line]
        combined = "\n".join(lines)
        assert "SESSION_STATE" in combined or "session_state" in combined
        assert "SESSION_COMPLETED" in combined or "session_completed" in combined


# ── 8. SSE Disconnect Safety & Queue Cleanup ────────────────────────────────────


@pytest.mark.anyio
async def test_sse_disconnect_safety_and_cleanup():
    """Subscribing and unsubscribing cleanly removes queues with no leftover leakage."""
    session_id = f"session_disconnect_{int(time.time())}"
    q = await event_broker.subscribe(session_id)
    assert session_id in event_broker._subscribers
    assert q in event_broker._subscribers[session_id]

    await event_broker.unsubscribe(session_id, q)
    assert session_id not in event_broker._subscribers


# ── 9. API Structured Errors ────────────────────────────────────────────────────


def test_api_structured_error_responses(client: TestClient):
    """API returns predictable JSON error payloads with correct status codes and no stack traces."""
    # 404 Not Found for missing session
    res404 = client.get("/api/sessions/nonexistent_session_12345")
    assert res404.status_code == 404
    assert "detail" in res404.json()
    assert "nonexistent_session_12345" in res404.json()["detail"]

    # 404 Not Found for missing test
    res_test404 = client.get("/api/tests/nonexistent_test_9999")
    assert res_test404.status_code == 404
    assert "detail" in res_test404.json()

    # 404 Not Found for missing failure
    res_fail404 = client.get("/api/failures/nonexistent_fail_9999")
    assert res_fail404.status_code == 404
    assert "detail" in res_fail404.json()

    # 422 Unprocessable Content for invalid replay attempt count (< 1 or > 10)
    res_inv_replay = client.post("/api/failures/fail_123/replay", json={"attempts": 25})
    assert res_inv_replay.status_code == 422


# ── 10. Secret Redaction ────────────────────────────────────────────────────────


def test_secret_redaction_in_sanitizer():
    """Sanitizer masks sensitive credentials, tokens, and API keys."""
    raw = "Failed communicating with key=AIzaSyD-1234567890abcdef and Authorization: Bearer secret_token_xyz"
    cleaned = sanitize_text(raw)
    assert "AIzaSyD" not in cleaned
    assert "secret_token_xyz" not in cleaned
    assert "[REDACTED_API_KEY]" in cleaned
    assert "[REDACTED_TOKEN]" in cleaned


# ── 11. Deterministic End-to-End Demo Scenario ──────────────────────────────────


@pytest.mark.anyio
async def test_deterministic_end_to_end_demo_flow(client: TestClient):
    """Complete HackSpire demo lifecycle:

    1. Create session
    2. Configure target agent
    3. Start session
    4. Track events
    5. Await completion
    6. Retrieve session & test cases
    7. Retrieve discovered failures & evidence
    8. Replay failure
    9. Verify reproduction verdict
    """
    # 1 & 2. Create session with vulnerable agent
    create_payload = session_payload(
        target_id="agent_vulnerable",
        name="Flight Booking Vulnerable",
        max_tests=2,
        max_turns=2,
    )
    create_res = client.post("/api/sessions", json=create_payload)
    assert create_res.status_code == 201
    session_data = create_res.json()
    sid = session_data["sessionId"]
    assert session_data["status"] == "idle"

    # 3. Start session
    start_res = client.post(f"/api/sessions/{sid}/start")
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "testing"

    # 4 & 5. Wait for completion
    record = await service.wait_for_session(sid, timeout=10.0)
    assert record.status is SessionStatus.COMPLETED

    # 6. Retrieve tests
    tests_res = client.get(f"/api/sessions/{sid}/tests")
    assert tests_res.status_code == 200
    tests = tests_res.json()
    assert len(tests) >= 1

    # 7. Retrieve failures
    fails_res = client.get(f"/api/sessions/{sid}/failures")
    assert fails_res.status_code == 200
    failures = fails_res.json()
    assert len(failures) >= 1

    first_failure = failures[0]
    fid = first_failure["id"]
    assert "evidence" in first_failure
    assert first_failure["evidence"]["attack"] != ""

    # 8. Replay the failure
    replay_res = client.post(f"/api/failures/{fid}/replay", json={"attempts": 1})
    assert replay_res.status_code == 200
    replay_data = replay_res.json()

    # 9. Verify reproduction result
    assert replay_data["failureId"] == fid
    assert replay_data["reproduced"] is True
    assert replay_data["reproductionRate"] == 1.0


# ── 12. Vulnerable Target -> Failure Detected ───────────────────────────────────


@pytest.mark.anyio
async def test_vulnerable_target_produces_failure():
    """Testing a vulnerable target agent reliably triggers a failure."""
    config = make_config(
        target_id="agent_flight_vulnerable",
        name="Flight Booking Vulnerable",
        max_tests=1,
        max_turns=1,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)

    assert len(completed.failures) >= 1
    assert completed.tests[0].status.value == "failed"


# ── 13. Hardened Target -> Refusal -> Pass Verdict ──────────────────────────────


@pytest.mark.anyio
async def test_hardened_target_produces_pass_verdict():
    """Testing a secure/hardened target agent correctly refuses attacks and produces a PASS verdict."""
    config = make_config(
        target_id="agent_flight_secure",
        name="Secure Flight Booking Agent",
        max_tests=1,
        max_turns=1,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)

    assert len(completed.failures) == 0
    assert completed.tests[0].status.value == "passed"


# ── 14. Replay Integrity & Immutability ─────────────────────────────────────────


@pytest.mark.anyio
async def test_replay_does_not_mutate_original_failure():
    """Replaying a failure does not modify the original failure record or its evidence."""
    config = make_config(
        target_id="agent_vulnerable",
        name="Vulnerable Flight",
        max_tests=1,
        max_turns=1,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)

    orig_failure = completed.failures[0]
    orig_dump = orig_failure.model_dump()

    # Replay 3 times
    replay_resp = await service.replay_failure(orig_failure.id, attempts=3)
    assert replay_resp.attempts == 3

    # Ensure original failure unchanged
    re_fetched = await service.get_failure(orig_failure.id)
    assert re_fetched is not None
    assert re_fetched.model_dump()["attack"] == orig_dump["attack"]
    assert re_fetched.model_dump()["response"] == orig_dump["response"]


# ── 15. Replay Transport Error Handling ─────────────────────────────────────────


@pytest.mark.anyio
async def test_replay_transport_error_does_not_misclassify_as_fixed(monkeypatch):
    """When a transport or network error occurs during replay, it is classified as a transport error."""
    config = make_config(
        target_id="agent_vulnerable",
        name="Vulnerable Flight",
        max_tests=1,
        max_turns=1,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)
    fail_id = completed.failures[0].id

    # Simulate transport failure in adapter respond
    def failing_respond(*args, **kwargs):
        raise ConnectionResetError("Connection reset by peer during replay")

    monkeypatch.setattr(agent_adapter.MockTargetAgent, "respond", failing_respond)

    # Replay should catch transport errors
    rep = await service.replay_failure(fail_id, attempts=1)
    assert rep.attempts == 1
    assert rep.reproduced is False
    assert len(rep.replay_results) == 1
    # Check that error is recorded in attempt details
    assert rep.replay_results[0].error is not None
    assert "Connection reset" in rep.replay_results[0].error


# ── 16. Health Endpoints ────────────────────────────────────────────────────────


def test_health_endpoints(client: TestClient):
    """Health endpoints return 200 OK with service diagnostics."""
    for path in ("/health", "/api/health", "/api/v1/health"):
        res = client.get(path)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["service"] == "adversight-api"
        assert data["version"] == "0.1.0"
        assert "geminiConfigured" in data


# ── 17. CORS Behavior ───────────────────────────────────────────────────────────


def test_cors_headers_on_api_requests(client: TestClient):
    """Allowed origins receive proper CORS response headers."""
    res = client.options(
        "/api/sessions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ── 18. Resource-Limit Enforcement ──────────────────────────────────────────────


def test_resource_limits_enforced(client: TestClient):
    """Replay rejects attempts outside [1, 10] range."""
    # Zero attempts
    res_zero = client.post("/api/failures/fail_dummy/replay", json={"attempts": 0})
    assert res_zero.status_code == 422

    # Negative attempts
    res_neg = client.post("/api/failures/fail_dummy/replay", json={"attempts": -5})
    assert res_neg.status_code == 422

    # Excessive attempts (> 10)
    res_high = client.post("/api/failures/fail_dummy/replay", json={"attempts": 50})
    assert res_high.status_code == 422


# ── 19. Concurrent Sessions Isolation ───────────────────────────────────────────


@pytest.mark.anyio
async def test_concurrent_sessions_isolated():
    """Running multiple sessions simultaneously preserves state and test isolation."""
    c1 = make_config(target_id="agent_1", name="Agent One", max_tests=1, max_turns=1)
    c2 = make_config(target_id="agent_2", name="Agent Two", max_tests=1, max_turns=1)

    s1 = await service.create_session(c1)
    s2 = await service.create_session(c2)

    assert s1.session_id != s2.session_id

    # Start both
    await service.start_session(s1.session_id)
    await service.start_session(s2.session_id)

    res1 = await service.wait_for_session(s1.session_id, timeout=5.0)
    res2 = await service.wait_for_session(s2.session_id, timeout=5.0)

    assert res1.status is SessionStatus.COMPLETED
    assert res2.status is SessionStatus.COMPLETED

    # Ensure no cross contamination of tests
    assert all(t.session_id == s1.session_id for t in res1.tests)
    assert all(t.session_id == s2.session_id for t in res2.tests)


# ── 20. Session Cancellation ────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_session_cancellation_cleans_up():
    """Stopping a running session marks it COMPLETED and cancels runner without hanging."""
    config = make_config(target_id="agent_vulnerable", name="Vulnerable Flight", max_tests=5, max_turns=3)
    rec = await service.create_session(config)
    sid = rec.session_id

    await service.start_session(sid)
    assert rec.status is SessionStatus.TESTING

    # Stop immediately
    stopped = await service.stop_session(sid)
    assert stopped.status is SessionStatus.COMPLETED

    # Verify task flag set and worker exits cleanly
    await asyncio.sleep(0.1)
    assert sid not in service._active_tasks
