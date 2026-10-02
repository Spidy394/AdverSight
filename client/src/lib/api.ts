// AdverSight — API Client
// Connects the React dashboard to the FastAPI backend and SSE stream.

import type { DashboardData, TestSessionConfig } from "@/types/testing";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export interface ServerEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  type: string;
  testId?: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

export async function createSession(config: TestSessionConfig): Promise<DashboardData> {
  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSession(sessionId: string): Promise<DashboardData> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to get session: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function startSession(sessionId: string): Promise<DashboardData> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/start`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to start session: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function stopSession(sessionId: string): Promise<DashboardData> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/stop`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to stop session: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function connectToSessionStream(
  sessionId: string,
  onEvent: (event: ServerEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const es = new EventSource(`${API_BASE_URL}/sessions/${sessionId}/stream`);

  const eventTypes = [
    "session_started",
    "test_started",
    "attack_generated",
    "request_sent",
    "agent_response_received",
    "tool_call",
    "response_analyzed",
    "policy_check",
    "failure_detected",
    "failure_recorded",
    "test_passed",
    "test_failed",
    "session_completed",
    "session_stopped",
    "session_error",
    "session_state",
  ];

  const handler = (type: string) => (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data);
      onEvent({
        id: e.lastEventId || parsed.id || `evt_${Date.now()}`,
        sessionId: parsed.sessionId || sessionId,
        timestamp: parsed.timestamp || new Date().toTimeString().slice(0, 8),
        type,
        testId: parsed.testId,
        message: parsed.message || "",
        data: parsed.data || parsed,
      });
    } catch (err) {
      console.warn("Failed to parse SSE event data:", err);
    }
  };

  eventTypes.forEach((type) => {
    es.addEventListener(type, handler(type) as EventListener);
  });

  es.onmessage = (e) => {
    handler("message")(e);
  };

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    es.close();
  };
}
