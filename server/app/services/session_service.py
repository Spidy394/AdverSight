"""In-memory Testing Session service.

Owns session lifecycle, state machine, and orchestrates the TestRunner execution.
Publishes real-time session events to EventBroker for SSE streaming.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
from typing import Any
from uuid import uuid4

from app.model.event import TestEvent, TestEventType
from app.model.failure import Failure as EngineFailure
from app.model.session import (
    AttackCategory,
    ConversationTurn,
    Failure,
    FailureReplayResponse,
    LogEvent,
    LogEventType,
    ReplayAttemptDetail,
    ReplayRequest,
    SessionDashboard,
    SessionStatus,
    Severity,
    TargetAgent as SessionTargetAgent,
    TestCase,
    TestProgress,
    TestSessionConfig,
    TestStatus,
    ToolCall,
    TurnRole,
)
from app.model.test import AttackCategory as EngineCat, TestResult, Turn
from app.model.trace import LogEvent as AppModelLogEvent, ReplayCase
from app.services.agent_adapter import get_agent_catalog, spec_for_agent
from app.services.demo_agents import FlightBookingAgent, flight_spec
from app.services.evaluator import Evaluator
from app.services.event_broker import event_broker
from app.services.replay_service import replay
from app.services.testing_engine import TestRunner
from app.storage.repository import storage
from app.util.sanitizer import sanitize_dict, sanitize_text
from app.util.trace_commons import TargetAgent


# ── Errors ──────────────────────────────────────────────────────────────────────


class SessionError(Exception):
    """Base class for session service errors."""


class SessionNotFoundError(SessionError):
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        super().__init__(f"Session '{session_id}' does not exist.")


class SessionStateError(SessionError):
    def __init__(self, session_id: str, current: SessionStatus, action: str) -> None:
        self.session_id = session_id
        self.current = current
        super().__init__(
            f"Cannot {action} session '{session_id}' while it is '{current.value}'."
        )


class FailureNotFoundError(SessionError):
    def __init__(self, failure_id: str) -> None:
        self.failure_id = failure_id
        super().__init__(f"Failure evidence '{failure_id}' does not exist.")


class MissingReplayEvidenceError(SessionError):
    def __init__(self, message: str) -> None:
        super().__init__(message)


class TargetAdapterError(SessionError):
    def __init__(self, message: str) -> None:
        super().__init__(message)


# ── Internal record ─────────────────────────────────────────────────────────────


@dataclass(slots=True)
class SessionRecord:
    """Server-side session state.

    The lifecycle ``datetime`` fields are internal bookkeeping only — they are
    intentionally not part of the response schema.
    """

    session_id: str
    config: TestSessionConfig
    status: SessionStatus = SessionStatus.IDLE
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    tests: list[TestCase] = field(default_factory=list)
    failures: list[Failure] = field(default_factory=list)
    logs: list[LogEvent] = field(default_factory=list)
    active_test_id: str | None = None


_sessions: dict[str, SessionRecord] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}
_cancel_flags: dict[str, threading.Event] = {}
_lock = asyncio.Lock()


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _hhmmss() -> str:
    """Wall-clock ``HH:MM:SS``."""
    return datetime.now().strftime("%H:%M:%S")


def _append_log(record: SessionRecord, event_type: LogEventType, message: str) -> LogEvent:
    if event_type == LogEventType.SESSION_COMPLETED:
        existing = next((l for l in record.logs if l.type == LogEventType.SESSION_COMPLETED), None)
        if existing:
            return existing
    event = LogEvent(
        id=f"log_{uuid4().hex[:12]}",
        timestamp=_hhmmss(),
        type=event_type,
        message=message,
        test_id=record.active_test_id,
    )
    record.logs.append(event)
    return event


def _derive_progress(record: SessionRecord) -> TestProgress:
    """Compute ``TestProgress`` from the test list."""
    passed = sum(1 for t in record.tests if t.status is TestStatus.PASSED)
    failed = sum(1 for t in record.tests if t.status is TestStatus.FAILED)
    running = sum(1 for t in record.tests if t.status is TestStatus.RUNNING)
    total = len(record.tests) or record.config.max_tests
    completed = passed + failed
    return TestProgress(
        total=total,
        completed=completed,
        passed=passed,
        failed=failed,
        running=running,
    )


def _to_log_event_type(raw_type: str) -> LogEventType:
    if raw_type.startswith("TOOL_CALL"):
        return LogEventType.TOOL_CALL
    if raw_type.startswith("POLICY_CHECK"):
        return LogEventType.POLICY_CHECK
    if raw_type in ("ATTACK_ADAPTED", "ATTACK_GENERATED"):
        return LogEventType.ATTACK_GENERATED
    if raw_type == "AGENT_ERROR":
        return LogEventType.TEST_COMPLETED
    for m in LogEventType:
        if m.value == raw_type:
            return m
    return LogEventType.TEST_COMPLETED


def _map_log_to_test_event_type(raw_type: str) -> TestEventType | None:
    if raw_type == "SESSION_STARTED":
        return TestEventType.SESSION_STARTED
    if raw_type == "TEST_STARTED":
        return TestEventType.TEST_STARTED
    if raw_type in ("ATTACK_GENERATED", "ATTACK_ADAPTED"):
        return TestEventType.ATTACK_GENERATED
    if raw_type == "WEAKNESS_IDENTIFIED":
        return TestEventType.WEAKNESS_IDENTIFIED
    if raw_type == "REQUEST_SENT":
        return TestEventType.REQUEST_SENT
    if raw_type == "AGENT_RESPONSE_RECEIVED":
        return TestEventType.AGENT_RESPONSE_RECEIVED
    if raw_type.startswith("TOOL_CALL"):
        return TestEventType.TOOL_CALL
    if raw_type == "RESPONSE_ANALYZED":
        return TestEventType.RESPONSE_ANALYZED
    if raw_type.startswith("POLICY_CHECK"):
        return TestEventType.POLICY_CHECK
    if raw_type == "FAILURE_RECORDED":
        return TestEventType.FAILURE_RECORDED
    if raw_type == "SESSION_COMPLETED":
        return TestEventType.SESSION_COMPLETED
    if raw_type == "SESSION_STOPPED":
        return TestEventType.SESSION_STOPPED
    return None


def _select_agent(config: TestSessionConfig) -> TargetAgent:
    """Select appropriate agent instance based on endpoint/name configuration."""
    name = (config.target_agent.name or "").lower()
    endpoint = (config.target_agent.endpoint or "").lower()
    if "secure" in name or "secure" in endpoint:
        return FlightBookingAgent(vulnerable=False, leaky=False)
    # Default to vulnerable & leaky for adversarial security evaluation
    return FlightBookingAgent(vulnerable=True, leaky=True)


def _map_result_to_test_case(
    result: TestResult,
    test_number: int,
    session_id: str | None = None,
    failure_id: str | None = None,
) -> TestCase:
    cat_val = (
        AttackCategory(result.strategy)
        if result.strategy in [c.value for c in AttackCategory]
        else AttackCategory.POLICY_VIOLATION
    )
    status_val = TestStatus(result.status)
    conv: list[ConversationTurn] = []
    ts = _hhmmss()
    for turn in result.turns:
        conv.append(ConversationTurn(role=TurnRole.ADVERSIGHT, content=turn.attack, timestamp=ts))
        conv.append(ConversationTurn(role=TurnRole.TARGET, content=turn.response.text, timestamp=ts))

    tool_calls: list[ToolCall] = []
    for turn in result.turns:
        for tc in turn.response.tool_calls:
            tool_calls.append(ToolCall(name=tc.name, arguments=tc.arguments, timestamp=ts))

    return TestCase(
        id=result.id,
        session_id=session_id,
        test_number=test_number,
        strategy=cat_val,
        attack=result.attack,
        status=status_val,
        conversation=conv,
        turns=conv,
        response=result.response,
        tool_calls=tool_calls if tool_calls else None,
        failure_id=failure_id,
        failure_type=result.failure_type,
        started_at=ts,
        completed_at=ts if result.status in ("passed", "failed") else None,
    )


def _map_failure_to_session_failure(
    fail_obj: Any,
    test_number: int,
    session_id: str | None = None,
    target_agent_id: str | None = None,
    target_agent_name: str | None = None,
    target_agent_endpoint: str | None = None,
    conversation: list[ConversationTurn] | None = None,
) -> Failure:
    cat_val = (
        AttackCategory(fail_obj.strategy)
        if fail_obj.strategy in [c.value for c in AttackCategory]
        else AttackCategory.POLICY_VIOLATION
    )
    sev_val = Severity(fail_obj.severity)

    tool_calls = [
        ToolCall(
            name=tc.name,
            arguments=sanitize_dict(getattr(tc, "arguments", {}) or {}),
            timestamp=getattr(tc, "timestamp", None) or fail_obj.timestamp,
            turn_index=getattr(tc, "turn_index", None),
            result=sanitize_dict(getattr(tc, "result", None))
            if isinstance(getattr(tc, "result", None), dict)
            else getattr(tc, "result", None),
            authorized=getattr(tc, "authorized", None),
        )
        for tc in getattr(fail_obj, "tool_calls", []) or []
    ]

    engine_turns = getattr(fail_obj, "turns", None)
    if not conversation and engine_turns and len(engine_turns) > 0 and hasattr(engine_turns[0], "attack"):
        conversation = []
        for t_idx, t in enumerate(engine_turns):
            turn_no = t_idx + 1
            conversation.append(
                ConversationTurn(
                    role=TurnRole.ADVERSIGHT,
                    content=sanitize_text(t.attack),
                    timestamp=fail_obj.timestamp,
                    turn_number=turn_no,
                )
            )
            t_tool_calls = [
                ToolCall(
                    name=tc.name,
                    arguments=sanitize_dict(getattr(tc, "arguments", {}) or {}),
                    timestamp=fail_obj.timestamp,
                    turn_index=t_idx,
                )
                for tc in (getattr(t.response, "tool_calls", []) or [])
            ]
            conversation.append(
                ConversationTurn(
                    role=TurnRole.TARGET,
                    content=sanitize_text(t.response.text if hasattr(t.response, "text") else str(t.response)),
                    timestamp=fail_obj.timestamp,
                    turn_number=turn_no,
                    tool_calls=t_tool_calls if t_tool_calls else None,
                    latency_ms=getattr(t.response, "latency_ms", None),
                )
            )

    chronological_trace: list[dict[str, Any]] = []
    if engine_turns and len(engine_turns) > 0 and hasattr(engine_turns[0], "attack"):
        for t_idx, t in enumerate(engine_turns):
            resp_text = t.response.text if hasattr(t.response, "text") else str(t.response)
            t_calls = getattr(t.response, "tool_calls", []) or []
            chronological_trace.append({
                "turnNumber": t_idx + 1,
                "attack": sanitize_text(t.attack),
                "response": sanitize_text(resp_text),
                "toolCalls": [
                    {
                        "name": tc.name,
                        "arguments": sanitize_dict(getattr(tc, "arguments", {}) or {}),
                        "turnIndex": t_idx,
                    }
                    for tc in t_calls
                ],
                "latencyMs": getattr(t.response, "latency_ms", None),
            })
    elif conversation:
        for i in range(0, len(conversation), 2):
            adv_turn = conversation[i]
            tgt_turn = conversation[i + 1] if i + 1 < len(conversation) else None
            chronological_trace.append({
                "turnNumber": (i // 2) + 1,
                "attack": sanitize_text(adv_turn.content),
                "response": sanitize_text(tgt_turn.content) if tgt_turn else "",
                "toolCalls": [
                    {
                        "name": tc.name,
                        "arguments": sanitize_dict(tc.arguments or {}),
                        "turnIndex": tc.turn_index if tc.turn_index is not None else (i // 2),
                    }
                    for tc in (tgt_turn.tool_calls or [])
                ] if tgt_turn else [],
                "latencyMs": tgt_turn.latency_ms if tgt_turn else None,
            })
    else:
        chronological_trace.append({
            "turnNumber": getattr(fail_obj, "turn_number", 1) or 1,
            "attack": sanitize_text(fail_obj.attack),
            "response": sanitize_text(fail_obj.response),
            "toolCalls": [tc.model_dump(by_alias=True) for tc in tool_calls] if tool_calls else [],
            "latencyMs": getattr(fail_obj, "latency_ms", None),
        })

    all_findings = getattr(fail_obj, "all_findings", None)
    detector_results: list[dict[str, Any]] = []
    if all_findings:
        for idx, f in enumerate(all_findings):
            f_type = getattr(f.type, "value", str(f.type)) if hasattr(f, "type") else None
            f_sev = getattr(f.severity, "value", str(f.severity)) if hasattr(f, "severity") else None
            detector_results.append({
                "detector": getattr(f, "detector", None),
                "condition": f_type,
                "severity": f_sev,
                "confidence": getattr(f, "confidence", 1.0),
                "reason": getattr(f, "description", None),
                "violatedRule": getattr(f, "violated_rule", None),
                "isPrimary": (idx == 0),
                "turnIndex": getattr(f, "turn_index", None),
            })
    else:
        detector_results.append({
            "detector": getattr(fail_obj, "detector", None),
            "condition": fail_obj.type,
            "severity": sev_val.value,
            "confidence": getattr(fail_obj, "confidence", 1.0) or 1.0,
            "reason": getattr(fail_obj, "why_failed", fail_obj.description),
            "violatedRule": getattr(fail_obj, "violated_rule", None),
            "isPrimary": True,
            "turnIndex": getattr(fail_obj, "turn_number", 1) - 1 if getattr(fail_obj, "turn_number", None) else None,
        })

    fail_id = (
        f"fail_{session_id}_{fail_obj.test_id}"
        if session_id and not fail_obj.id.startswith(f"fail_{session_id}")
        else fail_obj.id
    )

    why_failed = getattr(fail_obj, "why_failed", fail_obj.description)
    violated_rule = getattr(fail_obj, "violated_rule", None)
    detector = getattr(fail_obj, "detector", None)
    confidence = getattr(fail_obj, "confidence", None)
    turn_number = getattr(fail_obj, "turn_number", None)
    latency_ms = getattr(fail_obj, "latency_ms", None)
    replayable = getattr(fail_obj, "replayable", True)
    confidence_source = getattr(fail_obj, "confidence_source", None)
    confidence_evidence = getattr(fail_obj, "confidence_evidence", None) or []
    reproducibility = getattr(fail_obj, "reproducibility", "untested")
    reproduction_rate = getattr(fail_obj, "reproduction_rate", None)

    evidence = {
        "conversation": [t.model_dump(by_alias=True) for t in conversation] if conversation else [],
        "attack": sanitize_text(fail_obj.attack),
        "response": sanitize_text(fail_obj.response),
        "agentResponse": sanitize_text(fail_obj.response),
        "agentResponses": [sanitize_text(fail_obj.response)],
        "toolCalls": [tc.model_dump(by_alias=True) for tc in tool_calls] if tool_calls else [],
        "violatedPolicy": violated_rule,
        "violatedRule": violated_rule,
        "detector": detector,
        "confidence": confidence,
        "confidenceSource": confidence_source,
        "confidenceEvidence": confidence_evidence,
        "reproducibility": reproducibility,
        "reproductionRate": reproduction_rate,
        "reason": why_failed,
        "whyItFailed": why_failed,
        "detectorResults": detector_results,
        "chronologicalTrace": chronological_trace,
        "turnNumber": turn_number,
        "latencyMs": latency_ms,
        "replayable": replayable,
    }

    return Failure(
        id=fail_id,
        test_id=fail_obj.test_id,
        test_number=test_number,
        type=fail_obj.type,
        strategy=cat_val,
        description=fail_obj.description,
        severity=sev_val,
        attack=sanitize_text(fail_obj.attack),
        response=sanitize_text(fail_obj.response),
        tool_calls=tool_calls if tool_calls else None,
        why_it_failed=why_failed,
        timestamp=fail_obj.timestamp,
        session_id=session_id,
        target_agent_id=target_agent_id,
        target_agent_name=target_agent_name,
        target_agent_endpoint=target_agent_endpoint,
        replay_case_id=getattr(fail_obj, "replay_case_id", f"replay_{fail_obj.test_id}"),
        conversation=conversation,
        violated_rule=violated_rule,
        violated_policy=violated_rule,
        detector=detector,
        confidence=confidence,
        reason=why_failed,
        evidence=evidence,
        turn_number=turn_number,
        latency_ms=latency_ms,
        detector_results=detector_results,
        replayable=replayable,
        confidence_source=confidence_source,
        confidence_evidence=confidence_evidence,
        reproducibility=reproducibility,
        reproduction_rate=reproduction_rate,
    )


# ── Execution Worker ────────────────────────────────────────────────────────────


async def _run_session_worker(
    session_id: str, cancel_event: threading.Event, loop: asyncio.AbstractEventLoop
) -> None:
    try:
        record = await get_session(session_id)
    except SessionNotFoundError:
        async with _lock:
            _active_tasks.pop(session_id, None)
            _cancel_flags.pop(session_id, None)
        return

    # Yield control to event loop so start HTTP response completes cleanly
    await asyncio.sleep(0.05)
    if cancel_event.is_set():
        async with _lock:
            _active_tasks.pop(session_id, None)
            _cancel_flags.pop(session_id, None)
        return

    agent, spec = spec_for_agent(
        record.config.target_agent.id,
        record.config.target_agent.name,
        record.config.target_agent.endpoint,
    )

    raw_cats = record.config.attack_categories
    if raw_cats:
        cats = [EngineCat(c.value) for c in raw_cats if c.value in [e.value for e in EngineCat]]
    else:
        cats = list(EngineCat)

    max_tests = record.config.max_tests
    max_turns = record.config.max_turns_per_test

    def on_engine_event(ev: AppModelLogEvent) -> None:
        log_type = _to_log_event_type(ev.type)
        record_log = LogEvent(
            id=f"log_{uuid4().hex[:12]}",
            timestamp=ev.timestamp,
            type=log_type,
            message=ev.message,
            test_id=record.active_test_id,
        )
        record.logs.append(record_log)

        evt_type = _map_log_to_test_event_type(ev.type)
        if evt_type:
            event_broker.publish_threadsafe(
                loop,
                session_id,
                TestEvent(
                    session_id=session_id,
                    type=evt_type,
                    timestamp=ev.timestamp,
                    test_id=record.active_test_id,
                    message=ev.message,
                    data={"rawType": ev.type, "message": ev.message},
                ),
            )

    def on_engine_test(result: TestResult) -> None:
        test_num = int(result.id.split("_")[-1]) if "_" in result.id else len(record.tests) + 1
        existing_test = next((t for t in record.tests if t.id == result.id), None)
        failure_id = existing_test.failure_id if existing_test else None
        test_case = _map_result_to_test_case(
            result,
            test_num,
            session_id=record.session_id,
            failure_id=failure_id,
        )

        existing_idx = next((i for i, t in enumerate(record.tests) if t.id == result.id), None)
        if existing_idx is not None:
            record.tests[existing_idx] = test_case
        else:
            record.tests.append(test_case)

        record.active_test_id = result.id

        if result.status == "running":
            event_broker.publish_threadsafe(
                loop,
                session_id,
                TestEvent(
                    session_id=session_id,
                    type=TestEventType.TEST_STARTED,
                    test_id=result.id,
                    message=f"Running {result.id} — strategy: {result.strategy}",
                    data={
                        "test": test_case.model_dump(by_alias=True),
                        "progress": _derive_progress(record).model_dump(by_alias=True),
                    },
                ),
            )
        elif result.status == "passed":
            event_broker.publish_threadsafe(
                loop,
                session_id,
                TestEvent(
                    session_id=session_id,
                    type=TestEventType.TEST_PASSED,
                    test_id=result.id,
                    message=f"Test {result.id} PASSED",
                    data={
                        "test": test_case.model_dump(by_alias=True),
                        "progress": _derive_progress(record).model_dump(by_alias=True),
                    },
                ),
            )
        elif result.status == "failed":
            event_broker.publish_threadsafe(
                loop,
                session_id,
                TestEvent(
                    session_id=session_id,
                    type=TestEventType.TEST_FAILED,
                    test_id=result.id,
                    message=f"Test {result.id} FAILED ({result.failure_type})",
                    data={
                        "test": test_case.model_dump(by_alias=True),
                        "failureType": result.failure_type,
                        "progress": _derive_progress(record).model_dump(by_alias=True),
                    },
                ),
            )

    def on_engine_turn(test_id: str, turn: Turn) -> None:
        now_ts = _hhmmss()
        test = next((t for t in record.tests if t.id == test_id), None)
        turn_num = (len(test.conversation) // 2) + 1 if test else 1

        turn_tool_calls: list[ToolCall] = []
        if turn.response.tool_calls:
            turn_tool_calls = [
                ToolCall(
                    name=tc.name,
                    arguments=sanitize_dict(tc.arguments or {}),
                    timestamp=now_ts,
                    turn_index=turn_num - 1,
                )
                for tc in turn.response.tool_calls
            ]

        if test:
            test.conversation.append(
                ConversationTurn(
                    role=TurnRole.ADVERSIGHT,
                    content=sanitize_text(turn.attack),
                    timestamp=now_ts,
                    turn_number=turn_num,
                )
            )
            test.conversation.append(
                ConversationTurn(
                    role=TurnRole.TARGET,
                    content=sanitize_text(turn.response.text),
                    timestamp=now_ts,
                    turn_number=turn_num,
                    tool_calls=turn_tool_calls if turn_tool_calls else None,
                    latency_ms=turn.response.latency_ms,
                )
            )
            test.turns = list(test.conversation)
            if turn_tool_calls:
                if test.tool_calls is None:
                    test.tool_calls = []
                test.tool_calls.extend(turn_tool_calls)

        event_broker.publish_threadsafe(
            loop,
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.AGENT_RESPONSE_RECEIVED,
                test_id=test_id,
                message=turn.response.text[:120],
                data={
                    "attack": sanitize_text(turn.attack),
                    "response": sanitize_text(turn.response.text),
                    "toolCalls": [tc.model_dump(by_alias=True) for tc in turn_tool_calls],
                    "timestamp": now_ts,
                    "turnNumber": turn_num,
                    "latencyMs": turn.response.latency_ms,
                },
            ),
        )

    def on_engine_failure(fail_obj: Any) -> None:
        test_num = int(fail_obj.test_id.split("_")[-1]) if "_" in fail_obj.test_id else len(record.failures) + 1
        test = next((t for t in record.tests if t.id == fail_obj.test_id), None)
        conv = list(test.conversation) if test and test.conversation else None
        failure_model = _map_failure_to_session_failure(
            fail_obj,
            test_number=test_num,
            session_id=record.session_id,
            target_agent_id=record.config.target_agent.id,
            target_agent_name=record.config.target_agent.name,
            target_agent_endpoint=record.config.target_agent.endpoint,
            conversation=conv,
        )
        if test:
            test.failure_id = failure_model.id
        record.failures.append(failure_model)
        if not loop.is_closed():
            asyncio.run_coroutine_threadsafe(storage.failures.save(failure_model), loop)

        event_broker.publish_threadsafe(
            loop,
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.FAILURE_DETECTED,
                test_id=fail_obj.test_id,
                message=f"Failure detected: {fail_obj.type} ({fail_obj.severity})",
                data={
                    "failureId": failure_model.id,
                    "testId": failure_model.test_id,
                    "sessionId": failure_model.session_id,
                    "failureType": failure_model.type,
                    "severity": failure_model.severity.value if hasattr(failure_model.severity, "value") else str(failure_model.severity),
                    "detector": failure_model.detector,
                    "reason": failure_model.reason,
                    "violatedPolicy": failure_model.violated_policy,
                    "confidence": failure_model.confidence,
                    "evidence": failure_model.evidence,
                },
            ),
        )

        event_broker.publish_threadsafe(
            loop,
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.FAILURE_RECORDED,
                test_id=fail_obj.test_id,
                message=f"Failure recorded: {fail_obj.type} ({fail_obj.severity})",
                data={
                    "failureId": failure_model.id,
                    "testId": failure_model.test_id,
                    "sessionId": failure_model.session_id,
                    "failureType": failure_model.type,
                    "severity": failure_model.severity.value if hasattr(failure_model.severity, "value") else str(failure_model.severity),
                    "detector": failure_model.detector,
                    "reason": failure_model.reason,
                    "violatedPolicy": failure_model.violated_policy,
                    "confidence": failure_model.confidence,
                    "evidence": failure_model.evidence or failure_model.model_dump(by_alias=True),
                    "failure": failure_model.model_dump(by_alias=True),
                },
            ),
        )

    runner = TestRunner(
        agent=agent,
        spec=spec,
        on_event=on_engine_event,
        on_test=on_engine_test,
        on_turn=on_engine_turn,
        on_failure=on_engine_failure,
        cancel_check=cancel_event.is_set,
    )

    try:
        await asyncio.to_thread(runner.run, categories=cats, max_tests=max_tests, max_turns=max_turns)
        if not cancel_event.is_set():
            record.status = SessionStatus.COMPLETED
            record.stopped_at = datetime.now(timezone.utc)
            progress = _derive_progress(record)
            _append_log(
                record,
                LogEventType.SESSION_COMPLETED,
                f"AdverSight session completed — {progress.passed} passed, {progress.failed} failed",
            )
            await event_broker.publish(
                session_id,
                TestEvent(
                    session_id=session_id,
                    type=TestEventType.SESSION_COMPLETED,
                    message=f"Session completed — {progress.passed} passed, {progress.failed} failed",
                    data={
                        "progress": progress.model_dump(by_alias=True),
                        "failuresCount": len(record.failures),
                    },
                ),
            )
    except asyncio.CancelledError:
        if cancel_event.is_set() or record.status is SessionStatus.COMPLETED:
            pass
        else:
            record.status = SessionStatus.COMPLETED
            record.stopped_at = datetime.now(timezone.utc)
    except Exception as exc:
        record.status = SessionStatus.COMPLETED
        record.stopped_at = datetime.now(timezone.utc)
        sanitized_err = sanitize_text(str(exc))
        err_msg = f"Session execution error: {sanitized_err}"
        _append_log(record, LogEventType.SESSION_COMPLETED, err_msg)
        await event_broker.publish(
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.SESSION_ERROR,
                message=err_msg,
                data={"error": sanitized_err},
            ),
        )
    finally:
        async with _lock:
            _active_tasks.pop(session_id, None)
            _cancel_flags.pop(session_id, None)


# ── Public API ──────────────────────────────────────────────────────────────────


async def create_session(config: TestSessionConfig) -> SessionRecord:
    """Create an idle session."""
    session_id = f"session_{uuid4().hex[:12]}"
    record = SessionRecord(session_id=session_id, config=config)
    async with _lock:
        _sessions[session_id] = record
    return record


async def get_session(session_id: str) -> SessionRecord:
    async with _lock:
        record = _sessions.get(session_id)
    if record is None:
        raise SessionNotFoundError(session_id)
    return record


async def start_session(session_id: str) -> SessionRecord:
    """Transition ``idle`` -> ``testing`` and start background TestRunner."""
    async with _lock:
        record = _sessions.get(session_id)
        if record is None:
            raise SessionNotFoundError(session_id)

        if record.status is SessionStatus.COMPLETED:
            raise SessionStateError(session_id, record.status, "start")

        if record.status is SessionStatus.TESTING:
            return record

        record.status = SessionStatus.TESTING
        record.started_at = datetime.now(timezone.utc)
        agent_name = record.config.target_agent.name
        _append_log(
            record,
            LogEventType.SESSION_STARTED,
            f"AdverSight session initialized — target: {agent_name}",
        )
        _append_log(
            record,
            LogEventType.TEST_STARTED,
            "Test runner engaged — awaiting test engine (Step 3).",
        )

        cancel_event = threading.Event()
        _cancel_flags[session_id] = cancel_event

        loop = asyncio.get_running_loop()
        task = asyncio.create_task(_run_session_worker(session_id, cancel_event, loop))
        _active_tasks[session_id] = task

    await event_broker.publish(
        session_id,
        TestEvent(
            session_id=session_id,
            type=TestEventType.SESSION_STARTED,
            message=f"AdverSight session initialized — target: {agent_name}",
            data={"config": record.config.model_dump(by_alias=True)},
        ),
    )

    return record


async def stop_session(session_id: str) -> SessionRecord:
    """Transition ``testing`` -> ``completed`` and cancel background TestRunner."""
    async with _lock:
        record = _sessions.get(session_id)
        if record is None:
            raise SessionNotFoundError(session_id)

        if record.status is SessionStatus.IDLE:
            raise SessionStateError(session_id, record.status, "stop")

        if record.status is SessionStatus.COMPLETED:
            return record

        record.status = SessionStatus.COMPLETED
        record.stopped_at = datetime.now(timezone.utc)

        if cancel_event := _cancel_flags.pop(session_id, None):
            cancel_event.set()
        if task := _active_tasks.pop(session_id, None):
            task.cancel()

        _append_log(
            record,
            LogEventType.SESSION_COMPLETED,
            "Session stopped by operator.",
        )

    await event_broker.publish(
        session_id,
        TestEvent(
            session_id=session_id,
            type=TestEventType.SESSION_STOPPED,
            message="Session stopped by operator.",
            data={"progress": _derive_progress(record).model_dump(by_alias=True)},
        ),
    )

    return record


async def wait_for_session(session_id: str, timeout: float = 30.0) -> SessionRecord:
    """Await active execution completion safely across threads/event loops."""
    loop = asyncio.get_running_loop()
    start_time = loop.time()
    while True:
        record = await get_session(session_id)
        if record.status is SessionStatus.COMPLETED:
            return record
        if loop.time() - start_time >= timeout:
            return record
        await asyncio.sleep(0.05)


def build_dashboard(record: SessionRecord) -> SessionDashboard:
    """Project the internal record onto the frontend's ``DashboardData``."""
    progress = _derive_progress(record)
    return SessionDashboard(
        session_id=record.session_id,
        id=record.session_id,
        status=record.status,
        target_agent=record.config.target_agent,
        config=record.config,
        configuration=record.config,
        progress=progress,
        total_tests=progress.total,
        completed_tests=progress.completed,
        passed_tests=progress.passed,
        failed_tests=progress.failed,
        created_at=record.created_at.isoformat() if record.created_at else None,
        started_at=record.started_at.isoformat() if record.started_at else None,
        completed_at=record.stopped_at.isoformat() if record.stopped_at else None,
        tests=list(record.tests),
        failures=list(record.failures),
        logs=list(record.logs),
        active_test_id=record.active_test_id,
    )


