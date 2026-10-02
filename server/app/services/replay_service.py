"""Replay service: build failure evidence + replay cases, and re-run them against a target.

Every failure ships with (a) the exact conversation / tool calls / violated rule and
(b) a ``ReplayCase``: the attacker messages needed to reproduce it against the target.
"""
from __future__ import annotations

from app.model.failure import FAILURE_LABELS, Failure, Verdict
from app.model.test import TargetSpec, TestResult, ToolCall, Turn
from app.model.trace import ReplayAttempt, ReplayCase, ReplayResult
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
    turn_idx = min(p.turn_index, len(test.turns) - 1) if test.turns else 0
    turn = test.turns[turn_idx] if test.turns else None
    attack_text = turn.attack if turn else test.attack
    response_text = turn.response.text if turn else test.response or ""
    latency_ms = turn.response.latency_ms if turn else 0.0
    calls: list[ToolCall] = []
    for t_idx, t in enumerate(test.turns):
        for tc in t.response.tool_calls:
            calls.append(
                ToolCall(
                    name=tc.name,
                    arguments=tc.arguments,
                    turn_index=getattr(tc, "turn_index", None) if getattr(tc, "turn_index", None) is not None else t_idx,
                )
            )
    label = FAILURE_LABELS.get(p.type.value, p.type.value)
    return Failure(
        id=f"fail_{test.id}",
        test_id=test.id,
        type=p.type.value,
        description=p.description,
        severity=p.severity,
        attack=attack_text,
        response=response_text,
        timestamp=timestamp or utcnow_iso(),
        strategy=test.strategy,
        turns=test.turns,
        tool_calls=calls,
        why_failed=f"{label}: {p.description} Violated rule: {p.violated_rule or 'n/a'}",
        violated_rule=p.violated_rule,
        detector=p.detector,
        confidence=getattr(verdict, "confidence", None) or p.confidence,
        replay_case_id=f"replay_{test.id}",
        all_findings=list(verdict.findings),
        turn_number=turn_idx + 1 if test.turns else 1,
        latency_ms=latency_ms,
        replayable=True,
        confidence_source=getattr(p, "confidence_source", None) or getattr(verdict, "confidence_source", None),
        confidence_evidence=list(getattr(p, "confidence_evidence", None) or getattr(verdict, "confidence_evidence", [])),
        reproducibility="untested",
    )


def _normalize_failure_type(t: str | None) -> str:
    if not t:
        return ""
    reverse_map = {v.lower(): k for k, v in FAILURE_LABELS.items()}
    clean = t.strip().lower()
    return reverse_map.get(clean, clean.replace(" ", "_"))


def replay(
    case: ReplayCase,
    agent: TargetAgent,
    spec: TargetSpec,
    evaluator: Evaluator,
    attempts: int = 1,
) -> ReplayResult:
    """Re-send the exact attacker messages and re-evaluate (no generator, no LLM attacker).

    LLM targets are non-deterministic, so ``attempts > 1`` reports how often the failure recurs.
    Calculates reproduction rate based on completed (non-error) attempts:
    reproductionRate = successfulReproductions / completedAttempts.
    """
    hits = 0
    attempt_details: list[ReplayAttempt] = []
    last_turns: list[Turn] = []
    last_findings: list[Finding] = []
    n = max(1, min(10, attempts))
    expected_norm = _normalize_failure_type(case.expected_failure_type)

    for attempt_idx in range(1, n + 1):
        turns: list[Turn] = []
        attempt_error: str | None = None
        reproduced = False
        findings: list[Finding] = []
        try:
            for msg in case.attacker_messages:
                turns.append(Turn(attack=msg, response=agent.respond(msg, list(turns))))
            verdict = evaluator.evaluate(spec, turns)
            reproduced = any(
                _normalize_failure_type(f.type.value if hasattr(f.type, "value") else str(f.type))
                == expected_norm
                for f in verdict.findings
            )
            findings = verdict.findings
        except Exception as exc:  # noqa: BLE001
            attempt_error = str(exc)

        if not attempt_error:
            for t in turns:
                err_t = t.response.metadata.get("error_type")
                if err_t in ("timeout", "network_error", "target_error", "security_validation_error"):
                    attempt_error = t.response.metadata.get("error") or t.response.text
                    break

        if attempt_error:
            status_str = "error"
            failure_type = None
        elif reproduced:
            hits += 1
            status_str = "reproduced"
            failure_type = case.expected_failure_type
        else:
            status_str = "not_reproduced"
            failure_type = None

        last_turns, last_findings = turns, findings
        attempt_details.append(
            ReplayAttempt(
                attempt_number=attempt_idx,
                reproduced=reproduced,
                status=status_str,
                failure_type=failure_type,
                turns=turns,
                findings=findings,
                error=attempt_error,
            )
        )

    completed_attempts = sum(1 for att in attempt_details if att.error is None)
    reproduction_rate = round(hits / completed_attempts, 2) if completed_attempts > 0 else 0.0

    if completed_attempts == 0:
        overall_status = "pending"
        reproducibility = "untested"
    elif hits == completed_attempts:
        overall_status = "failed"
        reproducibility = "confirmed"
    elif hits > 0:
        overall_status = "failed"
        reproducibility = "nondeterministic"
    else:
        overall_status = "passed"
        reproducibility = "unconfirmed"

    return ReplayResult(
        replay_case_id=case.id,
        reproduced=hits > 0,
        status=overall_status,
        findings=last_findings,
        turns=last_turns,
        attempts=n,
        completed_attempts=completed_attempts,
        reproduced_count=hits,
        reproduction_rate=reproduction_rate,
        reproducibility=reproducibility,
        attempt_details=attempt_details,
    )


def update_failure_with_replay(failure: Failure, replay_result: ReplayResult) -> Failure:
    """Enrich an existing failure with reproducibility signals from replay."""
    failure.reproducibility = replay_result.reproducibility
    failure.reproduction_rate = replay_result.reproduction_rate
    if replay_result.reproduced:
        failure.confidence = min(1.0, round(failure.confidence + 0.05 * (1.0 - failure.confidence), 3))
        failure.confidence_evidence.append(
            f"replay_reproduced: {replay_result.reproduced_count}/{replay_result.completed_attempts} attempts"
        )
    else:
        failure.confidence_evidence.append(
            f"replay_unconfirmed: 0/{replay_result.completed_attempts} attempts"
        )
    return failure
