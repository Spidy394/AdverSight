"""Tests for the Testing Session API.

The camelCase assertions are load-bearing: they are the guard on the handoff
contract with ``client/src/types/testing.ts``. If someone changes a field name
here, the frontend's ``DashboardData`` type stops matching silently.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

BASE = "/api/v1/sessions"
UNKNOWN = "session_does_not_exist"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def payload() -> dict:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_flight_booking_v1",
                "name": "Flight Booking Agent",
                "endpoint": "http://localhost:8000/agent",
                "agentType": "tool_calling",
                "connected": False,
            },
            "testMode": "quick_scan",
            "attackCategories": ["goal_hijacking", "policy_violation"],
            "maxTests": 12,
            "maxTurnsPerTest": 8,
        }
    }


def create(client: TestClient) -> str:
    response = client.post(BASE, json=payload())
    assert response.status_code == 201
    return response.json()["sessionId"]


# ── Health ──────────────────────────────────────────────────────────────────────


def test_health_still_works(client):
    assert client.get("/health").json()["status"] == "ok"


# ── Create ──────────────────────────────────────────────────────────────────────


def test_create_returns_idle_dashboard(client):
    body = client.post(BASE, json=payload()).json()

    assert body["sessionId"].startswith("session_")
    assert body["status"] == "idle"
    assert body["logs"] == []
    assert body["tests"] == []
    assert body["failures"] == []
    assert body["activeTestId"] is None


def test_create_response_is_camel_case(client):
    body = client.post(BASE, json=payload()).json()

    assert body["config"]["targetAgent"]["agentType"] == "tool_calling"
    assert body["config"]["attackCategories"] == ["goal_hijacking", "policy_violation"]
    assert body["config"]["maxTurnsPerTest"] == 8


def test_create_rejects_invalid_enum(client):
    body = payload()
    body["config"]["testMode"] = "turbo"

    assert client.post(BASE, json=body).status_code == 422


# ── Retrieve ────────────────────────────────────────────────────────────────────


def test_get_returns_session(client):
    session_id = create(client)

    response = client.get(f"{BASE}/{session_id}")

    assert response.status_code == 200
    assert response.json()["sessionId"] == session_id


def test_get_unknown_returns_404(client):
    response = client.get(f"{BASE}/{UNKNOWN}")

    assert response.status_code == 404
    assert UNKNOWN in response.json()["detail"]


# ── Start ───────────────────────────────────────────────────────────────────────


def test_start_flips_status_and_seeds_logs(client):
    session_id = create(client)

    body = client.post(f"{BASE}/{session_id}/start").json()

    assert body["status"] == "testing"
    assert [event["type"] for event in body["logs"]] == [
        "SESSION_STARTED",
        "TEST_STARTED",
    ]
    assert all(
        len(event["timestamp"]) == 8 and event["timestamp"][2] == ":"
        for event in body["logs"]
    )


def test_start_is_idempotent(client):
    session_id = create(client)
    client.post(f"{BASE}/{session_id}/start")

    body = client.post(f"{BASE}/{session_id}/start").json()

    assert body["status"] == "testing"
    assert len(body["logs"]) == 2


def test_start_after_stop_returns_409(client):
    session_id = create(client)
    client.post(f"{BASE}/{session_id}/start")
    client.post(f"{BASE}/{session_id}/stop")

    assert client.post(f"{BASE}/{session_id}/start").status_code == 409


def test_start_unknown_returns_404(client):
    assert client.post(f"{BASE}/{UNKNOWN}/start").status_code == 404


# ── Stop ────────────────────────────────────────────────────────────────────────


def test_stop_completes_session(client):
    session_id = create(client)
    client.post(f"{BASE}/{session_id}/start")

    body = client.post(f"{BASE}/{session_id}/stop").json()

    assert body["status"] == "completed"
    assert body["logs"][-1]["type"] == "SESSION_COMPLETED"


def test_stop_is_idempotent(client):
    session_id = create(client)
    client.post(f"{BASE}/{session_id}/start")
    client.post(f"{BASE}/{session_id}/stop")

    body = client.post(f"{BASE}/{session_id}/stop").json()

    assert body["status"] == "completed"
    assert [event["type"] for event in body["logs"]].count("SESSION_COMPLETED") == 1


def test_stop_without_start_returns_409(client):
    session_id = create(client)

    assert client.post(f"{BASE}/{session_id}/stop").status_code == 409


def test_stop_unknown_returns_404(client):
    assert client.post(f"{BASE}/{UNKNOWN}/stop").status_code == 404


# ── Full lifecycle ──────────────────────────────────────────────────────────────


def test_progress_falls_back_to_max_tests(client):
    """No engine yet, so total comes from the config rather than 0/0."""
    session_id = create(client)

    body = client.post(f"{BASE}/{session_id}/start").json()

    assert body["progress"] == {
        "total": 12,
        "completed": 0,
        "passed": 0,
        "failed": 0,
        "running": 0,
    }


def test_full_lifecycle(client):
    session_id = create(client)
    client.post(f"{BASE}/{session_id}/start")
    client.post(f"{BASE}/{session_id}/stop")

    body = client.get(f"{BASE}/{session_id}").json()

    assert body["status"] == "completed"
    assert body["config"]["targetAgent"]["name"] == "Flight Booking Agent"


def test_sessions_are_isolated(client):
    first = create(client)
    second = create(client)

    client.post(f"{BASE}/{first}/start")

    assert client.get(f"{BASE}/{second}").json()["status"] == "idle"