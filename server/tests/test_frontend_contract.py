"""Contract tests: the API's JSON must match ``client/src/types/testing.ts``.

The TypeScript file is parsed directly, so if either side drifts (a field renamed in
Python, or a union member added in TS) these tests fail instead of the UI breaking silently.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.model import session as m

TS_FILE = Path(__file__).resolve().parents[2] / "client" / "src" / "types" / "testing.ts"
BASE = "/api/v1/sessions"

pytestmark = pytest.mark.skipif(not TS_FILE.exists(), reason="client/src/types/testing.ts not found")


# --------------------------------------------------------------------------- TS parsing
def ts_interfaces() -> dict[str, dict[str, bool]]:
    """interface name -> {field: is_optional}."""
    src = TS_FILE.read_text(encoding="utf-8")
    out: dict[str, dict[str, bool]] = {}
    for name, body in re.findall(r"export interface (\w+)\s*\{(.*?)\n\}", src, re.S):
        fields: dict[str, bool] = {}
        depth = 0
        for line in body.splitlines():
            line = line.split("//")[0]
            if depth == 0:
                mt = re.match(r"\s*(\w+)(\??):", line)
                if mt:
                    fields[mt.group(1)] = bool(mt.group(2))
            depth += line.count("{") - line.count("}")
        out[name] = fields
    return out


def ts_union(name: str) -> set[str]:
    src = TS_FILE.read_text(encoding="utf-8")
    body = re.search(rf"export type {name}\s*=(.*?);", src, re.S).group(1)
    return set(re.findall(r'"([^"]+)"', body))


def py_enum(cls) -> set[str]:
    return {e.value for e in cls}


# --------------------------------------------------------------------------- fixtures
def payload(max_tests: int = 6, name: str = "Flight Booking Agent") -> dict:
    return {"config": {
        "targetAgent": {"id": "agent_x", "name": name, "endpoint": "http://localhost:8000/agent",
                        "agentType": "tool_calling", "connected": True},
        "testMode": "full_adversarial",
        "attackCategories": [c.value for c in m.AttackCategory],
        "maxTests": max_tests, "maxTurnsPerTest": 4}}


@pytest.fixture(scope="module")
def finished_dashboard() -> dict:
    """A completed session against the (vulnerable-by-default) demo agent."""
    with TestClient(app) as client:
        sid = client.post(BASE, json=payload(max_tests=10)).json()["sessionId"]
        client.post(f"{BASE}/{sid}/start")
        deadline = time.time() + 20
        while time.time() < deadline:
            data = client.get(f"{BASE}/{sid}").json()
            if data["status"] == "completed":
                return data
            time.sleep(0.1)
    pytest.fail("session did not complete within 20s")


# --------------------------------------------------------------------------- enums
# Values the API can emit that testing.ts does not declare yet. Each is a REAL gap the UI
# must handle; the strict xfail flips to a failure the moment the TS union catches up, which
# is the signal to delete the entry.
KNOWN_API_ONLY = {
    "TestStatus": {"inconclusive"},
    "LogEventType": {"ATTACK_ADAPTED", "WEAKNESS_IDENTIFIED"},
}


def _gap(ts_name):
    return pytest.mark.xfail(strict=True, reason=f"API emits {sorted(KNOWN_API_ONLY[ts_name])} which "
                             f"testing.ts {ts_name} does not declare") if ts_name in KNOWN_API_ONLY else ()


ENUMS = [("TestStatus", m.TestStatus), ("DashboardStatus", m.SessionStatus), ("Severity", m.Severity),
         ("AttackCategory", m.AttackCategory), ("TestMode", m.TestMode), ("AgentType", m.AgentType),
         ("LogEventType", m.LogEventType)]


@pytest.mark.parametrize("ts_name, py_cls", [pytest.param(n, c, marks=_gap(n), id=n) for n, c in ENUMS])
def test_api_never_emits_a_value_the_typescript_union_lacks(ts_name, py_cls):
    api_only = py_enum(py_cls) - ts_union(ts_name)
    assert not api_only, f"{ts_name}: API can emit {sorted(api_only)} but testing.ts does not declare it"


@pytest.mark.parametrize("ts_name, py_cls", [pytest.param(n, c, id=n) for n, c in ENUMS])
def test_typescript_union_has_no_value_the_api_cannot_emit(ts_name, py_cls):
    assert not ts_union(ts_name) - py_enum(py_cls), f"{ts_name}: testing.ts declares values the API never sends"


@pytest.mark.parametrize("ts_name", sorted(KNOWN_API_ONLY))
def test_known_gaps_list_is_accurate(ts_name):
    """Keeps KNOWN_API_ONLY honest: it must equal the real difference, no more, no less."""
    py = {"TestStatus": m.TestStatus, "LogEventType": m.LogEventType}[ts_name]
    real = py_enum(py) - ts_union(ts_name)
    assert real in (KNOWN_API_ONLY[ts_name], set()), f"{ts_name}: unexpected API-only values {sorted(real)}"


# --------------------------------------------------------------------------- shapes
def _check(obj: dict, interface: str):
    """Every field the TS interface requires must be present. Extra fields are fine: a TS
    consumer ignores them, so the backend may add evidence without breaking the UI."""
    spec = ts_interfaces()[interface]
    missing = [f for f, optional in spec.items() if not optional and f not in obj]
    assert not missing, f"{interface}: API omits required fields {missing}"


def test_dashboard_matches_DashboardData(finished_dashboard):
    _check(finished_dashboard, "DashboardData")
    _check(finished_dashboard["config"], "TestSessionConfig")
    _check(finished_dashboard["config"]["targetAgent"], "TargetAgent")
    _check(finished_dashboard["progress"], "TestProgress")


def test_every_test_matches_TestCase(finished_dashboard):
    assert finished_dashboard["tests"], "no tests were produced"
    for t in finished_dashboard["tests"]:
        _check(t, "TestCase")
        for turn in t["conversation"]:
            _check(turn, "ConversationTurn")
        for tc in t.get("toolCalls") or []:
            _check(tc, "ToolCall")


def test_every_failure_matches_Failure(finished_dashboard):
    assert finished_dashboard["failures"], "vulnerable demo agent should produce failures"
    for f in finished_dashboard["failures"]:
        _check(f, "Failure")
        for tc in f.get("toolCalls") or []:
            _check(tc, "ToolCall")


def test_every_log_matches_LogEvent(finished_dashboard):
    assert finished_dashboard["logs"]
    for log in finished_dashboard["logs"]:
        _check(log, "LogEvent")
        assert log["type"] in ts_union("LogEventType") | KNOWN_API_ONLY["LogEventType"]


def test_values_use_only_allowed_union_members(finished_dashboard):
    d = finished_dashboard
    assert d["status"] in ts_union("DashboardStatus")
    for t in d["tests"]:
        assert t["status"] in ts_union("TestStatus") | KNOWN_API_ONLY["TestStatus"]
        assert t["strategy"] in ts_union("AttackCategory")
    for f in d["failures"]:
        assert f["severity"] in ts_union("Severity") and f["strategy"] in ts_union("AttackCategory")
    for t in d["tests"]:
        for turn in t["conversation"]:
            assert turn["role"] in {"adversight", "target"}
