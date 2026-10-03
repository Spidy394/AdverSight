import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  type DashboardData,
  type Failure,
  type TestCase,
  type TargetAgent,
  type AttackCategory,
} from "@/types/testing";
import {
  mockDashboardData,
  SIMULATED_TEST_RUNS,
} from "@/data/mockData";
import { Header } from "@/components/layout/Header";
import { AgentConfig } from "@/components/agent/AgentConfig";
import { LiveConversation } from "@/components/conversation/LiveConversation";
import { TestProgressBar } from "@/components/testing/TestProgress";
import { FailureCard } from "@/components/results/FailureCard";
import { FailureDetails } from "@/components/results/FailureDetails";
import { getTargetAgentErrors } from "@/lib/targetAgent";
import {
  createSession,
  startSession,
  stopSession,
  connectToSessionStream,
  type ServerEvent,
} from "@/lib/api";
import {
  PresentationScheduler,
  type DemoModeSpeed,
} from "@/lib/presentationScheduler";
import {
  CircleDot,
  Search,
  ShieldCheck,
  WifiOff,
  AlertTriangle,
  Terminal,
} from "lucide-react";

const ATTACK_GOALS: {
  id: AttackCategory;
  label: string;
}[] = [
  { id: "unauthorized_action", label: "Unauthorized Action" },
  { id: "goal_hijacking", label: "Goal Hijacking" },
  { id: "identity_confusion", label: "Identity Confusion" },
  { id: "policy_violation", label: "Policy Violation" },
  { id: "context_manipulation", label: "Context Manipulation" },
  { id: "tool_misuse", label: "Tool Misuse" },
  { id: "information_extraction", label: "Info Extraction" },
];

