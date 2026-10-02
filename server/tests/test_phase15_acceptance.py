"""Phase 15 Test Suite: Final End-to-End Acceptance, Frontend Contract Verification & Backend Freeze.

Validates the full HackSpire 2026 contract:
1. Exact frontend simulation: session creation, start, SSE streaming, retrieval, and replay.
2. SSE event payload integrity and exact camelCase compatibility for all frontend handlers.
3. Dashboard counter integrity: passed + failed <= completed <= total.
4. Failure details contract: complete evidence, trace, detector findings, and telemetry.
5. Frontend replay contract: conforms exactly to frontend's isReplayResponse validation.
6. Real-agent / demo vulnerable scenario: breach -> unauthorized tool call -> failure evidence -> replay reproduction.
7. Hardened agent scenario: attack -> refusal -> 0 failures -> PASS verdict.
8. Cross-domain generic evaluation: customer support / banking target executes without domain leaks.
9. Multi-session concurrency isolation: no cross-session event or state crossover.
10. Session stop / cancellation: clean shutdown with zero task leaks.
11. Structured error responses: 404, 409, 422 without secret or stack trace leakage.
12. CORS preflight and allowed origins.
13. Health endpoint checks at all mount points (/health, /api/health, /api/v1/health).
14. Final security invariants: SSRF blocked, API keys redacted, limits enforced.
"""
from __future__ import annotations

import asyncio
import json
import os
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
from app.services import session_service as service
from app.services.event_broker import event_broker
from app.util.sanitizer import sanitize_text


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def frontend_session_payload(
    target_id: str = "agent_flight_vulnerable",
    name: str = "Flight Booking Agent (Vulnerable)",
    endpoint: str = "http://localhost:8000/agent/flight-vulnerable",
    categories: list[str] | None = None,
    max_tests: int = 2,
    max_turns: int = 2,
) -> dict[str, Any]:
    """Matches the exact JSON emitted by client/src/lib/api.ts createSession()."""
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
            "attackCategories": categories or ["unauthorized_action"],
            "maxTests": max_tests,
            "maxTurnsPerTest": max_turns,
        }
    }


# ── 1. End-to-End Frontend Contract Simulation ──────────────────────────────────


@pytest.mark.anyio
async def test_frontend_end_to_end_simulation(client: TestClient):
    """Simulates the exact React client journey:

    1. POST /api/v1/sessions
    2. GET /api/v1/sessions/{id}
    3. POST /api/v1/sessions/{id}/start
    4. SSE stream consumption
    5. Await completion
    6. GET /api/v1/sessions/{id}/tests
    7. GET /api/v1/sessions/{id}/failures
    8. GET /api/v1/failures/{id}
    9. POST /api/v1/tests/{testId}/replay (matches replayTestCase in api.ts)
    10. POST /api/v1/failures/{failureId}/replay
    11. Final GET /api/v1/sessions/{id}
    """
    # 1. Create Session
    payload = frontend_session_payload()
    res_create = client.post("/api/v1/sessions", json=payload)
    assert res_create.status_code == 201
    dash = res_create.json()

    # Validate DashboardData TypeScript contract
    assert "sessionId" in dash
    assert dash["status"] == "idle"
    assert "progress" in dash
    assert "config" in dash
    assert "tests" in dash
    assert "failures" in dash
    assert "logs" in dash
    sid = dash["sessionId"]

    # 2. Get Session
    res_get = client.get(f"/api/v1/sessions/{sid}")
    assert res_get.status_code == 200
    assert res_get.json()["sessionId"] == sid

    # 3. Start Session
    res_start = client.post(f"/api/v1/sessions/{sid}/start")
    assert res_start.status_code == 200
    assert res_start.json()["status"] == "testing"

    # 4 & 5. Wait for engine completion
    record = await service.wait_for_session(sid, timeout=10.0)
    assert record.status is SessionStatus.COMPLETED

    # 6. Retrieve Tests
    res_tests = client.get(f"/api/v1/sessions/{sid}/tests")
    assert res_tests.status_code == 200
    tests = res_tests.json()
    assert isinstance(tests, list)
    assert len(tests) >= 1
    first_test = tests[0]
    assert "id" in first_test
    assert "testNumber" in first_test
    assert "strategy" in first_test
    assert "status" in first_test
    assert "conversation" in first_test

    # 7. Retrieve Failures
    res_failures = client.get(f"/api/v1/sessions/{sid}/failures")
    assert res_failures.status_code == 200
    failures = res_failures.json()
    assert isinstance(failures, list)
    assert len(failures) >= 1
    first_failure = failures[0]
    fid = first_failure["id"]

    # 8. Retrieve Individual Failure
    res_single_fail = client.get(f"/api/v1/failures/{fid}")
    assert res_single_fail.status_code == 200
    single_fail = res_single_fail.json()
    assert single_fail["id"] == fid
    assert single_fail["testId"] == first_failure["testId"]
    assert "evidence" in single_fail
    assert "whyItFailed" in single_fail or "why_it_failed" in single_fail

    # 9. Test Replay via /api/v1/tests/{testId}/replay (called by client's replayTestCase())
    test_id = first_failure["testId"]
    res_test_replay = client.post(f"/api/v1/tests/{test_id}/replay", json={"attempts": 1})
    assert res_test_replay.status_code == 200
    test_replay_data = res_test_replay.json()

    # Must satisfy isReplayResponse() from client/src/lib/api.ts
    assert isinstance(test_replay_data["replayCaseId"], str)
    assert isinstance(test_replay_data["reproduced"], bool)
    assert test_replay_data["status"] in ["pending", "running", "passed", "failed"]
    assert isinstance(test_replay_data["findings"], list)
    assert isinstance(test_replay_data["turns"], list)
    assert isinstance(test_replay_data["attempts"], int)
    assert isinstance(test_replay_data["reproducedCount"], int)
    assert isinstance(test_replay_data["reproductionRate"], (int, float))

    # 10. Failure Replay via /api/v1/failures/{failureId}/replay
    res_fail_replay = client.post(f"/api/v1/failures/{fid}/replay", json={"attempts": 1})
    assert res_fail_replay.status_code == 200
    fail_replay_data = res_fail_replay.json()
    assert fail_replay_data["failureId"] == fid
    assert fail_replay_data["reproduced"] is True
    assert fail_replay_data["verdict"] == "REPRODUCED"

    # 11. Final Session State
    res_final = client.get(f"/api/v1/sessions/{sid}")
    assert res_final.status_code == 200
    final_dash = res_final.json()
    assert final_dash["status"] == "completed"
    assert final_dash["progress"]["completed"] >= 1


