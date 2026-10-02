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
    return TestProgress(
        total=len(record.tests) or record.config.max_tests,
        completed=passed + failed,
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


def _map_result_to_test_case(result: TestResult, test_number: int) -> TestCase:
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
        test_number=test_number,
        strategy=cat_val,
        attack=result.attack,
        status=status_val,
        conversation=conv,
        response=result.response,
        tool_calls=tool_calls if tool_calls else None,
        failure_type=result.failure_type,
        started_at=ts,
        completed_at=ts if result.status in ("passed", "failed") else None,
    )


def _map_failure_to_session_failure(fail_obj: Any, test_number: int) -> Failure:
    cat_val = (
        AttackCategory(fail_obj.strategy)
        if fail_obj.strategy in [c.value for c in AttackCategory]
        else AttackCategory.POLICY_VIOLATION
    )
    sev_val = Severity(fail_obj.severity)
    tool_calls = [
        ToolCall(name=tc.name, arguments=tc.arguments, timestamp=fail_obj.timestamp)
        for tc in getattr(fail_obj, "tool_calls", [])
    ]
    return Failure(
        id=fail_obj.id,
        test_id=fail_obj.test_id,
        test_number=test_number,
        type=fail_obj.type,
        strategy=cat_val,
        description=fail_obj.description,
        severity=sev_val,
        attack=fail_obj.attack,
        response=fail_obj.response,
        tool_calls=tool_calls if tool_calls else None,
        why_it_failed=getattr(fail_obj, "why_failed", fail_obj.description),
        timestamp=fail_obj.timestamp,
    )


# ── Execution Worker ────────────────────────────────────────────────────────────


