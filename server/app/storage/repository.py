"""Repository and persistence abstraction layer for AdverSight.

Provides explicit repository interfaces and in-memory implementations for
sessions, failures, and events. This isolates storage concerns so the service
layer does not rely on ad-hoc globals and can easily swap in a database
(e.g., PostgreSQL, SQLite, Redis) in future milestones.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.model.session import Failure, LogEvent
    from app.services.session_service import SessionRecord


class SessionRepository(ABC):
    """Abstract interface for session storage."""

    @abstractmethod
    async def get(self, session_id: str) -> SessionRecord | None:
        """Retrieve a session by its ID."""
        ...

    @abstractmethod
    async def save(self, record: SessionRecord) -> None:
        """Persist or update a session record."""
        ...

    @abstractmethod
    async def list_all(self) -> list[SessionRecord]:
        """List all tracked sessions."""
        ...

    @abstractmethod
    async def delete(self, session_id: str) -> bool:
        """Delete a session if it exists."""
        ...


class FailureRepository(ABC):
    """Abstract interface for failure evidence storage."""

    @abstractmethod
    async def get(self, failure_id: str) -> Failure | None:
        """Retrieve a failure evidence record by its failure ID."""
        ...

    @abstractmethod
    async def save(self, failure: Failure) -> None:
        """Persist a failure record."""
        ...

    @abstractmethod
    async def list_by_session(self, session_id: str) -> list[Failure]:
        """List all failures associated with a session."""
        ...


class EventRepository(ABC):
    """Abstract interface for observability log event storage."""

    @abstractmethod
    async def append(self, session_id: str, event: LogEvent) -> None:
        """Append an event to the session event log."""
        ...

    @abstractmethod
    async def list_by_session(self, session_id: str) -> list[LogEvent]:
        """List all log events for a given session."""
        ...


# ── In-Memory Implementations ───────────────────────────────────────────────────


class InMemorySessionRepository(SessionRepository):
    """Thread-safe in-memory session repository."""

    def __init__(self) -> None:
        self._store: dict[str, SessionRecord] = {}

    async def get(self, session_id: str) -> SessionRecord | None:
        return self._store.get(session_id)

    async def save(self, record: SessionRecord) -> None:
        self._store[record.session_id] = record

    async def list_all(self) -> list[SessionRecord]:
        return list(self._store.values())

    async def delete(self, session_id: str) -> bool:
        return self._store.pop(session_id, None) is not None

    def clear(self) -> None:
        self._store.clear()


class InMemoryFailureRepository(FailureRepository):
    """In-memory failure evidence repository."""

    def __init__(self) -> None:
        self._store: dict[str, Failure] = {}

    async def get(self, failure_id: str) -> Failure | None:
        return self._store.get(failure_id)

    async def save(self, failure: Failure) -> None:
        self._store[failure.id] = failure

    async def list_by_session(self, session_id: str) -> list[Failure]:
        return [f for f in self._store.values() if getattr(f, "session_id", None) == session_id or f.test_id.startswith(session_id)]

    def clear(self) -> None:
        self._store.clear()


class InMemoryEventRepository(EventRepository):
    """In-memory observability log event repository."""

    def __init__(self) -> None:
        self._store: dict[str, list[LogEvent]] = {}

    async def append(self, session_id: str, event: LogEvent) -> None:
        if session_id not in self._store:
            self._store[session_id] = []
        self._store[session_id].append(event)

    async def list_by_session(self, session_id: str) -> list[LogEvent]:
        return list(self._store.get(session_id, []))

    def clear(self) -> None:
        self._store.clear()


class StorageContainer:
    """Dependency container for repositories."""

    def __init__(
        self,
        sessions: SessionRepository | None = None,
        failures: FailureRepository | None = None,
        events: EventRepository | None = None,
    ) -> None:
        self.sessions = sessions or InMemorySessionRepository()
        self.failures = failures or InMemoryFailureRepository()
        self.events = events or InMemoryEventRepository()


# Default storage singleton
storage = StorageContainer()
