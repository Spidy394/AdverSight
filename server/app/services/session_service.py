"""In-memory Testing Session service.

Deliberately free of FastAPI imports: this layer owns session lifecycle and
raises plain exceptions, and ``app/api/session.py`` maps them onto HTTP status
codes. No testing-engine or Gemini logic belongs here — that is Step 3.

Storage is a module-level dict, so sessions live only for the lifetime of the
process. That is the Step 2 requirement; swapping this for a repository is the
only change needed later.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from app.model.session import (
    Failure,
    LogEvent,
    LogEventType,
    SessionDashboard,
    SessionStatus,
    TestCase,
    TestProgress,
    TestSessionConfig,
    TestStatus,
)


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
_lock = asyncio.Lock()


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _hhmmss() -> str:
    """Wall-clock ``HH:MM:SS``.

    The frontend contract types every timestamp as a plain string and the mock
    data uses this exact format (``"13:41:02"``), so the API has to emit the
    same thing rather than ISO 8601.
    """
    return datetime.now().strftime("%H:%M:%S")


def _append_log(record: SessionRecord, event_type: LogEventType, message: str) -> LogEvent:
    event = LogEvent(
        id=f"log_{uuid4().hex[:12]}",
        timestamp=_hhmmss(),
        type=event_type,
        message=message,
    )
    record.logs.append(event)
    return event


def _derive_progress(record: SessionRecord) -> TestProgress:
    """Compute ``TestProgress`` from the test list.

    Until the engine exists there are no ``tests``, so ``total`` falls back to
    the configured ``max_tests``. That keeps the progress bar meaningful in Step
    2 and self-replaces once Step 3 starts appending tests.
    """
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


# ── Public API ──────────────────────────────────────────────────────────────────


async def create_session(config: TestSessionConfig) -> SessionRecord:
    """Create an idle session.

    No log events are seeded: ``LogEventType`` has no ``SESSION_CREATED``
    member, so an empty log is the honest state and the frontend renders its
    "No observability events yet" state.
    """
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
    """Transition ``idle`` -> ``testing``.

    Idempotent when already ``testing`` so a double-click or a retry cannot
    duplicate the seeded events. A completed session can never be restarted.
    """
    async with _lock:
        record = _sessions.get(session_id)
        if record is None:
            raise SessionNotFoundError(session_id)

        if record.status is SessionStatus.COMPLETED:
            raise SessionStateError(session_id, record.status, "start")

        if record.status is SessionStatus.IDLE:
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

    return record


async def stop_session(session_id: str) -> SessionRecord:
    """Transition ``testing`` -> ``completed``.

    Idempotent once already completed. A session that was never started cannot
    be stopped.
    """
    async with _lock:
        record = _sessions.get(session_id)
        if record is None:
            raise SessionNotFoundError(session_id)

        if record.status is SessionStatus.IDLE:
            raise SessionStateError(session_id, record.status, "stop")

        if record.status is SessionStatus.TESTING:
            record.status = SessionStatus.COMPLETED
            record.stopped_at = datetime.now(timezone.utc)
            _append_log(
                record,
                LogEventType.SESSION_COMPLETED,
                "Session stopped by operator.",
            )

    return record


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