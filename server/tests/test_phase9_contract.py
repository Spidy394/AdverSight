"""Phase 9 API Contract and Hardening Verification Test Suite.

Validates the full backend-to-frontend contract expected by the React dashboard:
- Complete session lifecycle & authoritative progress counts
- Failure listing and granular evidence retrieval
- Deterministic replay compatibility with client's isReplayResponse()
- Test case endpoint and error contracts
- SSE streaming structure, event ordering, and isolation
- Strict camelCase serialization across all responses
- Safe error handling and secrets protection
"""
from __future__ import annotations

import asyncio
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import session_service as service

BASE_SESSIONS = "/api/v1/sessions"
BASE_FAILURES = "/api/v1/failures"
BASE_TESTS = "/api/v1/tests"
BASE_AGENTS = "/api/v1/agents"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def vulnerable_flight_config() -> dict:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_flight_vulnerable",
                "name": "Flight Booking Agent (Vulnerable)",
                "endpoint": "http://localhost:8000/agent/flight-vulnerable",
                "agentType": "tool_calling",
                "connected": True,
            },
            "testMode": "quick_scan",
            "attackCategories": ["policy_violation", "unauthorized_action"],
            "maxTests": 2,
            "maxTurnsPerTest": 3,
        }
    }


def secure_flight_config() -> dict:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_flight_secure",
                "name": "Flight Booking Agent (Hardened)",
                "endpoint": "http://localhost:8000/agent/flight-secure",
                "agentType": "tool_calling",
                "connected": True,
            },
            "testMode": "quick_scan",
            "attackCategories": ["policy_violation"],
            "maxTests": 2,
            "maxTurnsPerTest": 3,
        }
    }


# ── 1. Session Lifecycle & Progress Semantics ─────────────────────────────────


def test_session_lifecycle_with_authoritative_progress(client: TestClient):
    # 1. Create Session
    create_res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    assert create_res.status_code == 201
    body = create_res.json()

    # Verify root fields required by Phase 9 contract
    assert "sessionId" in body and body["sessionId"].startswith("session_")
    assert body["id"] == body["sessionId"]
    assert body["status"] == "idle"
    assert "targetAgent" in body
    assert body["targetAgent"]["id"] == "agent_flight_vulnerable"
    assert "config" in body and "configuration" in body
    assert "createdAt" in body and body["createdAt"] is not None
    assert body["startedAt"] is None
    assert body["completedAt"] is None

    # Verify authoritative progress counts
    assert body["totalTests"] == 2
    assert body["completedTests"] == 0
    assert body["passedTests"] == 0
    assert body["failedTests"] == 0
    assert body["progress"]["total"] == 2
    assert body["progress"]["completed"] == 0

    session_id = body["sessionId"]

    # 2. Start Session
    start_res = client.post(f"{BASE_SESSIONS}/{session_id}/start")
    assert start_res.status_code == 200
    start_body = start_res.json()
    assert start_body["status"] == "testing"
    assert start_body["startedAt"] is not None

    # Wait for session worker execution to complete
    record = asyncio.run(service.wait_for_session(session_id, timeout=10.0))
    assert record.status == service.SessionStatus.COMPLETED

    # 3. Retrieve Session
    get_res = client.get(f"{BASE_SESSIONS}/{session_id}")
    assert get_res.status_code == 200
    final_body = get_res.json()
    assert final_body["status"] == "completed"
    assert final_body["completedAt"] is not None
    assert final_body["completedTests"] > 0
    assert final_body["totalTests"] == len(final_body["tests"])
    assert final_body["passedTests"] + final_body["failedTests"] == final_body["completedTests"]
    assert len(final_body["failures"]) > 0


def test_session_creation_supports_configuration_alias(client: TestClient):
    payload = {
        "configuration": {
            "targetAgent": {
                "id": "agent_flight_vulnerable",
                "name": "Flight Booking Agent",
                "endpoint": "http://localhost:8000/agent",
                "agentType": "tool_calling",
                "connected": True,
            },
            "testMode": "quick_scan",
            "attackCategories": ["policy_violation"],
            "maxTests": 3,
            "maxTurnsPerTest": 2,
        }
    }
    res = client.post(BASE_SESSIONS, json=payload)
    assert res.status_code == 201
    assert res.json()["config"]["maxTests"] == 3


# ── 2. Failure Listing & Evidence Contract ───────────────────────────────────


