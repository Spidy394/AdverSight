"""In-process event broker for session pub/sub and SSE streaming."""
from __future__ import annotations

import asyncio

from app.model.event import TestEvent


class EventBroker:
    """Manages in-process pub/sub event queues per session with total session isolation."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[TestEvent]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> asyncio.Queue[TestEvent]:
        """Create a dedicated event queue for a new subscriber to this session."""
        queue: asyncio.Queue[TestEvent] = asyncio.Queue()
        async with self._lock:
            if session_id not in self._subscribers:
                self._subscribers[session_id] = set()
            self._subscribers[session_id].add(queue)
        return queue

    async def unsubscribe(self, session_id: str, queue: asyncio.Queue[TestEvent]) -> None:
        """Remove an event queue when an SSE subscriber disconnects."""
        async with self._lock:
            subscribers = self._subscribers.get(session_id)
            if subscribers and queue in subscribers:
                subscribers.remove(queue)
                if not subscribers:
                    self._subscribers.pop(session_id, None)

    async def publish(self, session_id: str, event: TestEvent) -> None:
        """Publish an event to all subscribers listening to this specific session."""
        async with self._lock:
            subscribers = list(self._subscribers.get(session_id, set()))
        for q in subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                pass

    def publish_threadsafe(
        self, loop: asyncio.AbstractEventLoop, session_id: str, event: TestEvent
    ) -> None:
        """Publish an event from a synchronous background thread into the async event loop."""
        if loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self.publish(session_id, event), loop)


event_broker = EventBroker()