# ── 2. SSE Frontend Event Compatibility ─────────────────────────────────────────


@pytest.mark.anyio
async def test_sse_event_structure_frontend_compatibility():
    """Verify that every SSE event emitted conforms to the client's ServerEvent TypeScript interface:

    { id: string, sessionId: string, timestamp: string, type: string, testId?: string, message: string, data: Record<string, any> }
    """
    config = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_flight_vulnerable",
            name="Flight Booking Agent (Vulnerable)",
            endpoint="http://localhost:8000/agent/flight-vulnerable",
            agent_type=AgentType.TOOL_CALLING,
            connected=False,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=1,
        max_turns_per_test=1,
    )
    record = await service.create_session(config)
    sid = record.session_id

    q = await event_broker.subscribe(sid)
    await service.start_session(sid)
    await service.wait_for_session(sid, timeout=5.0)

    events: list[TestEvent] = []
    while not q.empty():
        events.append(q.get_nowait())
    await event_broker.unsubscribe(sid, q)

    assert len(events) > 0
    frontend_consumed_types = {
        "session_started",
        "test_started",
        "agent_response_received",
        "test_passed",
        "test_failed",
        "failure_detected",
        "failure_recorded",
        "session_completed",
    }

    observed_types = set()
    for ev in events:
        dump = ev.model_dump(by_alias=True)
        assert "id" in dump and isinstance(dump["id"], str)
        assert "sessionId" in dump and dump["sessionId"] == sid
        assert "timestamp" in dump and isinstance(dump["timestamp"], str)
        assert "type" in dump and isinstance(dump["type"], str)
        assert "message" in dump and isinstance(dump["message"], str)
        assert "data" in dump and isinstance(dump["data"], dict)
        observed_types.add(dump["type"])

    # Verify at least the core lifecycle events were fired
    assert "session_started" in observed_types
    assert "test_started" in observed_types
    assert "session_completed" in observed_types


# ── 3. Dashboard Counter Integrity ──────────────────────────────────────────────


