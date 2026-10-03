"""End-to-end checks through the HTTP API: is the data the dashboard receives coherent?

These do not test individual detectors (see test_engine.py); they test that a whole session
- config in, dashboard JSON out - is internally consistent and honours its configuration.
"""
from __future__ import annotations

import json
import re
import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

BASE = "/api/v1/sessions"
HHMMSS = re.compile(r"^\d{2}:\d{2}:\d{2}$")
ALL_CATS = ["goal_hijacking", "identity_confusion", "policy_violation", "unauthorized_action",
            "context_manipulation", "tool_misuse", "information_extraction"]


def payload(name="Flight Booking Agent", cats=None, max_tests=8, max_turns=4) -> dict:
    return {"config": {
        "targetAgent": {"id": "agent_x", "name": name, "endpoint": "http://localhost:8000/agent",
                        "agentType": "tool_calling", "connected": True},
        "testMode": "custom", "attackCategories": ALL_CATS if cats is None else cats,
        "maxTests": max_tests, "maxTurnsPerTest": max_turns}}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def run_session(client, timeout=20, **kw) -> dict:
    sid = client.post(BASE, json=payload(**kw)).json()["sessionId"]
    assert client.post(f"{BASE}/{sid}/start").status_code == 200
    deadline = time.time() + timeout
    while time.time() < deadline:
        d = client.get(f"{BASE}/{sid}").json()
        if d["status"] == "completed":
            return d
        time.sleep(0.05)
    pytest.fail(f"session {sid} did not complete in {timeout}s")


# --------------------------------------------------------------------------- internal consistency
def test_progress_matches_the_tests_list(client):
    d = run_session(client)
    tests, p = d["tests"], d["progress"]
    passed = sum(t["status"] == "passed" for t in tests)
    failed = sum(t["status"] == "failed" for t in tests)
    assert (p["passed"], p["failed"]) == (passed, failed)
    assert p["completed"] == passed + failed == len(tests)
    assert p["running"] == 0 and p["total"] == len(tests)
    assert all(t["status"] in ("passed", "failed") for t in tests), "no test may be left pending/running"


def test_test_ids_and_numbers_are_unique_and_sequential(client):
    tests = run_session(client, max_tests=9)["tests"]
    nums = [t["testNumber"] for t in tests]
    assert nums == sorted(nums) and len(set(nums)) == len(nums) == 9
    assert nums == list(range(1, 10))
    assert len({t["id"] for t in tests}) == 9


def test_failures_and_failed_tests_correspond_one_to_one(client):
    d = run_session(client)
    failed_ids = {t["id"] for t in d["tests"] if t["status"] == "failed"}
    assert failed_ids, "default demo agent is vulnerable: expected failures"
    assert {f["testId"] for f in d["failures"]} == failed_ids
    assert len(d["failures"]) == len(failed_ids)
    for t in d["tests"]:
        if t["status"] == "failed":
            assert t["failureType"], f"{t['id']} failed without a failureType"
        else:
            assert not t.get("failureType"), f"{t['id']} passed but has failureType"


def test_failure_evidence_is_complete_and_traceable(client):
    d = run_session(client)
    tests = {t["id"]: t for t in d["tests"]}
    for f in d["failures"]:
        t = tests[f["testId"]]
        assert f["testNumber"] == t["testNumber"]
        assert f["whyItFailed"].strip() and f["description"].strip()
        said = [turn["content"] for turn in t["conversation"] if turn["role"] == "adversight"]
        got = [turn["content"] for turn in t["conversation"] if turn["role"] == "target"]
        assert f["attack"] in said, "failure.attack must be a message AdverSight really sent"
        assert f["response"] in got, "failure.response must be something the target really said"
        assert HHMMSS.match(f["timestamp"]) or "T" in f["timestamp"]