async def _run_session_worker(
    session_id: str, cancel_event: threading.Event, loop: asyncio.AbstractEventLoop
) -> None:
    try:
        record = await get_session(session_id)
    except SessionNotFoundError:
        return

    # Yield control to event loop so start HTTP response completes cleanly
    await asyncio.sleep(0.05)
    if cancel_event.is_set():
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
        test_case = _map_result_to_test_case(result, test_num)

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
        if test:
            test.conversation.append(
                ConversationTurn(role=TurnRole.ADVERSIGHT, content=turn.attack, timestamp=now_ts)
            )
            test.conversation.append(
                ConversationTurn(role=TurnRole.TARGET, content=turn.response.text, timestamp=now_ts)
            )
            if turn.response.tool_calls:
                test.tool_calls = [
                    ToolCall(name=tc.name, arguments=tc.arguments, timestamp=now_ts)
                    for tc in turn.response.tool_calls
                ]

        event_broker.publish_threadsafe(
            loop,
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.AGENT_RESPONSE_RECEIVED,
                test_id=test_id,
                message=turn.response.text[:120],
                data={
                    "attack": turn.attack,
                    "response": turn.response.text,
                    "toolCalls": [tc.model_dump(by_alias=True) for tc in turn.response.tool_calls],
                    "timestamp": now_ts,
                },
            ),
        )

    def on_engine_failure(fail_obj: Any) -> None:
        test_num = int(fail_obj.test_id.split("_")[-1]) if "_" in fail_obj.test_id else len(record.failures) + 1
        failure_model = _map_failure_to_session_failure(fail_obj, test_num)
        record.failures.append(failure_model)

        event_broker.publish_threadsafe(
            loop,
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.FAILURE_RECORDED,
                test_id=fail_obj.test_id,
                message=f"Failure recorded: {fail_obj.type} ({fail_obj.severity})",
                data={"failure": failure_model.model_dump(by_alias=True)},
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
    except Exception as exc:
        record.status = SessionStatus.COMPLETED
        record.stopped_at = datetime.now(timezone.utc)
        err_msg = f"Session execution error: {exc}"
        _append_log(record, LogEventType.SESSION_COMPLETED, err_msg)
        await event_broker.publish(
            session_id,
            TestEvent(
                session_id=session_id,
                type=TestEventType.SESSION_ERROR,
                message=err_msg,
                data={"error": str(exc)},
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

        if cancel_event := _cancel_flags.get(session_id):
            cancel_event.set()

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
    return SessionDashboard(
        session_id=record.session_id,
        status=record.status,
        config=record.config,
        progress=_derive_progress(record),
        tests=list(record.tests),
        failures=list(record.failures),
        logs=list(record.logs),
        active_test_id=record.active_test_id,
    )


async def get_session_tests(session_id: str) -> list[TestCase]:
    """Retrieve all test cases for a given session."""
    record = await get_session(session_id)
    return list(record.tests)


async def get_session_failures(session_id: str) -> list[Failure]:
    """Retrieve all failure evidence records for a given session."""
    record = await get_session(session_id)
    return list(record.failures)


async def get_failure(failure_id: str) -> Failure | None:
    """Retrieve a single failure evidence record by its failure ID."""
    fail = await storage.failures.get(failure_id)
    if fail:
        return fail
    async with _lock:
        for rec in _sessions.values():
            for f in rec.failures:
                if f.id == failure_id:
                    return f
    return None


async def get_session_events(session_id: str) -> list[LogEvent]:
    """Retrieve all observability log events for a given session."""
    record = await get_session(session_id)
    return list(record.logs)


async def replay_test_case(test_id: str) -> dict[str, Any]:
    """Replay a specific test case deterministically and return reproduction metrics."""
    target_test: TestCase | None = None
    target_record: SessionRecord | None = None

    async with _lock:
        for rec in _sessions.values():
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

    evaluator = Evaluator()
    replay_result = await asyncio.to_thread(replay, case, agent, spec, evaluator, attempts=1)
    return replay_result.model_dump(by_alias=True)


async def replay_failure(failure_id: str, attempts: int = 1) -> FailureReplayResponse:
    """Execute exact replay of a previously recorded failure against its target agent."""
    target_failure: Failure | None = None
    target_record: SessionRecord | None = None

    # 1. Lookup failure and owning session
    async with _lock:
        for rec in _sessions.values():
            for f in rec.failures:
                if f.id == failure_id:
                    target_failure = f
                    target_record = rec
                    break
            if target_failure:
                break

    if not target_failure:
        stored_fail = await storage.failures.get(failure_id)
        if stored_fail:
            target_failure = stored_fail

    if not target_failure:
        raise FailureNotFoundError(failure_id)

    # 2. Resolve Target Agent & Domain Spec from original session
    if target_record:
        agent, spec = spec_for_agent(
            target_record.config.target_agent.id,
            target_record.config.target_agent.name,
            target_record.config.target_agent.endpoint,
        )
    else:
        agent, spec = spec_for_agent("agent_default", "Target Agent", "")

    # 3. Extract exact attacker messages (guarantees NO new attack generation)
    attacker_messages: list[str] = []
    if target_record:
        test_case = next((t for t in target_record.tests if t.id == target_failure.test_id), None)
        if test_case and test_case.conversation:
            attacker_messages = [t.content for t in test_case.conversation if t.role == TurnRole.ADVERSIGHT]

    if not attacker_messages and target_failure.attack:
        attacker_messages = [target_failure.attack]

    if not attacker_messages:
        raise MissingReplayEvidenceError(
            f"Failure '{failure_id}' contains no recorded attack conversation turns to replay."
        )

    # 4. Construct exact ReplayCase
    case_id = f"replay_{target_failure.id}"
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

    # 5. Execute replay using existing ReplayService & Evaluator
    evaluator = Evaluator()
    replay_result = await asyncio.to_thread(
        replay, case, agent, spec, evaluator, attempts=attempts
    )

    # 6. Map attempt details
    attempt_details: list[ReplayAttemptDetail] = []
    for att in getattr(replay_result, "attempt_details", []):
        last_turn = att.turns[-1] if att.turns else None
        last_resp = last_turn.response.text if last_turn else None
        tool_calls = (
            [
                ToolCall(name=tc.name, arguments=tc.arguments, timestamp=_hhmmss())
                for t in att.turns
                for tc in t.response.tool_calls
            ]
            if att.turns
            else None
        )

        attempt_details.append(
            ReplayAttemptDetail(
                attempt_number=att.attempt_number,
                reproduced=att.reproduced,
                status="failed" if att.reproduced else "passed",
                error=att.error,
                response_text=last_resp,
                tool_calls=tool_calls if tool_calls else None,
                timestamp=_hhmmss(),
            )
        )

    # 7. Formulate reproduction verdict
    has_errors = any(att.error for att in attempt_details)
    if has_errors and replay_result.reproduced_count == 0:
        verdict = "ERROR"
        status_val = "error"
    else:
        verdict = "REPRODUCED" if replay_result.reproduced else "NOT_REPRODUCED"
        status_val = "completed"

    summary_text = (
        f"{replay_result.reproduced_count}/{replay_result.attempts} attempts reproduced the failure "
        f"({target_failure.type}). Verdict: {verdict}."
    )

    # 8. Log and stream event if session is available
    if target_record:
        _append_log(
            target_record,
            LogEventType.POLICY_CHECK,
            f"Replay verified for {failure_id}: {verdict} ({replay_result.reproduced_count}/{replay_result.attempts})",
        )

    return FailureReplayResponse(
        failure_id=target_failure.id,
        status=status_val,
        verdict=verdict,
        reproduced=replay_result.reproduced,
        attempts=replay_result.attempts,
        successful_reproductions=replay_result.reproduced_count,
        reproduction_rate=replay_result.reproduction_rate,
        original_failure_type=target_failure.type,
        original_test_id=target_failure.test_id,
        replay_case_id=case_id,
        summary=summary_text,
        replay_results=attempt_details,
    )


def get_available_agents() -> list[dict[str, Any]]:
    """Return catalog of available testable target agents."""
    return get_agent_catalog()