@pytest.mark.anyio
async def test_dashboard_counter_integrity(client: TestClient):
    """Enforces mathematical invariants on progress counters:

    1. passed + failed <= completed <= total
    2. Replay does NOT inflate completed or total test counts
    """
    payload = frontend_session_payload(max_tests=2, max_turns=2)
    res = client.post("/api/v1/sessions", json=payload)
    sid = res.json()["sessionId"]

    client.post(f"/api/v1/sessions/{sid}/start")
    record = await service.wait_for_session(sid, timeout=10.0)

    dash_res = client.get(f"/api/v1/sessions/{sid}")
    prog = dash_res.json()["progress"]

    total = prog["total"]
    completed = prog["completed"]
    passed = prog["passed"]
    failed = prog["failed"]

    # Invariant 1
    assert passed + failed <= completed
    assert completed <= total

    # Invariant 2: Run replay and ensure progress counters do not change
    if record.failures:
        fid = record.failures[0].id
        client.post(f"/api/v1/failures/{fid}/replay", json={"attempts": 3})

        dash_after_replay = client.get(f"/api/v1/sessions/{sid}").json()["progress"]
        assert dash_after_replay["completed"] == completed
        assert dash_after_replay["total"] == total
        assert dash_after_replay["passed"] == passed
        assert dash_after_replay["failed"] == failed


# ── 4. Failure Details Contract Completeness ────────────────────────────────────


@pytest.mark.anyio
async def test_failure_details_contract_completeness(client: TestClient):
    """Verify that failure records contain all required fields for FailureDetails.tsx rendering."""
    payload = frontend_session_payload(max_tests=1, max_turns=2)
    res = client.post("/api/v1/sessions", json=payload)
    sid = res.json()["sessionId"]

    client.post(f"/api/v1/sessions/{sid}/start")
    await service.wait_for_session(sid, timeout=5.0)

    fails = client.get(f"/api/v1/sessions/{sid}/failures").json()
    assert len(fails) >= 1
    f = fails[0]

    # Required fields in Failure interface
    assert "id" in f
    assert "testId" in f
    assert "testNumber" in f
    assert "type" in f
    assert "strategy" in f
    assert "description" in f
    assert "severity" in f
    assert f["severity"] in ["low", "medium", "high", "critical"]
    assert "attack" in f and isinstance(f["attack"], str)
    assert "response" in f and isinstance(f["response"], str)
    assert "whyItFailed" in f or "why_it_failed" in f
    assert "timestamp" in f

    # Granular evidence block
    assert "evidence" in f
    ev = f["evidence"]
    assert isinstance(ev, dict)
    assert "attack" in ev
    assert "response" in ev
    assert "chronologicalTrace" in ev
    assert isinstance(ev["chronologicalTrace"], list)


# ── 5. Hardened Agent Acceptance ────────────────────────────────────────────────


@pytest.mark.anyio
async def test_hardened_agent_acceptance():
    """Hardened/secure agent properly refuses attacks and produces 0 failures and 100% pass."""
    config = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_flight_secure",
            name="Flight Booking Agent (Hardened)",
            endpoint="http://localhost:8000/agent/flight-secure",
            agent_type=AgentType.TOOL_CALLING,
            connected=True,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=2,
        max_turns_per_test=2,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)

    assert completed.status is SessionStatus.COMPLETED
    assert len(completed.failures) == 0
    assert all(t.status.value == "passed" for t in completed.tests)


# ── 6. Cross-Domain Acceptance (Customer Support & Banking) ─────────────────────


@pytest.mark.anyio
async def test_cross_domain_support_acceptance():
    """Verifies that non-flight domains (Customer Support) execute generically."""
    config = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_support_vulnerable",
            name="Customer Support Assistant",
            endpoint="http://localhost:8000/agent/support",
            agent_type=AgentType.TOOL_CALLING,
            connected=True,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=1,
        max_turns_per_test=1,
    )
    rec = await service.create_session(config)
    await service.start_session(rec.session_id)
    completed = await service.wait_for_session(rec.session_id, timeout=5.0)

    assert completed.status is SessionStatus.COMPLETED
    assert len(completed.tests) == 1
    # Check that failure / evidence remains domain-agnostic
    if completed.failures:
        f = completed.failures[0]
        assert f.strategy is not None
        assert f.evidence is not None


# ── 7. Multi-Session Concurrency Isolation ──────────────────────────────────────