async def get_session_tests(session_id: str) -> list[TestCase]:
    """Retrieve all test cases for a given session."""
    record = await get_session(session_id)
    return list(record.tests)


async def get_test_case(test_id: str) -> TestCase | None:
    """Retrieve a single test case by its test ID."""
    async with _lock:
        for rec in reversed(list(_sessions.values())):
            for t in rec.tests:
                if t.id == test_id:
                    return t
    return None


async def get_session_failures(session_id: str) -> list[Failure]:
    """Retrieve all failure evidence records for a given session."""
    record = await get_session(session_id)
    return list(record.failures)


async def get_failure(failure_id: str) -> Failure | None:
    """Retrieve a single failure evidence record by its failure ID or test ID."""
    fail = await storage.failures.get(failure_id)
    if fail:
        return fail
    async with _lock:
        for rec in reversed(list(_sessions.values())):
            for f in rec.failures:
                if (
                    f.id == failure_id
                    or f.test_id == failure_id
                    or f.id.endswith(f"_{failure_id}")
                    or failure_id.endswith(f"_{f.test_id}")
                ):
                    return f
    return None


async def get_session_events(session_id: str) -> list[LogEvent]:
    """Retrieve all observability log events for a given session."""
    record = await get_session(session_id)
    return list(record.logs)


