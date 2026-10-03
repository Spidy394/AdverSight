"""Tests for wiring the existing LLM components into production session execution.

The provider, generator and judge all predate this wiring and are unit-tested in
``test_engine.py`` / ``test_detectors.py``. What is new - and what these tests
guard - is the *production path*: that ``start_session`` resolves a mode, that the
runner actually receives ``AttackGenerator(llm=...)`` and ``Evaluator(judge=...)``,
that a missing credential is a loud 503 instead of a silent downgrade, and that
deterministic detectors stay authoritative.

Every test here is hermetic: providers are local fakes and the mode resolver is
either driven through environment variables that are explicitly cleared, or
replaced outright. No test performs network I/O.
"""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import session_service as service
from app.services.llm_provider import (
    GeminiProvider,
    LLMMode,
    LLMProvider,
    LLMRuntime,
    get_llm_provider,
    resolve_llm_runtime,
)
from app.services.testing_engine import TestRunner

BASE = "/api/v1/sessions"

LLM_ENV_VARS = (
    "ADVERSIGHT_LLM",
    "ADVERSIGHT_LLM_EVERY",
    "ADVERSIGHT_LLM_JUDGE",
    "ADVERSIGHT_JUDGE_ALWAYS",
    "ADVERSIGHT_JUDGE_PROMOTES_AT",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
)

SECRET = "SECRET_GEMINI_KEY_DO_NOT_LEAK_4417"


@pytest.fixture(autouse=True)
def clean_llm_env(monkeypatch):
    """Every test starts from a known-empty LLM environment."""
    for name in LLM_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


# ── helpers ─────────────────────────────────────────────────────────────────────


def make_payload(max_tests: int = 4, name: str = "Flight Booking Agent", endpoint: str = "http://localhost:8000/agent") -> dict:
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


def wait_for_completion(client: TestClient, session_id: str, timeout: float = 15.0) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        body = client.get(f"{BASE}/{session_id}").json()
        if body["status"] == "completed":
            return body
        time.sleep(0.05)
    return client.get(f"{BASE}/{session_id}").json()


def runtime(
    provider: LLMProvider | None = None,
    *,
    mode: LLMMode = LLMMode.ENABLED,
    llm_every: int = 1,
    judge_enabled: bool = False,
    judge_always: bool = False,
    judge_promotes_at: float | None = None,
    detail: str = "test runtime",
) -> LLMRuntime:
    return LLMRuntime(
        mode=mode,
        provider=provider,
        model="test-model",
        llm_every=llm_every,
        judge_enabled=judge_enabled,
        judge_always=judge_always,
        judge_promotes_at=judge_promotes_at,
        detail=detail,
    )


class SplitLLM(LLMProvider):
    """Fake that answers the judge and the generator differently.

    ``LLMJudge`` passes its own system prompt, which is how a real provider tells
    the two call sites apart, so this fake does the same instead of guessing.
    """

    def __init__(self, violation: bool = True, confidence: float = 0.97) -> None:
        self.violation = violation
        self.confidence = confidence
        self.generator_calls: list[str] = []
        self.judge_calls: list[str] = []

    def generate(self, prompt: str, system: str | None = None) -> str:
        if system and "strict QA reviewer" in system:
            self.judge_calls.append(prompt)
            return json.dumps(
                {
                    "violation": self.violation,
                    "confidence": self.confidence,
                    "reason": "the agent appears to have leaked protected data",
                }
            )
        self.generator_calls.append(prompt)
        # Distinct per call: AttackGenerator rejects duplicate LLM openings.
        return f"LLM authored adversarial opening number {len(self.generator_calls)} about the booking."


class CapturingRunner(TestRunner):
    """Real runner that records the dependencies the wiring handed it."""

    instances: list["CapturingRunner"] = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        CapturingRunner.instances.append(self)


@pytest.fixture
def capture_runner(monkeypatch):
    """Swap in a capturing runner so wiring can be asserted directly."""
    CapturingRunner.instances = []
    monkeypatch.setattr(service, "TestRunner", CapturingRunner)
    return CapturingRunner


def use_runtime(monkeypatch, rt: LLMRuntime) -> None:
    """Pin the resolved configuration for both ``start_session`` and the worker."""
    monkeypatch.setattr(service, "resolve_llm_runtime", lambda: rt)