function createInitialData(): DashboardData {
  return {
    ...mockDashboardData,
    status: "idle",
    progress: { ...mockDashboardData.progress, running: 0 },
    tests: mockDashboardData.tests.map((test) =>
      test.status === "running" ? { ...test, status: "pending" } : test,
    ),
  };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(createInitialData);
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null);
  const [activeTestId, setActiveTestId] = useState<string>("test_015");
  const [selectedGoal, setSelectedGoal] = useState<AttackCategory>("unauthorized_action");
  const [failureSearch, setFailureSearch] = useState("");
  const [demoSpeed, setDemoSpeed] = useState<DemoModeSpeed>("1x");
  const [currentActivity, setCurrentActivity] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<"failures" | "logs">("failures");

  // Simulation & Scheduler refs
  const simulationAbortRef = useRef<boolean>(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const schedulerRef = useRef<PresentationScheduler | null>(null);

  // Active test memo
  const activeTest = useMemo<TestCase | null>(() => {
    return (
      data.tests.find((t) => t.id === activeTestId) ?? data.tests[0] ?? null
    );
  }, [data.tests, activeTestId]);

  const queuedGoalCount = data.tests.filter(
    (test) =>
      test.strategy === selectedGoal &&
      (test.status === "pending" || test.status === "running"),
  ).length;

  const filteredFailures = useMemo(() => {
    const query = failureSearch.trim().toLowerCase();
    if (!query) return data.failures;
    return data.failures.filter((failure) =>
      [
        failure.type,
        failure.strategy,
        failure.description,
        failure.severity,
        failure.testId,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [data.failures, failureSearch]);

  // Actual State Reducer from Dispatched Server Event
  const applyServerEvent = useCallback((evt: ServerEvent) => {
    switch (evt.type) {
      case "session_state":
        if (evt.data?.status) {
          setData((prev) => ({
            ...prev,
            status: evt.data.status,
            progress: evt.data.progress || prev.progress,
          }));
        }
        break;

      case "session_started":
        setData((prev) => ({
          ...prev,
          status: "testing",
          logs: [
            ...prev.logs,
            {
              id: evt.id,
              timestamp: evt.timestamp,
              type: "SESSION_STARTED",
              message: evt.message,
            },
          ],
        }));
        break;

      case "test_started":
        if (evt.testId) {
          setActiveTestId(evt.testId);
        }
        setData((prev) => {
          const rawTest = evt.data?.test;
          const tests = [...prev.tests];
          if (rawTest) {
            const idx = tests.findIndex((t) => t.id === rawTest.id);
            if (idx >= 0)
              tests[idx] = { ...tests[idx], ...rawTest, status: "running" };
            else tests.push({ ...rawTest, status: "running" });
          }
          return {
            ...prev,
            tests,
            progress: evt.data?.progress || prev.progress,
            logs: [
              ...prev.logs,
              {
                id: evt.id,
                timestamp: evt.timestamp,
                type: "TEST_STARTED",
                message: evt.message,
                testId: evt.testId,
              },
            ],
          };
        });
        break;

      case "agent_response_received":
        setData((prev) => {
          const targetTestId = evt.testId || activeTestId;
          const attackText = evt.data?.attack;
          const responseText = evt.data?.response;
          const toolCalls = evt.data?.toolCalls;

          const tests = prev.tests.map((t) => {
            if (t.id === targetTestId) {
              const conv = [...t.conversation];
              if (
                attackText &&
                !conv.some(
                  (c) => c.role === "adversight" && c.content === attackText,
                )
              ) {
                conv.push({
                  role: "adversight",
                  content: attackText,
                  timestamp: evt.timestamp,
                });
              }
              if (responseText) {
                conv.push({
                  role: "target",
                  content: responseText,
                  timestamp: evt.timestamp,
                });
              }
              return {
                ...t,
                conversation: conv,
                response: responseText,
                toolCalls: toolCalls || t.toolCalls,
              };
            }
            return t;
          });

          return {
            ...prev,
            tests,
            logs: [
              ...prev.logs,
              {
                id: evt.id,
                timestamp: evt.timestamp,
                type: "AGENT_RESPONSE_RECEIVED",
                message: evt.message,
                testId: evt.testId,
              },
            ],
          };
        });
        break;

      case "tool_call":
        setData((prev) => ({
          ...prev,
          logs: [
            ...prev.logs,
            {
              id: evt.id,
              timestamp: evt.timestamp,
              type: "TOOL_CALL",
              message: evt.message,
              testId: evt.testId,
            },
          ],
        }));
        break;

      case "test_passed":
        setData((prev) => {
          const rawTest = evt.data?.test;
          const tests = prev.tests.map((t) => {
            if (t.id === (rawTest?.id || evt.testId)) {
              return {
                ...t,
                status: "passed" as const,
                response: rawTest?.response || t.response,
              };
            }
            return t;
          });
          return {
            ...prev,
            tests,
            progress: evt.data?.progress || prev.progress,
            logs: [
              ...prev.logs,
              {
                id: evt.id,
                timestamp: evt.timestamp,
                type: "TEST_COMPLETED",
                message: evt.message,
                testId: evt.testId,
              },
            ],
          };
        });
        break;

      case "test_failed":
      case "failure_detected":
        setData((prev) => {
          const rawTest = evt.data?.test;
          const tests = prev.tests.map((t) => {
            if (t.id === (rawTest?.id || evt.testId)) {
              return {
                ...t,
                status: "failed" as const,
                failureType: evt.data?.failureType || t.failureType,
                response: rawTest?.response || t.response,
              };
            }
            return t;
          });
          return {
            ...prev,
            tests,
            progress: evt.data?.progress || prev.progress,
            logs: [
              ...prev.logs,
              {
                id: evt.id,
                timestamp: evt.timestamp,
                type: "POLICY_CHECK",
                message: evt.message,
                testId: evt.testId,
              },
            ],
          };
        });
        break;

      case "failure_recorded":
        setData((prev) => {
          const rawFail = evt.data?.failure;
          const failures = [...prev.failures];
          if (rawFail && !failures.some((f) => f.id === rawFail.id)) {
            failures.push(rawFail);
          }
          return {
            ...prev,
            failures,
            logs: [
              ...prev.logs,
              {
                id: evt.id,
                timestamp: evt.timestamp,
                type: "FAILURE_RECORDED",
                message: evt.message,
                testId: evt.testId,
              },
            ],
          };
        });
        break;

      case "session_completed":
      case "session_stopped":
        setData((prev) => ({
          ...prev,
          status: "completed",
          progress: evt.data?.progress || prev.progress,
          logs: [
            ...prev.logs,
            {
              id: evt.id,
              timestamp: evt.timestamp,
              type: "SESSION_COMPLETED",
              message: evt.message,
            },
          ],
        }));
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
          streamCleanupRef.current = null;
        }
        break;

      default:
        break;
    }
  }, [activeTestId]);

  // Presentation scheduler
  useEffect(() => {
    const scheduler = new PresentationScheduler(
      (evt) => applyServerEvent(evt),
      (activity) => setCurrentActivity(activity),
      demoSpeed,
    );
    schedulerRef.current = scheduler;

    return () => {
      scheduler.destroy();
    };
  }, [applyServerEvent, demoSpeed]);

  const handleDemoSpeedChange = (speed: DemoModeSpeed) => {
    setDemoSpeed(speed);
    schedulerRef.current?.setSpeed(speed);
  };

  const handleIncomingServerEvent = useCallback((evt: ServerEvent) => {
    if (schedulerRef.current) {
      schedulerRef.current.enqueue(evt);
    } else {
      applyServerEvent(evt);
    }
  }, [applyServerEvent]);

  // Staged multi-phase simulation for human-readable demo pacing
  const runPacedSimulationStep = useCallback(
    async (targetTestId: string) => {
      const sim = SIMULATED_TEST_RUNS[targetTestId];
      const now = () => new Date().toLocaleTimeString("en-US", { hour12: false });
      const wait = (ms: number) => {
        const factor = demoSpeed === "live" ? 0.05 : demoSpeed === "2x" ? 0.5 : 1;
        return new Promise((resolve) => setTimeout(resolve, Math.round(ms * factor)));
      };

      if (simulationAbortRef.current) return;

      // Phase 1: Test selected & set to running
      setActiveTestId(targetTestId);
      setData((prev) => ({
        ...prev,
        tests: prev.tests.map((t) =>
          t.id === targetTestId
            ? { ...t, status: "running" as const, conversation: [] }
            : t,
        ),
        progress: { ...prev.progress, running: 1 },
      }));
      setCurrentActivity("Preparing attack probe...");
      await wait(1200);

      if (simulationAbortRef.current) return;

      // Phase 2: Attacker prompt appears
      const foundTest = data.tests.find((t) => t.id === targetTestId);
      const attackText = foundTest?.attack || "Adversarial boundary probe";
      setData((prev) => ({
        ...prev,
        tests: prev.tests.map((t) =>
          t.id === targetTestId
            ? {
                ...t,
                conversation: [
                  {
                    role: "adversight",
                    content: attackText,
                    timestamp: now(),
                  },
                ],
              }
            : t,
        ),
        logs: [
          ...prev.logs,
          {
            id: `log_${Date.now()}_probe`,
            timestamp: now(),
            type: "ATTACK_GENERATED",
            message: `Probe generated: "${attackText.slice(0, 50)}..."`,
            testId: targetTestId,
          },
        ],
      }));
      setCurrentActivity("Probing target agent...");
      await wait(2400); // Ample time for audience to read attacker prompt!

      if (simulationAbortRef.current) return;

      // Phase 3: Agent Response appears
      const agentResponse = sim?.response || "I cannot execute this request.";
      setData((prev) => ({
        ...prev,
        tests: prev.tests.map((t) =>
          t.id === targetTestId
            ? {
                ...t,
                conversation: [
                  ...t.conversation,
                  {
                    role: "target",
                    content: agentResponse,
                    timestamp: now(),
                  },
                ],
                response: agentResponse,
              }
            : t,
        ),
        logs: [
          ...prev.logs,
          {
            id: `log_${Date.now()}_resp`,
            timestamp: now(),
            type: "AGENT_RESPONSE_RECEIVED",
            message: `Target agent response received`,
            testId: targetTestId,
          },
        ],
      }));
      setCurrentActivity("Reading agent response...");
      await wait(2600); // Ample time for audience to read agent response!

      if (simulationAbortRef.current) return;

      // Phase 4: Intercepted tool call (if present)
      const interceptedTools = sim?.toolCalls;
      if (interceptedTools && interceptedTools.length > 0) {
        setData((prev) => ({
          ...prev,
          tests: prev.tests.map((t) =>
            t.id === targetTestId
              ? { ...t, toolCalls: interceptedTools }
              : t,
          ),
          logs: [
            ...prev.logs,
            {
              id: `log_${Date.now()}_tool`,
              timestamp: now(),
              type: "TOOL_CALL",
              message: `TOOL_CALL intercepted: ${interceptedTools[0].name}()`,
              testId: targetTestId,
            },
          ],
        }));
        setCurrentActivity(`Intercepted unauthorized tool: ${interceptedTools[0].name}()`);
        await wait(2400); // Ample time to inspect tool arguments!
      }

      if (simulationAbortRef.current) return;

      // Phase 5: Policy check & verdict
      setCurrentActivity("Verifying safety policy boundaries...");
      await wait(1600);

      if (simulationAbortRef.current) return;

      const isFailed = sim?.failureType !== undefined;
      const turnNum = Math.ceil(((foundTest?.conversation.length || 0) + 1) / 2);

      setData((prev) => {
        const completed = prev.progress.completed + 1;
        const passed = prev.progress.passed + (isFailed ? 0 : 1);
        const failed = prev.progress.failed + (isFailed ? 1 : 0);
        const running = 0;

        const updatedTests = prev.tests.map((t) => {
          if (t.id === targetTestId) {
            return {
              ...t,
              status: (isFailed ? "failed" : "passed") as "failed" | "passed",
              failureType: sim?.failureType,
              failureDescription: sim?.failureDescription,
              completedAt: now(),
            };
          }
          return t;
        });

        const newFailures = [...prev.failures];
        if (isFailed && sim?.failureType) {
          const failureId = `fail_${targetTestId}_${Date.now()}`;
          if (!newFailures.some((f) => f.testId === targetTestId)) {
            newFailures.push({
              id: failureId,
              testId: targetTestId,
              testNumber: foundTest?.testNumber || 1,
              type: sim.failureType,
              severity: sim.severity || "high",
              description:
                sim.failureDescription ||
                "Safety policy boundary violated during adversarial probe.",
              whyItFailed:
                sim.whyItFailed ||
                "Target agent executed actions without required user confirmation.",
              timestamp: now(),
              attack: attackText,
              response: agentResponse,
              toolCalls: sim.toolCalls,
              strategy: foundTest?.strategy || "unauthorized_action",
              detectorName: "UnauthorizedActionDetector",
              confidence: 0.98,
              turnNumber: turnNum,
            });
          }
        }

        const newLogs = [
          ...prev.logs,
          isFailed
            ? {
                id: `log_${Date.now()}_fail`,
                timestamp: now(),
                type: "FAILURE_RECORDED" as const,
                message: `Vulnerability confirmed: ${sim?.failureType}`,
                testId: targetTestId,
              }
            : {
                id: `log_${Date.now()}_pass`,
                timestamp: now(),
                type: "TEST_COMPLETED" as const,
                message: `Probe #${foundTest?.testNumber} completed — PASSED`,
                testId: targetTestId,
              },
        ];

        return {
          ...prev,
          progress: {
            total: prev.config.maxTests,
            completed,
            passed,
            failed,
            running,
          },
          tests: updatedTests,
          failures: newFailures,
          logs: newLogs,
        };
      });

      setCurrentActivity(
        isFailed ? "Vulnerability confirmed & recorded" : "Probe complete — attack resisted",
      );
      await wait(1800);
    },
    [data.tests, demoSpeed],
  );

  // Simulation loop trigger
  useEffect(() => {
    if (data.status !== "testing") {
      simulationAbortRef.current = true;
      return;
    }

    simulationAbortRef.current = false;

    // Find next pending test for selected goal
    const nextPending = data.tests.find(
      (test) =>
        test.strategy === selectedGoal &&
        (test.status === "pending" || test.status === "running"),
    );

    if (!nextPending) {
      const timer = setTimeout(() => {
        setData((prev) => ({ ...prev, status: "completed" }));
        setCurrentActivity(null);
      }, 100);
      return () => clearTimeout(timer);
    }

    let isMounted = true;
    const stepTimer = setTimeout(() => {
      runPacedSimulationStep(nextPending.id).then(() => {
        if (isMounted && data.status === "testing" && !simulationAbortRef.current) {
          // Complete
        }
      });
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(stepTimer);
    };
  }, [data.status, data.tests, data.progress.completed, runPacedSimulationStep, selectedGoal]);

  // Start Session or Fallback Simulation
  const handleStart = async () => {
    if (data.status === "testing") return;
    if (Object.keys(getTargetAgentErrors(data.config.targetAgent)).length > 0) return;

    if (data.config.targetAgent.kind !== "http") {
      try {
        const newSession = await createSession(data.config);
        currentSessionIdRef.current = newSession.sessionId;

        if (streamCleanupRef.current) {
          streamCleanupRef.current();
          streamCleanupRef.current = null;
        }

        const disconnect = connectToSessionStream(
          newSession.sessionId,
          (evt) => handleIncomingServerEvent(evt),
          (err) => console.warn("SSE stream notice:", err),
        );
        streamCleanupRef.current = disconnect;

        await startSession(newSession.sessionId);
        setData((prev) => ({
          ...prev,
          status: "testing",
          sessionId: newSession.sessionId,
        }));
        return;
      } catch (err) {
        console.warn(
          "Backend unavailable, continuing in local simulation mode:",
          err,
        );
      }
    }

    // Local simulation fallback
    simulationAbortRef.current = false;
    const nextTest = data.tests.find(
      (test) =>
        test.strategy === selectedGoal &&
        (test.status === "pending" || test.status === "running"),
    );
    if (!nextTest) return;
    setActiveTestId(nextTest.id);
    setData((prev) => ({ ...prev, status: "testing" }));
  };

  const handlePause = async () => {
    simulationAbortRef.current = true;
    if (currentSessionIdRef.current) {
      try {
        await stopSession(currentSessionIdRef.current);
      } catch (err) {
        console.warn("Failed to stop backend session:", err);
      }
    }
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }
    schedulerRef.current?.flushQueue();
    setData((prev) => ({ ...prev, status: "idle" }));
    setCurrentActivity(null);
  };

  const handleReset = () => {
    simulationAbortRef.current = true;
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }
    currentSessionIdRef.current = null;
    schedulerRef.current?.clear();
    setData(createInitialData());
    setActiveTestId("test_015");
    setSelectedFailure(null);
    setCurrentActivity(null);
  };

  const handleGoalSelect = (goal: AttackCategory) => {
    if (data.status === "testing") return;
    setSelectedGoal(goal);
    setData((prev) => ({
      ...prev,
      config: { ...prev.config, attackCategories: [goal] },
    }));
    const nextTest = data.tests.find(
      (test) =>
        test.strategy === goal &&
        (test.status === "pending" || test.status === "running"),
    );
    setActiveTestId(nextTest?.id ?? "");
  };

  const handleAgentChange = (newAgent: TargetAgent) => {
    if (data.status === "testing") return;
    setData((prev) => ({
      ...prev,
      config: { ...prev.config, targetAgent: newAgent },
    }));
  };

  // Export full audit report as JSON
  const handleExportAudit = () => {
    const report = {
      adversight_version: "1.0-RC",
      generated_at: new Date().toISOString(),
      session_id: data.sessionId,
      target_agent: data.config.targetAgent,
      configuration: data.config,
      metrics: {
        total_tests: data.progress.total,
        completed_tests: data.progress.completed,
        passed_tests: data.progress.passed,
        failed_tests: data.progress.failed,
        pass_rate_percentage: Math.round(
          (data.progress.passed / (data.progress.completed || 1)) * 100,
        ),
      },
      vulnerabilities_discovered: data.failures,
      test_suite_execution_traces: data.tests,
      observability_telemetry_logs: data.logs,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adversight_audit_${data.sessionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isRunning = data.status === "testing";
  const canStart =
    Object.keys(getTargetAgentErrors(data.config.targetAgent)).length === 0 &&
    queuedGoalCount > 0;

  return (
    <div className="min-h-screen bg-[#f8faf8] text-[#202a2a] flex flex-col font-sans antialiased selection:bg-[#dcebe2] selection:text-[#2c674f]">
      {/* Top Application Command Header matching Landing Navbar */}
      <Header
        status={data.status}
        targetName={data.config.targetAgent.name || "Target Agent"}
        sessionId={data.sessionId}
        currentTestNumber={activeTest?.testNumber}
        totalTests={data.progress.total}
        demoSpeed={demoSpeed}
        onDemoSpeedChange={handleDemoSpeedChange}
        onStart={handleStart}
        onPause={handlePause}
        onReset={handleReset}
        onExportReport={handleExportAudit}
        canStart={canStart}
      />

      {/* Main Clean Workspace */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 flex-1 flex flex-col gap-5">
        {/* Offline notice for custom target if offline */}
        {data.config.targetAgent.kind !== "http" && !data.config.targetAgent.connected && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-[#fae2c0] bg-[#fff8eb] px-3.5 py-2 text-xs text-[#94601b] font-mono"
          >
            <WifiOff size={13} className="shrink-0" />
            <span>Target endpoint is offline. Autonomous simulation harness is active.</span>
          </div>
        )}

        {/* 2-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
          {/* Left Column: Target & Strategy Controls */}
          <aside className="flex flex-col gap-3.5">
            <AgentConfig
              currentAgent={data.config.targetAgent}
              onAgentChange={handleAgentChange}
              disabled={isRunning}
            />

            {/* Attack Strategy Goals */}
            <div className="flex flex-col gap-2 rounded-lg border border-[#dfe5df] bg-white p-3.5 text-xs font-sans">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-[#202a2a]">
                  Attack Strategy
                </span>
                <span className="text-[#8a9891]">7 goals</span>
              </div>

              <div className="flex flex-col gap-0.5">
                {ATTACK_GOALS.map((goal) => {
                  const selected = selectedGoal === goal.id;
                  const queued = data.tests.filter(
                    (test) =>
                      test.strategy === goal.id &&
                      (test.status === "pending" || test.status === "running"),
                  ).length;

                  return (
                    <button
                      key={goal.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleGoalSelect(goal.id)}
                      className={`flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-all ${
                        selected
                          ? "bg-[#eef6f1] text-[#24543f] font-semibold"
                          : "text-[#55635c] hover:bg-[#f6f9f7] hover:text-[#202a2a]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CircleDot
                          size={11}
                          className={selected ? "text-[#2c674f] shrink-0" : "text-[#b0bbb4] shrink-0"}
                        />
                        <span className="truncate">{goal.label}</span>
                      </div>
                      <span
                        className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded tabular-nums shrink-0 ${
                          selected
                            ? "bg-[#dcebe1] text-[#24543f] font-semibold"
                            : "text-[#8a9891]"
                        }`}
                      >
                        {queued}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Test Progress */}
            <TestProgressBar progress={data.progress} isTesting={isRunning} />
          </aside>

          {/* Right Column: Live Conversation & Discovered Vulnerabilities */}
          <section className="flex flex-col gap-5 min-w-0">
            {/* Live Investigation Stream */}
            <LiveConversation
              activeTest={activeTest}
              agentName={data.config.targetAgent.name}
              currentActivity={currentActivity}
              onViewEvidence={(testId) => {
                const failure = data.failures.find((f) => f.testId === testId);
                if (failure) setSelectedFailure(failure);
              }}
              onReplayTest={(test) => {
                const failure = data.failures.find((f) => f.testId === test.id);
                if (failure) setSelectedFailure(failure);
              }}
            />

            {/* Discovered Failures & Telemetry Tabs */}
            <div className="rounded-lg border border-[#dfe5df] bg-white p-4 font-sans flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[#edf0ed] pb-2.5">
                <div className="flex items-center gap-4 text-xs font-mono">
                  <button
                    onClick={() => setActiveBottomTab("failures")}
                    className={`flex items-center gap-1.5 pb-1 border-b-2 font-semibold transition-all cursor-pointer ${
                      activeBottomTab === "failures"
                        ? "border-[#2c674f] text-[#202a2a]"
                        : "border-transparent text-[#65736d] hover:text-[#202a2a]"
                    }`}
                  >
                    <AlertTriangle size={12} className={data.failures.length > 0 ? "text-[#9a5141]" : "text-[#65736d]"} />
                    <span>Discovered Failures</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      data.failures.length > 0 ? "bg-[#fcf1ed] text-[#9a5141]" : "bg-[#f1f4f1] text-[#65736d]"
                    }`}>
                      {data.failures.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveBottomTab("logs")}
                    className={`flex items-center gap-1.5 pb-1 border-b-2 font-semibold transition-all cursor-pointer ${
                      activeBottomTab === "logs"
                        ? "border-[#2c674f] text-[#202a2a]"
                        : "border-transparent text-[#65736d] hover:text-[#202a2a]"
                    }`}
                  >
                    <Terminal size={12} className="text-[#65736d]" />
                    <span>Telemetry</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#f1f4f1] text-[#65736d]">
                      {data.logs.length}
                    </span>
                  </button>
                </div>

                {activeBottomTab === "failures" && data.failures.length > 0 && (
                  <div className="relative w-44 hidden sm:block">
                    <Search
                      size={11}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b9992]"
                    />
                    <input
                      value={failureSearch}
                      onChange={(event) => setFailureSearch(event.target.value)}
                      placeholder="Search failures…"
                      className="h-6 w-full rounded border border-[#dfe5df] bg-[#f8faf8] pl-6 pr-2 text-xs text-[#202a2a] outline-none focus:border-[#2c674f] focus:bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Failures List */}
              {activeBottomTab === "failures" && (
                <div>
                  {filteredFailures.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-[#dfe5df] rounded-md bg-[#fafcfa]">
                      <ShieldCheck size={18} className="text-[#3e8658] mb-1" />
                      <span className="text-xs font-mono font-semibold uppercase text-[#202a2a]">
                        No Failures Detected
                      </span>
                      <span className="text-xs text-[#6e7d76] mt-0.5">
                        {data.failures.length
                          ? "No vulnerabilities match filter."
                          : "Completed test probes adhered to security invariants."}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto overscroll-contain pr-1">
                      {filteredFailures.map((failure) => (
                        <FailureCard
                          key={failure.id}
                          failure={failure}
                          onViewEvidence={(f) => setSelectedFailure(f)}
                          onReplay={(f) => setSelectedFailure(f)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Telemetry Logs */}
              {activeBottomTab === "logs" && (
                <div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Failure Details Modal Dialog */}
      <FailureDetails
        key={selectedFailure?.id ?? "none"}
        failure={selectedFailure}
        onClose={() => setSelectedFailure(null)}
      />
    </div>
  );
}
