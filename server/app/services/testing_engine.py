"""Testing engine: orchestrates one AdverSight session (plan -> run -> evaluate -> collect evidence).

Member 2 can wrap this in a background task and stream ``on_event`` over SSE/WebSocket.
"""
from __future__ import annotations

from collections import deque
from collections.abc import Callable, Sequence
from datetime import datetime

from app.model.test import AttackCategory, AttackScenario, TargetSpec, TestResult, Turn
from app.model.trace import LogEvent, SessionReport
from app.services.attack_generator import AttackGenerator
from app.services.evaluator import Evaluator, summarize
from app.services.replay_service import build_failure, build_replay_case
from app.services.trace_collector import TraceCollector
from app.util.trace_commons import TargetAgent


class TestRunner:
    __test__ = False  # not a pytest class

    def __init__(
        self,
        agent: TargetAgent,
        spec: TargetSpec,
        generator: AttackGenerator | None = None,
        evaluator: Evaluator | None = None,
        store: TraceCollector | None = None,
        on_event: Callable[[LogEvent], None] | None = None,
        on_test: Callable[[TestResult], None] | None = None,
    ):
        self.agent, self.spec = agent, spec
        self.generator = generator or AttackGenerator()
        self.evaluator = evaluator or Evaluator()
        self.store = store or TraceCollector()
        self.on_event, self.on_test = on_event, on_test
        self.logs: list[LogEvent] = []

    def _log(self, type_: str, message: str) -> None:
        ev = LogEvent(timestamp=datetime.now().strftime("%H:%M:%S"), type=type_, message=message)
        self.logs.append(ev)
        if self.on_event:
            self.on_event(ev)

    def run(
        self, categories: Sequence[AttackCategory], max_tests: int = 20, max_turns: int = 5
    ) -> SessionReport:
        scenarios = self.generator.plan(self.spec, categories, max_tests, max_turns)
        pending = deque(scenarios)
        results: list[TestResult] = []
        max_variants = max(1, len(scenarios) // 4)
        variants = 0
        while pending:
            sc = pending.popleft()
            res = self.run_test(sc)
            results.append(res)
            if res.status in ("passed", "failed"):
                self.generator.record_outcome(sc.strategy, res.status == "failed")
            rest = self.generator.prioritize(list(pending))  # learn: best strategies first
            if res.status == "failed" and rest and variants < max_variants:
                victim = rest.pop()  # sacrifice the least promising pending test
                variant = self.generator.spawn_variant(sc, self.spec, victim.id)
                if variant:
                    variants += 1
                    rest.insert(0, variant)
                    self._log("ATTACK_ADAPTED", f"variant of {sc.id} queued (same weakness, new framing)")
                else:
                    rest.append(victim)
            for k, s in enumerate(rest):  # keep ids sequential in execution order
                s.id = f"test_{len(results) + k + 1:03d}"
            pending = deque(rest)
        summary = summarize(results, total_planned=len(scenarios))
        for f in self.store.failures.values():
            summary.by_severity[f.severity] = summary.by_severity.get(f.severity, 0) + 1
        self._log("SESSION_COMPLETED", f"{summary.passed} passed, {summary.failed} failed")
        return SessionReport(
            tests=results,
            failures=list(self.store.failures.values()),
            logs=self.logs,
            summary=summary,
            replay_cases=list(self.store.replay_cases.values()),
        )

    def run_test(self, sc: AttackScenario) -> TestResult:
        result = TestResult(
            id=sc.id, strategy=sc.strategy, attack=sc.attack, status="running", category=sc.category
        )
        if self.on_test:
            self.on_test(result)
        self._log("TEST_STARTED", f"{sc.id} strategy={sc.strategy}")
        turns: list[Turn] = []
        message: str | None = sc.attack
        while message is not None:
            self._log("ATTACK_GENERATED", message[:120])
            self._log("REQUEST_SENT", f"{sc.id} turn {len(turns) + 1}")
            try:
                resp = self.agent.respond(message, list(turns))
            except Exception as exc:  # noqa: BLE001 - a flaky target must not kill the session
                self._log("AGENT_ERROR", f"{sc.id}: {exc}")
                result.status, result.response = "pending", f"agent error: {exc}"
                result.turns = turns
                return result
            turns.append(Turn(attack=message, response=resp))
            self._log("AGENT_RESPONSE_RECEIVED", resp.text[:120])
            for tc in resp.tool_calls:
                self._log(f"TOOL_CALL: {tc.name}", str(tc.arguments))
            message = self.generator.next_turn(sc, self.spec, turns)

        self._log("RESPONSE_ANALYZED", f"{sc.id} {len(turns)} turn(s)")
        verdict = self.evaluator.evaluate(self.spec, turns)
        result.turns = turns
        result.response = turns[-1].response.text
        result.needs_review = verdict.needs_review
        if verdict.passed:
            result.status = "passed"
            note = f" (flagged for review: {verdict.review_note})" if verdict.needs_review else ""
            self._log("POLICY_CHECK: PASSED", sc.id + note)
        else:
            result.status = "failed"
            result.failure_type = verdict.primary.type.value  # type: ignore[union-attr]
            self._log("POLICY_CHECK: FAILED", f"{sc.id} {result.failure_type}")
            self.store.add(
                build_failure(result, self.spec, verdict),
                build_replay_case(result, self.spec, verdict),
            )
            self._log("FAILURE_RECORDED", f"{sc.id} {result.failure_type}")
        if self.on_test:
            self.on_test(result)
        return result
