"""Evidence + replay.

Every failure ships with (a) the exact conversation / tool calls / violated rule and
(b) a ``ReplayCase``: the attacker messages needed to reproduce it against the target.
"""
from __future__ import annotations

import json
from pathlib import Path

from .evaluation import Evaluator
from .interfaces import TargetAgent
from .models import (
    FAILURE_LABELS,
    Failure,
    ReplayCase,
    ReplayResult,
    TargetSpec,
    TestResult,
    ToolCall,
    Turn,
    Verdict,
    utcnow_iso,
)


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


class EvidenceStore:
    """In-memory store with JSON persistence (Member 2 can swap this for a DB)."""

    def __init__(self) -> None:
        self.failures: dict[str, Failure] = {}
        self.replay_cases: dict[str, ReplayCase] = {}

    def add(self, failure: Failure, case: ReplayCase) -> None:
        self.failures[failure.id] = failure
        self.replay_cases[case.id] = case

    def save(self, path: str | Path) -> None:
        data = {
            "failures": [f.model_dump(by_alias=True, mode="json") for f in self.failures.values()],
            "replayCases": [c.model_dump(by_alias=True, mode="json") for c in self.replay_cases.values()],
        }
        Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> EvidenceStore:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        store = cls()
        for f in data["failures"]:
            store.failures[f["id"]] = Failure.model_validate(f)
        for c in data["replayCases"]:
            store.replay_cases[c["id"]] = ReplayCase.model_validate(c)
        return store