def run_session(client: TestClient, monkeypatch, rt: LLMRuntime, **payload_kwargs) -> dict:
    use_runtime(monkeypatch, rt)
    session_id = client.post(BASE, json=make_payload(**payload_kwargs)).json()["sessionId"]
    assert client.post(f"{BASE}/{session_id}/start").status_code == 200
    return wait_for_completion(client, session_id)


# ── configuration resolution ────────────────────────────────────────────────────


def test_default_is_deterministic_even_when_a_key_exists(monkeypatch):
    """A bare key must never silently switch a deployment to nondeterministic runs."""
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    rt = resolve_llm_runtime()

    assert rt.mode is LLMMode.DISABLED
    assert rt.provider is None
    assert not rt.generator_enabled


def test_on_with_key_enables_gemini(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    rt = resolve_llm_runtime()

    assert rt.mode is LLMMode.ENABLED
    assert isinstance(rt.provider, GeminiProvider)
    assert rt.provider.api_key == SECRET
    assert rt.generator_enabled
    assert rt.model == GeminiProvider.DEFAULT_MODEL


def test_on_without_key_is_a_config_error(monkeypatch):
    """Explicitly asking for Gemini and not getting it is an error, not a downgrade."""
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")

    rt = resolve_llm_runtime()

    assert rt.mode is LLMMode.CONFIG_ERROR
    assert rt.provider is None
    assert "GEMINI_API_KEY" in rt.detail
    assert "ADVERSIGHT_LLM=off" in rt.detail


def test_auto_enables_only_when_a_key_is_present(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "auto")
    assert resolve_llm_runtime().mode is LLMMode.DISABLED

    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    assert resolve_llm_runtime().mode is LLMMode.ENABLED


def test_explicit_off_wins_over_a_present_key(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "off")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    rt = resolve_llm_runtime()

    assert rt.mode is LLMMode.DISABLED
    assert rt.provider is None


def test_unrecognised_mode_falls_back_to_deterministic(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "yes-please")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    assert resolve_llm_runtime().mode is LLMMode.DISABLED


def test_model_is_environment_driven(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.0-flash")

    rt = resolve_llm_runtime()

    assert rt.model == "gemini-2.0-flash"
    assert rt.provider.model == "gemini-2.0-flash"


def test_generator_cadence_defaults_to_every_second_scenario():
    assert resolve_llm_runtime().llm_every == 2


@pytest.mark.parametrize("bad", ["0", "-3", "many", ""])
def test_unusable_cadence_falls_back_to_the_default(monkeypatch, bad):
    monkeypatch.setenv("ADVERSIGHT_LLM_EVERY", bad)

    assert resolve_llm_runtime().llm_every == 2


def test_cadence_is_configurable(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM_EVERY", "5")

    assert resolve_llm_runtime().llm_every == 5


def test_judge_is_review_only_by_default(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    rt = resolve_llm_runtime()

    assert rt.judge_enabled is True
    assert rt.judge_promotes_at is None, "judge must not be able to fail a test by default"


@pytest.mark.parametrize("bad", ["high", "1.7", "-0.2"])
def test_unusable_promotion_threshold_keeps_the_judge_review_only(monkeypatch, bad):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    monkeypatch.setenv("ADVERSIGHT_JUDGE_PROMOTES_AT", bad)

    assert resolve_llm_runtime().judge_promotes_at is None


def test_judge_can_be_turned_off(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    monkeypatch.setenv("ADVERSIGHT_LLM_JUDGE", "off")

    assert resolve_llm_runtime().judge_enabled is False


def test_judge_always_is_off_by_default_and_gated_on_the_judge(monkeypatch):
    assert resolve_llm_runtime().judge_always is False

    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    monkeypatch.setenv("ADVERSIGHT_JUDGE_ALWAYS", "true")
    monkeypatch.setenv("ADVERSIGHT_LLM_JUDGE", "off")

    rt = resolve_llm_runtime()
    assert rt.judge_always is False, "judge_always is meaningless with the judge disabled"


def test_configuration_never_leaks_the_credential(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    rt = resolve_llm_runtime()

    assert SECRET not in rt.detail
    assert SECRET not in repr(rt)
    assert SECRET not in json.dumps(
        {
            "mode": rt.mode.value,
            "model": rt.model,
            "llm_every": rt.llm_every,
            "judge_enabled": rt.judge_enabled,
            "judge_always": rt.judge_always,
            "judge_promotes_at": rt.judge_promotes_at,
            "detail": rt.detail,
        }
    )


def test_config_error_detail_never_leaks_the_credential(monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")

    assert SECRET not in resolve_llm_runtime().detail


def test_legacy_provider_factory_is_unchanged(monkeypatch):
    """``get_llm_provider`` stays a plain key check for its existing callers."""
    assert get_llm_provider() is None

    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    assert isinstance(get_llm_provider(), GeminiProvider)


# ── health reporting ────────────────────────────────────────────────────────────


def test_health_reports_deterministic_mode_by_default(client):
    body = client.get("/health").json()

    assert body["geminiConfigured"] is False
    assert body["llmMode"] == "disabled"


def test_health_reports_enabled_mode(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)

    body = client.get("/health").json()

    assert body["geminiConfigured"] is True
    assert body["llmMode"] == "enabled"
    assert SECRET not in json.dumps(body)


def test_health_reports_config_error(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")

    body = client.get("/health").json()

    assert body["geminiConfigured"] is False
    assert body["llmMode"] == "config_error"


# ── production wiring: dependencies handed to the runner ────────────────────────


def test_runner_receives_the_resolved_provider(client, monkeypatch, capture_runner):
    provider = SplitLLM()

    run_session(client, monkeypatch, runtime(provider))

    assert capture_runner.instances, "session never constructed a TestRunner"
    generator = capture_runner.instances[0].generator
    assert generator.llm is provider


def test_runner_receives_the_configured_cadence(client, monkeypatch, capture_runner):
    run_session(client, monkeypatch, runtime(SplitLLM(), llm_every=3))

    assert capture_runner.instances[0].generator.llm_every == 3


def test_runner_receives_the_judge(client, monkeypatch, capture_runner):
    provider = SplitLLM()

    run_session(
        client,
        monkeypatch,
        runtime(provider, judge_enabled=True, judge_always=True),
    )

    evaluator = capture_runner.instances[0].evaluator
    assert evaluator.judge is not None
    assert evaluator.judge.llm is provider
    assert evaluator.judge_always is True


def test_deterministic_run_gets_no_provider_and_no_judge(client, monkeypatch, capture_runner):
    run_session(
        client,
        monkeypatch,
        runtime(None, mode=LLMMode.DISABLED, judge_enabled=False),
    )

    instance = capture_runner.instances[0]
    assert instance.generator.llm is None
    assert instance.evaluator.judge is None
    assert instance.evaluator.judge_always is False


# ── production wiring: observable behaviour ─────────────────────────────────────


def test_generator_actually_calls_the_provider(client, monkeypatch):
    provider = SplitLLM()

    body = run_session(client, monkeypatch, runtime(provider, llm_every=1))

    assert provider.generator_calls, "the LLM path was configured but never called"
    assert any(
        attack.startswith("LLM authored adversarial opening")
        for test in body["tests"]
        for attack in [test["attack"]]
    ), "no test used an LLM-authored opening"


def test_deterministic_run_never_calls_a_provider(client, monkeypatch):
    provider = SplitLLM()

    body = run_session(
        client,
        monkeypatch,
        runtime(None, mode=LLMMode.DISABLED, judge_enabled=False),
    )

    assert not provider.generator_calls
    assert not provider.judge_calls
    assert all(
        not test["attack"].startswith("LLM authored") for test in body["tests"]
    )


def test_judge_is_actually_consulted(client, monkeypatch):
    """With judge_always the judge must be reached, not merely constructed."""
    provider = SplitLLM()

    run_session(
        client,
        monkeypatch,
        runtime(provider, judge_enabled=True, judge_always=True),
    )

    assert provider.judge_calls, "the judge was wired but never consulted"


def test_judge_cannot_fail_a_test_on_its_own(client, monkeypatch):
    """A confident judge verdict must not manufacture a failure on a secure agent."""
    provider = SplitLLM(violation=True, confidence=0.99)

    body = run_session(
        client,
        monkeypatch,
        runtime(provider, judge_enabled=True, judge_always=True),
        name="Secure Flight Booking Agent",
        endpoint="http://localhost:8000/agent/secure",
    )

    assert provider.judge_calls, "the judge was never consulted, so this proves nothing"
    assert body["failures"] == [], "the judge created a failure without a detector"
    assert all(f.get("detector") != "llm_judge" for f in body["failures"])


def test_judge_promotion_requires_an_explicit_threshold(client, monkeypatch, capture_runner):
    provider = SplitLLM()

    run_session(
        client,
        monkeypatch,
        runtime(provider, judge_enabled=True, judge_always=True, judge_promotes_at=0.9),
    )

    assert capture_runner.instances[0].evaluator.judge_promotes_at == 0.9


def test_provider_failure_falls_back_to_templates(client, monkeypatch):
    """A broken Gemini must not break the session; the documented fallback applies."""
    provider = SplitLLM()
    provider.generate = lambda prompt, system=None: (_ for _ in ()).throw(RuntimeError("quota exceeded"))

    body = run_session(client, monkeypatch, runtime(provider, llm_every=1))

    assert body["status"] == "completed"
    assert body["tests"], "session produced no tests after a provider failure"
    assert all(
        not test["attack"].startswith("LLM authored") for test in body["tests"]
    )


def test_session_log_states_which_path_was_used(client, monkeypatch):
    body = run_session(
        client,
        monkeypatch,
        runtime(SplitLLM(), detail="Gemini enabled for this run"),
    )

    messages = [log["message"] for log in body["logs"]]
    assert any("LLM path: enabled" in m for m in messages)
    assert any("Gemini enabled for this run" in m for m in messages)


def test_deterministic_session_log_says_disabled(client, monkeypatch):
    body = run_session(
        client,
        monkeypatch,
        runtime(None, mode=LLMMode.DISABLED, detail="running deterministic"),
    )

    assert any("LLM path: disabled" in log["message"] for log in body["logs"])


def test_dashboard_exposes_the_mode(client, monkeypatch):
    body = run_session(client, monkeypatch, runtime(SplitLLM()))

    assert body["llmMode"] == "enabled"


def test_dashboard_mode_is_null_before_start(client):
    session_id = client.post(BASE, json=make_payload()).json()["sessionId"]

    body = client.get(f"{BASE}/{session_id}").json()

    assert body["llmMode"] is None
    assert body["status"] == "idle"


# ── configuration failure surfaces as a clear backend error ─────────────────────


def test_config_error_returns_503(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    session_id = client.post(BASE, json=make_payload()).json()["sessionId"]

    response = client.post(f"{BASE}/{session_id}/start")

    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_config_error_leaves_the_session_idle(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    session_id = client.post(BASE, json=make_payload()).json()["sessionId"]

    client.post(f"{BASE}/{session_id}/start")

    body = client.get(f"{BASE}/{session_id}").json()
    assert body["status"] == "idle"
    assert body["tests"] == [], "a failed configuration must not start a run"
    assert body["llmMode"] is None


def test_config_error_does_not_leak_the_requested_key(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    session_id = client.post(BASE, json=make_payload()).json()["sessionId"]

    body = client.post(f"{BASE}/{session_id}/start").text

    assert SECRET not in body


def test_config_error_can_be_recovered_by_disabling_the_llm(client, monkeypatch):
    monkeypatch.setenv("ADVERSIGHT_LLM", "on")
    session_id = client.post(BASE, json=make_payload()).json()["sessionId"]
    assert client.post(f"{BASE}/{session_id}/start").status_code == 503

    monkeypatch.setenv("ADVERSIGHT_LLM", "off")
    assert client.post(f"{BASE}/{session_id}/start").status_code == 200
    assert wait_for_completion(client, session_id)["status"] == "completed"


# ── replay stays deterministic ──────────────────────────────────────────────────


def test_replay_never_consults_the_llm(client, monkeypatch):
    """Replay is the reproduction oracle: it must never call generator or judge.

    Runs a real session that produces recorded evidence, replays it, and asserts
    the provider saw no further calls - so the LLM path stays out of replay.
    """
    provider = SplitLLM()

    body = run_session(
        client,
        monkeypatch,
        runtime(provider, llm_every=1, judge_enabled=True, judge_always=True),
        max_tests=6,
    )
    assert body["tests"], "no tests recorded, so there is nothing to replay"

    generator_calls_before = len(provider.generator_calls)
    judge_calls_before = len(provider.judge_calls)

    test_id = body["tests"][0]["id"]
    replay_response = client.post(f"/api/v1/tests/{test_id}/replay", json={"attempts": 1})
    assert replay_response.status_code == 200, replay_response.text

    assert len(provider.generator_calls) == generator_calls_before
    assert len(provider.judge_calls) == judge_calls_before


def test_bare_evaluator_has_no_judge():
    """The replay construction sites rely on this default."""
    from app.services.evaluator import Evaluator

    assert Evaluator().judge is None
    assert Evaluator().judge_always is False
    assert Evaluator().judge_promotes_at is None