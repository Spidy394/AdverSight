"""Replay service: build failure evidence + replay cases, and re-run them against a target.

Every failure ships with (a) the exact conversation / tool calls / violated rule and
(b) a ``ReplayCase``: the attacker messages needed to reproduce it against the target.
"""
from __future__ import annotations

from app.model.failure import FAILURE_LABELS, Failure, Verdict
from app.model.test import TargetSpec, TestResult, ToolCall, Turn
from app.model.trace import ReplayCase, ReplayResult
from app.services.evaluator import Evaluator
from app.util.trace_commons import TargetAgent, utcnow_iso


def build_replay_case(test: TestResult, spec: TargetSpec, verdict: Verdict) -> ReplayCase:
    assert verdict.primary is not None, "replay cases are only built for failures"
    return ReplayCase(
        id=f"replay_{test.id}",
        test_id=test.id,
        strategy=test.strategy,
        target_name=spec.name,
        attacker_messages=[t.attack for t in test.turns],
        expected_failure_type=verdict.primary.type.value,
        created_at=utcnow_iso(),
    )


def build_failure(test: TestResult, spec: TargetSpec, verdict: Verdict, timestamp: str | None = None) -> Failure:
    p = verdict.primary
    assert p is not None, "build_failure needs a failing verdict"
    # show the turn where the violation happened as the headline attack/response
    turn = test.turns[min(p.turn_index, len(test.turns) - 1)]
    calls: list[ToolCall] = [tc for t in test.turns for tc in t.response.tool_calls]
    label = FAILURE_LABELS.get(p.type.value, p.type.value)
    return Failure(
        id=f"fail_{test.id}",
        test_id=test.id,
        type=p.type.value,
        description=p.description,
        severity=p.severity,
        attack=turn.attack,
        response=turn.response.text,
        timestamp=timestamp or utcnow_iso(),
        strategy=test.strategy,
        turns=test.turns,
        tool_calls=calls,
        why_failed=f"{label}: {p.description} Violated rule: {p.violated_rule or 'n/a'}",
        violated_rule=p.violated_rule,
        detector=p.detector,
        confidence=p.confidence,
        replay_case_id=f"replay_{test.id}",
    )


def replay(
    case: ReplayCase,
    agent: TargetAgent,
    spec: TargetSpec,
    evaluator: Evaluator,
    attempts: int = 1,
) -> ReplayResult:
    """Re-send the exact attacker messages and re-evaluate (no generator, no LLM attacker).

    LLM targets are non-deterministic, so ``attempts > 1`` reports how often the failure recurs.
    """
    hits, last_turns, last_findings = 0, [], []
    for _ in range(max(1, attempts)):
        turns: list[Turn] = []
        for msg in case.attacker_messages:
            turns.append(Turn(attack=msg, response=agent.respond(msg, list(turns))))
        verdict = evaluator.evaluate(spec, turns)
        if any(f.type.value == case.expected_failure_type for f in verdict.findings):
            hits += 1
        last_turns, last_findings = turns, verdict.findings
    n = max(1, attempts)
    return ReplayResult(
        replay_case_id=case.id,
        reproduced=hits > 0,
        status="failed" if hits else "passed",
        findings=last_findings,
        turns=last_turns,
        attempts=n,
        reproduced_count=hits,
        reproduction_rate=hits / n,
    )