async def replay_test_case(test_id: str, attempts: int = 1) -> dict[str, Any]:
    """Replay a specific test case deterministically and return reproduction metrics."""
    target_test: TestCase | None = None
    target_record: SessionRecord | None = None

    async with _lock:
        for rec in reversed(list(_sessions.values())):
            for t in rec.tests:
                if t.id == test_id:
                    target_test = t
                    target_record = rec
                    break
            if target_test:
                break

    if not target_test or not target_record:
        raise SessionNotFoundError(f"Test case '{test_id}' not found.")

    agent, spec = spec_for_agent(
        target_record.config.target_agent.id,
        target_record.config.target_agent.name,
        target_record.config.target_agent.endpoint,
    )

    attacker_messages = [t.content for t in target_test.conversation if t.role == TurnRole.ADVERSIGHT]
    if not attacker_messages:
        attacker_messages = [target_test.attack]

    case = ReplayCase(
        id=f"replay_{target_test.id}",
        test_id=target_test.id,
        strategy=target_test.strategy.value,
        target_name=spec.name,
        attacker_messages=attacker_messages,
        expected_failure_type=target_test.failure_type or "policy_violation",
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    n_attempts = max(1, min(10, attempts))
    evaluator = Evaluator()
    replay_result = await asyncio.to_thread(replay, case, agent, spec, evaluator, attempts=n_attempts)
    return replay_result.model_dump(by_alias=True)


async def replay_failure(failure_id: str, attempts: int = 1) -> FailureReplayResponse:
    """Execute exact replay of a previously recorded failure against its target agent."""
    target_failure: Failure | None = None
    target_record: SessionRecord | None = None

    # 1. Lookup failure and owning session
    async with _lock:
        for rec in reversed(list(_sessions.values())):
            for f in rec.failures:
                if (
                    f.id == failure_id
                    or f.test_id == failure_id
                    or f.id.endswith(f"_{failure_id}")
                    or failure_id.endswith(f"_{f.test_id}")
                ):
                    target_failure = f
                    target_record = rec
                    break
            if target_failure:
                break

    if not target_failure:
        stored_fail = await storage.failures.get(failure_id)
        if stored_fail:
            target_failure = stored_fail
            if getattr(target_failure, "session_id", None):
                target_record = await storage.sessions.get(target_failure.session_id)

    if not target_failure:
        raise FailureNotFoundError(failure_id)

    # 2. Resolve Target Agent & Domain Spec from original session or failure
    agent: TargetAgent | None = None
    spec: TargetSpec | None = None
    if target_record:
        agent, spec = spec_for_agent(
            target_record.config.target_agent.id,
            target_record.config.target_agent.name,
            target_record.config.target_agent.endpoint,
        )
    elif getattr(target_failure, "target_agent_id", None):
        agent, spec = spec_for_agent(
            target_failure.target_agent_id,
            getattr(target_failure, "target_agent_name", None) or "",
            getattr(target_failure, "target_agent_endpoint", None) or "",
        )
    else:
        agent, spec = spec_for_agent("agent_default", "Target Agent", "")

    if agent is None or spec is None:
        raise TargetAdapterError(
            f"Target agent adapter for failure '{failure_id}' is unavailable or cannot be resolved."
        )

    # 3. Extract exact attacker messages (guarantees NO new attack generation)
    attacker_messages: list[str] = []
    if target_record:
        test_case = next((t for t in target_record.tests if t.id == target_failure.test_id), None)
        if test_case and test_case.conversation:
            attacker_messages = [
                t.content
                for t in test_case.conversation
                if (t.role == TurnRole.ADVERSIGHT or t.role == "adversight") and t.content.strip()
            ]

    if not attacker_messages and getattr(target_failure, "conversation", None):
        attacker_messages = [
            t.content
            for t in target_failure.conversation
            if (t.role == TurnRole.ADVERSIGHT or t.role == "adversight") and t.content.strip()
        ]

    if not attacker_messages and getattr(target_failure, "turns", None):
        attacker_messages = [t.attack for t in target_failure.turns if t.attack and t.attack.strip()]

    if not attacker_messages and target_failure.attack and target_failure.attack.strip():
        attacker_messages = [target_failure.attack.strip()]

    if not attacker_messages:
        raise MissingReplayEvidenceError(
            f"Failure '{failure_id}' contains no recorded attack conversation turns to replay."
        )

    # 4. Construct exact ReplayCase
    case_id = getattr(target_failure, "replay_case_id", None) or f"replay_{target_failure.id}"
    strategy_name = (
        target_failure.strategy.value
        if hasattr(target_failure.strategy, "value")
        else str(target_failure.strategy)
    )
    case = ReplayCase(
        id=case_id,
        test_id=target_failure.test_id,
        strategy=strategy_name,
        target_name=spec.name,
        attacker_messages=attacker_messages,
        expected_failure_type=target_failure.type,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    # Publish REPLAY_STARTED event if session is available
    if target_record:
        await event_broker.publish(
            target_record.session_id,
            TestEvent(
                session_id=target_record.session_id,
                type=TestEventType.REPLAY_STARTED,
                message=f"Starting exact replay for failure {failure_id} ({attempts} attempt(s))",
                data={"failureId": failure_id, "attempts": attempts},
            ),
        )

    # 5. Execute replay using existing ReplayService & Evaluator
    evaluator = Evaluator()
    replay_result = await asyncio.to_thread(
        replay, case, agent, spec, evaluator, attempts=attempts
    )

    # 6. Map attempt details
    from app.services.replay_service import _normalize_failure_type

    expected_norm = _normalize_failure_type(target_failure.type)
    attempt_details: list[ReplayAttemptDetail] = []
    for att in getattr(replay_result, "attempt_details", []):
        last_turn = att.turns[-1] if att.turns else None
        last_resp = sanitize_text(last_turn.response.text) if last_turn and last_turn.response.text else None
        tool_calls = (
            [
                ToolCall(
                    name=tc.name,
                    arguments=sanitize_dict(tc.arguments or {}),
                    timestamp=_hhmmss(),
                    turn_index=getattr(tc, "turn_index", None),
                )
                for t in att.turns
                for tc in t.response.tool_calls
            ]
            if att.turns
            else None
        )

        matching_finding = next(
            (
                f
                for f in att.findings
                if _normalize_failure_type(f.type.value if hasattr(f.type, "value") else str(f.type))
                == expected_norm
            ),
            None,
        )

        if att.error:
            status_val = "error"
            msg = f"Execution error during replay: {att.error}"
            evidence_dict = {"error": att.error}
        elif att.reproduced:
            status_val = "reproduced"
            msg = f"Failure condition '{target_failure.type}' was reproduced by policy evaluator."
            evidence_dict = {
                "violatedRule": getattr(matching_finding, "violated_rule", None)
                if matching_finding
                else None,
                "description": getattr(matching_finding, "description", None)
                if matching_finding
                else None,
                "detector": getattr(matching_finding, "detector", None)
                if matching_finding
                else None,
                "confidence": getattr(matching_finding, "confidence", 1.0)
                if matching_finding
                else 1.0,
            }
        else:
            status_val = "not_reproduced"
            msg = "Failure condition was not reproduced; target agent adhered to safety policy."
            evidence_dict = {}

        attempt_details.append(
            ReplayAttemptDetail(
                attempt=att.attempt_number,
                attempt_number=att.attempt_number,
                status=status_val,
                reproduced=att.reproduced,
                failure_detected=att.reproduced,
                failure_type=target_failure.type if att.reproduced else None,
                message=msg,
                error=att.error,
                response_text=last_resp,
                tool_calls=tool_calls if tool_calls else None,
                evidence=evidence_dict,
                timestamp=_hhmmss(),
            )
        )

    # 7. Formulate reproduction verdict
    completed_attempts = getattr(replay_result, "completed_attempts", replay_result.attempts)
    if completed_attempts == 0:
        verdict = "ERROR"
        status_val = "error"
        summary_text = (
            f"Replay failed: all {replay_result.attempts} attempt(s) encountered execution errors."
        )
    elif replay_result.reproduced:
        verdict = "REPRODUCED"
        status_val = "completed"
        summary_text = (
            f"{replay_result.reproduced_count}/{completed_attempts} completed attempt(s) reproduced the failure "
            f"({target_failure.type}). Reproduction rate: {replay_result.reproduction_rate:.2f}. Verdict: REPRODUCED."
        )
    else:
        verdict = "NOT_REPRODUCED"
        status_val = "completed"
        summary_text = (
            f"0/{completed_attempts} completed attempt(s) reproduced the failure ({target_failure.type}). "
            f"Reproduction rate: 0.00. Verdict: NOT_REPRODUCED."
        )

    # 8. Log and stream event if session is available
    if target_record:
        _append_log(
            target_record,
            LogEventType.POLICY_CHECK,
            f"Replay verified for {failure_id}: {verdict} ({replay_result.reproduced_count}/{replay_result.attempts})",
        )
        evt_type = (
            TestEventType.REPLAY_FAILURE_REPRODUCED
            if verdict == "REPRODUCED"
            else (TestEventType.REPLAY_ERROR if verdict == "ERROR" else TestEventType.REPLAY_COMPLETED)
        )
        await event_broker.publish(
            target_record.session_id,
            TestEvent(
                session_id=target_record.session_id,
                type=evt_type,
                message=summary_text,
                data={
                    "failureId": failure_id,
                    "verdict": verdict,
                    "reproduced": replay_result.reproduced,
                    "reproductionRate": replay_result.reproduction_rate,
                    "completedAttempts": completed_attempts,
                },
            ),
        )

    return FailureReplayResponse(
        failure_id=target_failure.id,
        status=status_val,
        verdict=verdict,
        reproduced=replay_result.reproduced,
        attempts=replay_result.attempts,
        successful_reproductions=replay_result.reproduced_count,
        completed_attempts=completed_attempts,
        reproduction_rate=replay_result.reproduction_rate,
        reproduced_count=replay_result.reproduced_count,
        original_failure_type=target_failure.type,
        original_test_id=target_failure.test_id,
        replay_case_id=case_id,
        summary=summary_text,
        replay_results=attempt_details,
        findings=[f.model_dump(by_alias=True) for f in getattr(replay_result, "findings", [])],
        turns=[t.model_dump(by_alias=True) for t in getattr(replay_result, "turns", [])],
    )


def get_available_agents() -> list[dict[str, Any]]:
    """Return catalog of available testable target agents."""
    return get_agent_catalog()