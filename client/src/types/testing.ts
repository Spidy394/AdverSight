// AdverSight — TypeScript Type Contracts
// These interfaces define the data shape that the backend must eventually match.
// Replacing mock* with API calls should require zero UI changes.

export type TestStatus = "pending" | "running" | "passed" | "failed";

export type DashboardStatus = "idle" | "testing" | "completed";

export type Severity = "low" | "medium" | "high" | "critical";

export type AttackCategory =
  | "goal_hijacking"
  | "identity_confusion"
  | "policy_violation"
  | "unauthorized_action"
  | "context_manipulation"
  | "tool_misuse"
  | "information_extraction";

export type TestMode = "quick_scan" | "full_adversarial" | "custom";

export type AgentType =
  | "tool_calling"
  | "react_agent"
  | "llm_chain"
  | "custom";

// ── Target Agent ──────────────────────────────────────────────────────────────

export interface TargetAgent {
  id: string;
  name: string;
  endpoint: string;
  agentType: AgentType;
  connected: boolean;
}

// ── Test Session Config ───────────────────────────────────────────────────────

export interface TestSessionConfig {
  targetAgent: TargetAgent;
  testMode: TestMode;
  attackCategories: AttackCategory[];
  maxTests: number;
  maxTurnsPerTest: number;
}

// ── Individual Test Case ──────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "adversight" | "target";
  content: string;
  timestamp: string;
}

export interface TestCase {
  id: string;
  testNumber: number;
  strategy: AttackCategory;
  attack: string;
  status: TestStatus;
  conversation: ConversationTurn[];
  response?: string;
  toolCalls?: ToolCall[];
  failureType?: string;
  failureDescription?: string;
  startedAt?: string;
  completedAt?: string;
}

// ── Tool Call ─────────────────────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
}

// ── Failure Evidence ──────────────────────────────────────────────────────────

export interface Failure {
  id: string;
  testId: string;
  testNumber: number;
  type: string;
  strategy: AttackCategory;
  description: string;
  severity: Severity;
  attack: string;
  response: string;
  toolCalls?: ToolCall[];
  whyItFailed: string;
  timestamp: string;
}

// ── Observability Log ─────────────────────────────────────────────────────────

export type LogEventType =
  | "TEST_STARTED"
  | "ATTACK_GENERATED"
  | "REQUEST_SENT"
  | "AGENT_RESPONSE_RECEIVED"
  | "TOOL_CALL"
  | "RESPONSE_ANALYZED"
  | "POLICY_CHECK"
  | "FAILURE_RECORDED"
  | "TEST_COMPLETED"
  | "SESSION_STARTED"
  | "SESSION_COMPLETED";

export interface LogEvent {
  id: string;
  timestamp: string;
  type: LogEventType;
  message: string;
  testId?: string;
  meta?: Record<string, unknown>;
}

// ── Dashboard State ───────────────────────────────────────────────────────────

export interface TestProgress {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  running: number;
}

export interface DashboardData {
  sessionId: string;
  status: DashboardStatus;
  config: TestSessionConfig;
  progress: TestProgress;
  tests: TestCase[];
  failures: Failure[];
  logs: LogEvent[];
  activeTestId?: string;
}