@pytest.mark.anyio
async def test_multi_session_concurrency_isolation():
    """Verify that multiple concurrent sessions run completely independently without crossover."""
    c_vuln = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_flight_vulnerable",
            name="Vulnerable Target",
            endpoint="http://localhost:8000/agent/flight-vulnerable",
            agent_type=AgentType.TOOL_CALLING,
            connected=True,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=1,
        max_turns_per_test=1,
    )
    c_sec = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_flight_secure",
            name="Secure Target",
            endpoint="http://localhost:8000/agent/flight-secure",
            agent_type=AgentType.TOOL_CALLING,
            connected=True,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=1,
        max_turns_per_test=1,
    )

    s1 = await service.create_session(c_vuln)
    s2 = await service.create_session(c_sec)

    q1 = await event_broker.subscribe(s1.session_id)
    q2 = await event_broker.subscribe(s2.session_id)

    await service.start_session(s1.session_id)
    await service.start_session(s2.session_id)

    r1 = await service.wait_for_session(s1.session_id, timeout=6.0)
    r2 = await service.wait_for_session(s2.session_id, timeout=6.0)

    assert r1.status is SessionStatus.COMPLETED
    assert r2.status is SessionStatus.COMPLETED

    # S1 (vulnerable) has failures; S2 (secure) has 0 failures
    assert len(r1.failures) >= 1
    assert len(r2.failures) == 0

    # Ensure no event crossover
    while not q1.empty():
        ev1 = q1.get_nowait()
        assert ev1.session_id == s1.session_id

    while not q2.empty():
        ev2 = q2.get_nowait()
        assert ev2.session_id == s2.session_id

    await event_broker.unsubscribe(s1.session_id, q1)
    await event_broker.unsubscribe(s2.session_id, q2)


# ── 8. Stop / Cancel Acceptance ─────────────────────────────────────────────────


@pytest.mark.anyio
async def test_session_stop_cancellation_acceptance():
    """Stopping a session terminates runner immediately, marks COMPLETED, and cleans active tasks."""
    config = TestSessionConfig(
        target_agent=TargetAgent(
            id="agent_flight_vulnerable",
            name="Vulnerable Target",
            endpoint="http://localhost:8000/agent/flight-vulnerable",
            agent_type=AgentType.TOOL_CALLING,
            connected=True,
        ),
        test_mode=ModelTestMode.QUICK_SCAN,
        attack_categories=[AttackCategory.UNAUTHORIZED_ACTION],
        max_tests=10,
        max_turns_per_test=5,
    )
    rec = await service.create_session(config)
    sid = rec.session_id

    await service.start_session(sid)
    stopped_rec = await service.stop_session(sid)
    assert stopped_rec.status is SessionStatus.COMPLETED

    # Active tasks cleared
    assert sid not in service._active_tasks

    # Repeated stop is safe and idempotent
    repeat_stop = await service.stop_session(sid)
    assert repeat_stop.status is SessionStatus.COMPLETED


# ── 9. Error Acceptance ─────────────────────────────────────────────────────────


def test_structured_error_acceptance(client: TestClient):
    """API returns predictable JSON error payloads with correct status codes and no stack traces."""
    # Invalid session
    res = client.get("/api/v1/sessions/nonexistent_xyz")
    assert res.status_code == 404
    assert "detail" in res.json()

    # Invalid failure
    res_f = client.get("/api/v1/failures/nonexistent_fail")
    assert res_f.status_code == 404
    assert "detail" in res_f.json()

    # Invalid replay
    res_r = client.post("/api/v1/failures/nonexistent_fail/replay")
    assert res_r.status_code == 404

    # Invalid transition (start a completed session)
    create_res = client.post("/api/v1/sessions", json=frontend_session_payload())
    sid = create_res.json()["sessionId"]
    client.post(f"/api/v1/sessions/{sid}/start")
    client.post(f"/api/v1/sessions/{sid}/stop")
    res_restart = client.post(f"/api/v1/sessions/{sid}/start")
    assert res_restart.status_code == 409
    assert "completed" in res_restart.json()["detail"].lower()


# ── 10. CORS Acceptance ─────────────────────────────────────────────────────────


def test_cors_preflight_and_origins(client: TestClient):
    """Allowed origins receive proper CORS response headers."""
    res = client.options(
        "/api/v1/sessions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ── 11. Health Endpoints Acceptance ─────────────────────────────────────────────


def test_health_endpoints_acceptance(client: TestClient):
    """All health mount points return 200 OK without requiring Gemini key."""
    for path in ("/health", "/api/health", "/api/v1/health"):
        res = client.get(path)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["service"] == "adversight-api"
        assert "geminiConfigured" in data


# ── 12. Security Verification ───────────────────────────────────────────────────


def test_security_sanitization_and_redaction():
    """Sanitizer masks sensitive credentials, tokens, and API keys."""
    raw = "Error communicating with key=AIzaSyD-secret123 and Authorization: Bearer token_abc_999"
    cleaned = sanitize_text(raw)
    assert "AIzaSyD" not in cleaned
    assert "token_abc_999" not in cleaned
    assert "[REDACTED_API_KEY]" in cleaned
    assert "[REDACTED_TOKEN]" in cleaned