def test_failure_listing_and_granular_evidence(client: TestClient):
    # Create and run session with vulnerable agent
    res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    session_id = res.json()["sessionId"]
    client.post(f"{BASE_SESSIONS}/{session_id}/start")
    asyncio.run(service.wait_for_session(session_id, timeout=10.0))

    # 1. List failures for session
    failures_res = client.get(f"{BASE_SESSIONS}/{session_id}/failures")
    assert failures_res.status_code == 200
    failures = failures_res.json()
    assert len(failures) >= 1

    first_fail = failures[0]
    # Check minimum required failure fields
    assert "id" in first_fail and first_fail["id"].startswith("fail_")
    assert "testId" in first_fail and first_fail["testId"].startswith("test_")
    assert "type" in first_fail
    assert "description" in first_fail
    assert "severity" in first_fail
    assert "timestamp" in first_fail
    assert "strategy" in first_fail

    # 2. Get Failure Details by Failure ID
    fail_id = first_fail["id"]
    detail_res = client.get(f"{BASE_FAILURES}/{fail_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()

    assert detail["id"] == fail_id
    assert detail["testId"] == first_fail["testId"]
    assert "whyItFailed" in detail and len(detail["whyItFailed"]) > 0
    assert "attack" in detail and len(detail["attack"]) > 0
    assert "response" in detail and len(detail["response"]) > 0

    # Verify structured evidence payload
    assert "evidence" in detail and detail["evidence"] is not None
    ev = detail["evidence"]
    assert "attack" in ev
    assert "agentResponse" in ev
    assert "agentResponses" in ev and isinstance(ev["agentResponses"], list)
    assert "toolCalls" in ev and isinstance(ev["toolCalls"], list)
    assert "violatedPolicy" in ev
    assert "detector" in ev
    assert "reason" in ev

    # 3. Also verify lookup by test ID resolves correctly
    by_test_res = client.get(f"{BASE_FAILURES}/{first_fail['testId']}")
    assert by_test_res.status_code == 200
    assert by_test_res.json()["id"] == fail_id


# ── 3. Replay Contract Compatibility with Frontend isReplayResponse ──────────


def test_test_case_replay_consumable_by_frontend(client: TestClient):
    # Run a session to produce completed test cases
    res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    session_id = res.json()["sessionId"]
    client.post(f"{BASE_SESSIONS}/{session_id}/start")
    asyncio.run(service.wait_for_session(session_id, timeout=10.0))

    session_data = client.get(f"{BASE_SESSIONS}/{session_id}").json()
    assert len(session_data["tests"]) > 0
    test_id = session_data["tests"][0]["id"]

    # Call POST /api/v1/tests/{test_id}/replay (what client's replayTestCase() calls)
    replay_res = client.post(f"{BASE_TESTS}/{test_id}/replay", json={"attempts": 2})
    assert replay_res.status_code == 200
    result = replay_res.json()

    # Exact verification matching client/src/lib/api.ts -> isReplayResponse(value)
    valid_statuses = ["pending", "running", "passed", "failed"]
    assert isinstance(result.get("replayCaseId"), str)
    assert isinstance(result.get("reproduced"), bool)
    assert isinstance(result.get("status"), str)
    assert result["status"] in valid_statuses
    assert isinstance(result.get("findings"), list)
    assert isinstance(result.get("turns"), list)
    assert isinstance(result.get("attempts"), int)
    assert isinstance(result.get("reproducedCount"), int)
    assert isinstance(result.get("reproductionRate"), (int, float))

    # Verify turn structure
    if result["turns"]:
        first_turn = result["turns"][0]
        assert "attack" in first_turn
        assert "response" in first_turn
        assert "text" in first_turn["response"]
        assert "toolCalls" in first_turn["response"]


def test_failure_replay_response_structure(client: TestClient):
    res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    session_id = res.json()["sessionId"]
    client.post(f"{BASE_SESSIONS}/{session_id}/start")
    asyncio.run(service.wait_for_session(session_id, timeout=10.0))

    session_data = client.get(f"{BASE_SESSIONS}/{session_id}").json()
    assert len(session_data["failures"]) > 0
    failure_id = session_data["failures"][0]["id"]

    replay_res = client.post(f"{BASE_FAILURES}/{failure_id}/replay", json={"attempts": 2})
    assert replay_res.status_code == 200
    replay_body = replay_res.json()

    # Check Phase 9 Failure Replay structure
    assert replay_body["failureId"] == failure_id
    assert replay_body["status"] in ("completed", "error")
    assert replay_body["verdict"] in ("REPRODUCED", "NOT_REPRODUCED", "ERROR")
    assert isinstance(replay_body["reproduced"], bool)
    assert replay_body["attempts"] == 2
    assert "successfulReproductions" in replay_body
    assert "reproductionRate" in replay_body
    assert "replayResults" in replay_body and isinstance(replay_body["replayResults"], list)
    assert len(replay_body["replayResults"]) == 2
    assert "reproducedCount" in replay_body


# ── 4. Test Case Endpoint ────────────────────────────────────────────────────


def test_get_individual_test_case(client: TestClient):
    res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    session_id = res.json()["sessionId"]
    client.post(f"{BASE_SESSIONS}/{session_id}/start")
    asyncio.run(service.wait_for_session(session_id, timeout=10.0))

    session_data = client.get(f"{BASE_SESSIONS}/{session_id}").json()
    test_id = session_data["tests"][0]["id"]

    # Retrieve specific test
    test_res = client.get(f"{BASE_TESTS}/{test_id}")
    assert test_res.status_code == 200
    test_data = test_res.json()

    assert test_data["id"] == test_id
    assert test_data["sessionId"] == session_id
    assert "strategy" in test_data
    assert "attack" in test_data
    assert "status" in test_data
    assert "conversation" in test_data
    assert "turns" in test_data


def test_get_nonexistent_test_returns_404(client: TestClient):
    res = client.get(f"{BASE_TESTS}/test_nonexistent_9999")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# ── 5. SSE Streaming Contract & Session Isolation ─────────────────────────────


def test_sse_stream_contract_and_event_shapes(client: TestClient):
    create_res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    session_id = create_res.json()["sessionId"]
    client.post(f"{BASE_SESSIONS}/{session_id}/start")
    client.post(f"{BASE_SESSIONS}/{session_id}/stop")

    # Connect to stream of completed session
    with client.stream("GET", f"{BASE_SESSIONS}/{session_id}/stream") as stream:
        assert stream.status_code == 200
        assert "text/event-stream" in stream.headers.get("content-type", "")

        lines = [line for line in stream.iter_lines()]
        full_text = "\n".join(lines)
        assert "event: session_state" in full_text
        assert "event: session_completed" in full_text
        assert "data:" in full_text

        # Extract and verify JSON data payload
        data_lines = [l for l in lines if l.startswith("data:")]
        assert len(data_lines) >= 2
        state_json = json.loads(data_lines[0][len("data:"):].strip())
        assert state_json["sessionId"] == session_id
        assert state_json["type"] == "session_state"
        assert "status" in state_json
        assert "progress" in state_json
        assert "config" in state_json

        done_json = json.loads(data_lines[1][len("data:"):].strip())
        assert done_json["sessionId"] == session_id
        assert done_json["type"] == "session_completed"
        assert "progress" in done_json["data"]


def test_sse_stream_session_isolation(client: TestClient):
    s1 = client.post(BASE_SESSIONS, json=vulnerable_flight_config()).json()["sessionId"]
    s2 = client.post(BASE_SESSIONS, json=vulnerable_flight_config()).json()["sessionId"]

    client.post(f"{BASE_SESSIONS}/{s1}/start")
    client.post(f"{BASE_SESSIONS}/{s1}/stop")
    client.post(f"{BASE_SESSIONS}/{s2}/start")
    client.post(f"{BASE_SESSIONS}/{s2}/stop")

    with client.stream("GET", f"{BASE_SESSIONS}/{s1}/stream") as stream1:
        text1 = "\n".join(line for line in stream1.iter_lines())
        assert s1 in text1
        assert s2 not in text1

    with client.stream("GET", f"{BASE_SESSIONS}/{s2}/stream") as stream2:
        text2 = "\n".join(line for line in stream2.iter_lines())
        assert s2 in text2
        assert s1 not in text2


# ── 6. Serialization & camelCase Audit ───────────────────────────────────────


def test_camel_case_consistency_across_models(client: TestClient):
    # Verify agent catalog endpoints
    agents_res = client.get(BASE_AGENTS)
    assert agents_res.status_code == 200
    agents = agents_res.json()
    assert len(agents) > 0
    first_agent = agents[0]
    assert "agentType" in first_agent
    assert "agent_type" not in first_agent

    # Verify session creation & dashboard
    sess_res = client.post(BASE_SESSIONS, json=vulnerable_flight_config())
    body = sess_res.json()

    # Forbidden snake_case in API responses
    forbidden_keys = [
        "session_id",
        "test_id",
        "failure_id",
        "created_at",
        "started_at",
        "completed_at",
        "total_tests",
        "completed_tests",
        "passed_tests",
        "failed_tests",
        "target_agent",
        "attack_categories",
        "max_tests",
        "max_turns_per_test",
    ]
    for key in forbidden_keys:
        assert key not in body, f"Snake-case key '{key}' leaked in session response!"


# ── 7. Error Handling & Security ─────────────────────────────────────────────


def test_error_status_codes_and_sanitization(client: TestClient):
    # 404 for unknown session
    res_unknown_sess = client.get(f"{BASE_SESSIONS}/nonexistent_session")
    assert res_unknown_sess.status_code == 404

    # 404 for unknown failure
    res_unknown_fail = client.get(f"{BASE_FAILURES}/nonexistent_failure")
    assert res_unknown_fail.status_code == 404

    # 422 for invalid replay attempts
    res_invalid_replay = client.post(f"{BASE_FAILURES}/any_id/replay", json={"attempts": 99})
    assert res_invalid_replay.status_code == 422

    # 409 for invalid state transitions
    sess = client.post(BASE_SESSIONS, json=vulnerable_flight_config()).json()["sessionId"]
    # stop without starting
    res_stop_conflict = client.post(f"{BASE_SESSIONS}/{sess}/stop")
    assert res_stop_conflict.status_code == 409

    # No secrets or credentials leaked in errors
    for res in (res_unknown_sess, res_unknown_fail, res_invalid_replay, res_stop_conflict):
        raw_text = res.text.lower()
        assert "api_key" not in raw_text
        assert "secret" not in raw_text
        assert "gemini" not in raw_text or "agent" in raw_text  # only benign agent mentions
        assert "traceback" not in raw_text
