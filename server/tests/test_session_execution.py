"""Integration tests for session execution, event publishing, session isolation, and SSE streaming."""
from __future__ import annotations

import asyncio
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.model.event import TestEvent, TestEventType
from app.services import session_service as service
from app.services.event_broker import event_broker

BASE = "/api/v1/sessions"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def make_payload(name: str = "Flight Booking Agent", endpoint: str = "http://localhost:8000/agent", max_tests: int = 4) -> dict:
    return {
        "config": {
            "targetAgent": {
                "id": "agent_flight_booking_v1",
                "name": name,
                "endpoint": endpoint,
                "agentType": "tool_calling",
                "connected": True,
            },
            "testMode": "quick_scan",
            "attackCategories": ["unauthorized_action", "information_extraction"],
            "maxTests": max_tests,
            "maxTurnsPerTest": 3,
        }
    }


def test_sse_stream_unknown_session_returns_404(client):
    response = client.get(f"{BASE}/session_nonexistent_xyz/stream")
    assert response.status_code == 404


def test_sse_stream_initial_state(client):
    create_resp = client.post(BASE, json=make_payload())
    session_id = create_resp.json()["sessionId"]
    client.post(f"{BASE}/{session_id}/start")
    client.post(f"{BASE}/{session_id}/stop")

    with client.stream("GET", f"{BASE}/{session_id}/stream") as stream:
        lines = [line for line in stream.iter_lines()]
        text = "\n".join(lines)
        assert "event: session_state" in text
        assert f"id: state_{session_id}" in text
        assert "event: session_completed" in text


@pytest.mark.anyio
async def test_session_isolation_in_event_broker():
    session_a = "session_iso_a"
    session_b = "session_iso_b"

    queue_a = await event_broker.subscribe(session_a)
    queue_b = await event_broker.subscribe(session_b)

    evt = TestEvent(
        session_id=session_a,
        type=TestEventType.TEST_STARTED,
        test_id="test_001",
        message="Test A started",
    )
    await event_broker.publish(session_a, evt)

    # Queue A should receive it
    received = await asyncio.wait_for(queue_a.get(), timeout=1.0)
    assert received.session_id == session_a
    assert received.type == TestEventType.TEST_STARTED

    # Queue B should receive NOTHING
    assert queue_b.empty()

    await event_broker.unsubscribe(session_a, queue_a)
    await event_broker.unsubscribe(session_b, queue_b)


import time


def wait_for_completion(client: TestClient, session_id: str, timeout: float = 10.0) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        body = client.get(f"{BASE}/{session_id}").json()
        if body["status"] == "completed":
            return body
        time.sleep(0.05)
    return client.get(f"{BASE}/{session_id}").json()


def test_end_to_end_vulnerable_agent_execution(client):
    payload = make_payload(max_tests=4)
    create_resp = client.post(BASE, json=payload)
    session_id = create_resp.json()["sessionId"]

    start_resp = client.post(f"{BASE}/{session_id}/start")
    assert start_resp.status_code == 200

    body = wait_for_completion(client, session_id, timeout=10.0)

    assert body["status"] == "completed"
    assert len(body["tests"]) >= 1
    # Vulnerable agent should produce failures with evidence
    assert len(body["failures"]) >= 1
    failure = body["failures"][0]
    assert failure["testId"].startswith("test_")
    assert failure["severity"] in ("low", "medium", "high", "critical")
    assert failure["attack"]
    assert failure["whyItFailed"]


def test_end_to_end_secure_agent_execution(client):
    payload = make_payload(
        name="Secure Flight Booking Agent",
        endpoint="http://localhost:8000/agent/secure",
        max_tests=4,
    )
    create_resp = client.post(BASE, json=payload)
    session_id = create_resp.json()["sessionId"]

    start_resp = client.post(f"{BASE}/{session_id}/start")
    assert start_resp.status_code == 200

    body = wait_for_completion(client, session_id, timeout=10.0)

    assert body["status"] == "completed"
    assert len(body["tests"]) >= 1
    # Secure agent should have 0 failures!
    assert len(body["failures"]) == 0
    assert body["progress"]["failed"] == 0


def test_stop_running_session(client):
    payload = make_payload(max_tests=10)
    create_resp = client.post(BASE, json=payload)
    session_id = create_resp.json()["sessionId"]

    client.post(f"{BASE}/{session_id}/start")
    stop_resp = client.post(f"{BASE}/{session_id}/stop")

    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "completed"