def test_conversations_alternate_adversight_then_target(client):
    for t in run_session(client)["tests"]:
        roles = [turn["role"] for turn in t["conversation"]]
        assert roles, f"{t['id']} has an empty conversation"
        assert roles == ["adversight", "target"] * (len(roles) // 2)
        assert t["conversation"][0]["content"] == t["attack"]


def test_log_stream_is_well_formed(client):
    d = run_session(client)
    types = [l["type"] for l in d["logs"]]
    assert types[0] == "SESSION_STARTED"
    assert types.count("SESSION_COMPLETED") == 1 and types[-1] == "SESSION_COMPLETED"
    assert types.count("SESSION_STARTED") == 1
    assert all(HHMMSS.match(l["timestamp"]) for l in d["logs"])
    assert len({l["id"] for l in d["logs"]}) == len(d["logs"]), "log ids must be unique"
    assert types.count("FAILURE_RECORDED") == len(d["failures"])


# --------------------------------------------------------------------------- honours configuration
@pytest.mark.parametrize("n", [1, 3, 7])
def test_max_tests_budget_is_respected(client, n):
    assert len(run_session(client, max_tests=n)["tests"]) == n


def test_max_turns_is_respected(client):
    for t in run_session(client, max_tests=8, max_turns=2)["tests"]:
        assert len(t["conversation"]) <= 2 * 2


@pytest.mark.parametrize("cat", ["tool_misuse", "information_extraction", "unauthorized_action"])
def test_only_selected_categories_are_attacked(client, cat):
    tests = run_session(client, cats=[cat], max_tests=4)["tests"]
    assert {t["strategy"] for t in tests} == {cat}


def test_secure_agent_produces_zero_failures(client):
    d = run_session(client, name="Secure Flight Agent", max_tests=14)
    assert d["failures"] == [] and d["progress"]["failed"] == 0 and d["progress"]["passed"] == 14


def test_vulnerable_agent_is_caught_with_high_severity(client):
    d = run_session(client, max_tests=12)
    assert d["progress"]["failed"] >= 3
    assert {f["severity"] for f in d["failures"]} & {"high", "critical"}


def test_tool_calls_recorded_for_unauthorized_action(client):
    d = run_session(client, cats=["unauthorized_action"], max_tests=4)
    with_calls = [f for f in d["failures"] if f.get("toolCalls")]
    assert with_calls, "an unauthorized booking should carry the tool call as evidence"
    assert with_calls[0]["toolCalls"][0]["name"] == "book_flight"


# --------------------------------------------------------------------------- lifecycle & validation
def test_double_start_does_not_launch_two_runs(client):
    sid = client.post(BASE, json=payload(max_tests=5)).json()["sessionId"]
    assert client.post(f"{BASE}/{sid}/start").status_code == 200
    assert client.post(f"{BASE}/{sid}/start").status_code == 200
    deadline = time.time() + 20
    while time.time() < deadline and client.get(f"{BASE}/{sid}").json()["status"] != "completed":
        time.sleep(0.05)
    d = client.get(f"{BASE}/{sid}").json()
    assert [t["testNumber"] for t in d["tests"]] == [1, 2, 3, 4, 5], "duplicate run would repeat tests"
    assert [l["type"] for l in d["logs"]].count("SESSION_STARTED") == 1


def test_stopping_mid_run_leaves_a_consistent_dashboard(client):
    sid = client.post(BASE, json=payload(max_tests=40, max_turns=6)).json()["sessionId"]
    client.post(f"{BASE}/{sid}/start")
    time.sleep(0.15)
    stopped = client.post(f"{BASE}/{sid}/stop").json()
    assert stopped["status"] == "completed"
    time.sleep(0.5)  # let any in-flight worker finish; it must not corrupt or un-complete the session
    d = client.get(f"{BASE}/{sid}").json()
    assert d["status"] == "completed"
    assert d["progress"]["completed"] <= d["progress"]["total"]
    assert d["progress"]["running"] == 0, "a stopped session must not show a test as still running"
    assert len([t for t in d["tests"]]) <= 40


def test_a_completed_session_cannot_be_restarted(client):
    d = run_session(client, max_tests=2)
    assert client.post(f"{BASE}/{d['sessionId']}/start").status_code == 409


@pytest.mark.parametrize("field, value", [("maxTests", 0), ("maxTests", -3), ("maxTurnsPerTest", 0)])
def test_invalid_limits_are_rejected(client, field, value):
    body = payload()
    body["config"][field] = value
    assert client.post(BASE, json=body).status_code == 422


def test_empty_category_list_falls_back_to_all_categories(client):
    tests = run_session(client, cats=[], max_tests=7)["tests"]
    assert len({t["strategy"] for t in tests}) >= 5


def test_two_concurrent_sessions_do_not_leak_into_each_other(client):
    a = client.post(BASE, json=payload(cats=["tool_misuse"], max_tests=4)).json()["sessionId"]
    b = client.post(BASE, json=payload(cats=["information_extraction"], max_tests=4)).json()["sessionId"]
    client.post(f"{BASE}/{a}/start")
    client.post(f"{BASE}/{b}/start")
    deadline = time.time() + 20
    while time.time() < deadline and any(
            client.get(f"{BASE}/{s}").json()["status"] != "completed" for s in (a, b)):
        time.sleep(0.05)
    da, db = (client.get(f"{BASE}/{s}").json() for s in (a, b))
    assert {t["strategy"] for t in da["tests"]} == {"tool_misuse"}
    assert {t["strategy"] for t in db["tests"]} == {"information_extraction"}
    for d in (da, db):
        own = {t["id"] for t in d["tests"]}
        assert {f["testId"] for f in d["failures"]} <= own
        assert all(l.get("testId") in (None, *own) for l in d["logs"])
    assert da["sessionId"] != db["sessionId"]


# --------------------------------------------------------------------------- SSE
def _collect_sse(client, sid, out: list, errors: list):
    try:
        with client.stream("GET", f"{BASE}/{sid}/stream") as r:
            ev = None
            for line in r.iter_lines():
                if line.startswith("event:"):
                    ev = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and ev:
                    out.append((ev, json.loads(line.split(":", 1)[1])))
    except Exception as exc:  # noqa: BLE001
        errors.append(exc)


def _stream_session(client, max_tests=6):
    sid = client.post(BASE, json=payload(max_tests=max_tests)).json()["sessionId"]
    events: list = []
    errors: list = []
    th = threading.Thread(target=_collect_sse, args=(client, sid, events, errors), daemon=True)
    th.start()
    time.sleep(0.2)
    client.post(f"{BASE}/{sid}/start")
    th.join(25)
    assert not th.is_alive(), "SSE stream never terminated after the session completed"
    assert not errors, errors
    return sid, events


def test_live_sse_stream_tells_the_same_story_as_the_dashboard(client):
    sid, events = _stream_session(client)
    names = [e for e, _ in events]
    assert names[0] == "session_state" and names[-1] == "session_completed"
    d = client.get(f"{BASE}/{sid}").json()
    assert d["status"] == "completed", "stream closed while the session still reads as running"

    # failures delivered over SSE (de-duplicated by id, as the client does) == dashboard failures
    streamed = {p["data"]["failure"]["id"] for e, p in events if e == "failure_recorded" and p.get("data", {}).get("failure")}
    assert streamed == {f["id"] for f in d["failures"]}

    started = {p.get("testId") for e, p in events if e == "test_started"}
    ended = {p.get("testId") for e, p in events if e in ("test_passed", "test_failed")}
    assert ended <= started, "a test finished that never announced it started"
    assert ended == {t["id"] for t in d["tests"]}, "every test in the dashboard must have emitted an end event"

    # the last progress the stream reported must agree with the final dashboard
    last = [p["data"]["progress"] for e, p in events if e in ("test_passed", "test_failed")][-1]
    assert (last["passed"], last["failed"]) == (d["progress"]["passed"], d["progress"]["failed"])


@pytest.mark.xfail(strict=True, reason=(
    "Known: failure_recorded / test_started / agent_response_received are each published twice "
    "(once from the engine log mapping, once from the engine callbacks). The client de-duplicates "
    "failures by id, but every duplicate still appends a log line to the observability panel."))
def test_sse_publishes_each_logical_event_once(client):
    sid, events = _stream_session(client)
    d = client.get(f"{BASE}/{sid}").json()
    names = [e for e, _ in events]
    assert names.count("failure_recorded") == len(d["failures"])
    assert names.count("test_started") == len(d["tests"])


@pytest.mark.xfail(strict=True, reason=(
    "Known: the terminal session_completed event is the engine's raw log mapping (data = rawType/"
    "message), not the service's richer event carrying progress/failuresCount, because the stream "
    "closes on the first session_completed. The client falls back to its previous progress."))
def test_terminal_sse_event_carries_final_progress(client):
    _, events = _stream_session(client)
    assert "progress" in events[-1][1].get("data", {})
