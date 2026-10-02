import { useState, useMemo, useEffect, useRef } from "react";
import {
  type DashboardData,
  type Failure,
  type TestCase,
  type TargetAgent,
  type LogEvent,
  type AttackCategory,
} from "@/types/testing";
import {
  mockDashboardData,
  MOCK_TARGET_AGENTS,
  SIMULATED_TEST_RUNS,
} from "@/data/mockData";

import { FailureDetails } from "@/components/results/FailureDetails";

import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Square,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

const ATTACK_GOALS: { id: AttackCategory; label: string; description: string }[] = [
  { id: "unauthorized_action", label: "Unauthorized action", description: "Test whether the agent acts without valid confirmation." },
  { id: "goal_hijacking", label: "Goal hijacking", description: "Redirect the agent away from its intended task." },
  { id: "identity_confusion", label: "Identity confusion", description: "Test role and authority claims supplied in chat." },
  { id: "policy_violation", label: "Policy violation", description: "Probe business and safety policy boundaries." },
  { id: "context_manipulation", label: "Context manipulation", description: "Introduce false history or altered instructions." },
  { id: "tool_misuse", label: "Tool misuse", description: "Probe tool permissions, arguments, and data access." },
  { id: "information_extraction", label: "Information extraction", description: "Test for prompt, schema, or sensitive-data disclosure." },
];

function createInitialData(): DashboardData {
  return {
    ...mockDashboardData,
    status: "idle",
    progress: { ...mockDashboardData.progress, running: 0 },
    tests: mockDashboardData.tests.map((test) =>
      test.status === "running" ? { ...test, status: "pending" } : test
    ),
  };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(createInitialData);
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null);
  const [activeTestId, setActiveTestId] = useState<string>("test_015");
  const [selectedGoal, setSelectedGoal] = useState<AttackCategory>("unauthorized_action");
  const [failureSearch, setFailureSearch] = useState("");
  const [simSpeed, setSimSpeed] = useState<number>(1);

  // Simulation timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active test memo
  const activeTest = useMemo<TestCase | null>(() => {
    return data.tests.find((t) => t.id === activeTestId) ?? data.tests[0] ?? null;
  }, [data.tests, activeTestId]);

  const selectedGoalDetails = ATTACK_GOALS.find((goal) => goal.id === selectedGoal) ?? ATTACK_GOALS[0];
  const queuedGoalCount = data.tests.filter(
    (test) => test.strategy === selectedGoal && (test.status === "pending" || test.status === "running")
  ).length;
  const filteredFailures = useMemo(() => {
    const query = failureSearch.trim().toLowerCase();
    if (!query) return data.failures;
    return data.failures.filter((failure) =>
      [failure.type, failure.strategy, failure.description, failure.severity, failure.testId]
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [data.failures, failureSearch]);

  // Start / Resume Simulation
  const handleStart = () => {
    if (data.status === "testing") return;
    const nextTest = data.tests.find(
      (test) => test.strategy === selectedGoal && (test.status === "pending" || test.status === "running")
    );
    if (!nextTest || !data.config.targetAgent.connected) return;
    setActiveTestId(nextTest.id);
    setData((prev) => ({ ...prev, status: "testing" }));
  };

  const handlePause = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setData((prev) => ({ ...prev, status: "idle" }));
  };

  // Reset state to initial demo mock
  const handleReset = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const initialData = createInitialData();
    setData(initialData);
    setActiveTestId("test_015");
    setSelectedGoal("unauthorized_action");
    setSelectedFailure(null);
  };

  // Change Target Agent
  const handleAgentChange = (newAgent: TargetAgent) => {
    setData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        targetAgent: newAgent,
      },
    }));

    // Add telemetry log
    const now = new Date().toTimeString().slice(0, 8);
    const newLog: LogEvent = {
      id: `log_agent_${Date.now()}`,
      timestamp: now,
      type: "SESSION_STARTED",
      message: `Target agent switched to ${newAgent.name} (${newAgent.endpoint})`,
    };
    setData((prev) => ({ ...prev, logs: [...prev.logs, newLog] }));
  };

  // Execute a single test step in state
  const executeSingleTestStep = (testId: string) => {
    const sim = SIMULATED_TEST_RUNS[testId];
    const now = new Date().toTimeString().slice(0, 8);

    setData((prev) => {
      const updatedTests = prev.tests.map((t) => {
        if (t.id === testId) {
          const outcome = sim ? sim.status : "passed";
          const resText = sim ? sim.response : "Adhered to security guidelines.";
          const failType = sim?.failureType;
          const failDesc = sim?.failureDescription;
          const toolCalls = sim?.toolCalls;

          return {
            ...t,
            status: outcome,
            response: resText,
            failureType: failType,
            failureDescription: failDesc,
            toolCalls: toolCalls,
            completedAt: now,
            conversation: [
              ...t.conversation,
              {
                role: "target" as const,
                content: resText,
                timestamp: now,
              },
            ],
          };
        }
        return t;
      });

      // Recalculate progress
      const completed = updatedTests.filter((t) => t.status === "passed" || t.status === "failed").length;
      const passed = updatedTests.filter((t) => t.status === "passed").length;
      const failed = updatedTests.filter((t) => t.status === "failed").length;
      const running = updatedTests.filter((t) => t.status === "running").length;

      // Add new failure if failed
      const newFailures = [...prev.failures];
      if (sim && sim.status === "failed" && !newFailures.some((f) => f.testId === testId)) {
        const foundTest = updatedTests.find((t) => t.id === testId);
        newFailures.push({
          id: `failure_${testId}`,
          testId: testId,
          testNumber: foundTest?.testNumber ?? 0,
          type: sim.failureType ?? "Safety Invariant Broken",
          strategy: foundTest?.strategy ?? "unauthorized_action",
          description: sim.failureDescription ?? "Vulnerability detected during adversarial probing.",
          severity: sim.severity ?? "high",
          attack: foundTest?.attack ?? "",
          response: sim.response,
          toolCalls: sim.toolCalls,
          whyItFailed: sim.whyItFailed ?? "Agent failed to validate authorization boundary.",
          timestamp: now,
        });
      }

      // Add corresponding telemetry logs
      const foundTest = updatedTests.find((t) => t.id === testId);
      const isFailed = sim?.status === "failed";
      const newLogs: LogEvent[] = [
        ...prev.logs,
        {
          id: `log_${Date.now()}_1`,
          timestamp: now,
          type: "REQUEST_SENT",
          message: `Probe #${foundTest?.testNumber} dispatched to ${prev.config.targetAgent.endpoint}`,
          testId: testId,
        },
        {
          id: `log_${Date.now()}_2`,
          timestamp: now,
          type: "AGENT_RESPONSE_RECEIVED",
          message: `Target agent response received (strategy: ${foundTest?.strategy})`,
          testId: testId,
        },
      ];

      if (sim?.toolCalls && sim.toolCalls.length > 0) {
        newLogs.push({
          id: `log_${Date.now()}_tool`,
          timestamp: now,
          type: "TOOL_CALL",
          message: `TOOL_CALL intercepted: ${sim.toolCalls[0].name}()`,
          testId: testId,
        });
      }

      if (isFailed) {
        newLogs.push(
          {
            id: `log_${Date.now()}_policy`,
            timestamp: now,
            type: "POLICY_CHECK",
            message: `POLICY_CHECK: FAILED — ${sim.failureType}`,
            testId: testId,
          },
          {
            id: `log_${Date.now()}_rec`,
            timestamp: now,
            type: "FAILURE_RECORDED",
            message: `Vulnerability recorded — SEVERITY: ${sim.severity?.toUpperCase()} — ${sim.failureType}`,
            testId: testId,
          }
        );
      } else {
        newLogs.push({
          id: `log_${Date.now()}_done`,
          timestamp: now,
          type: "TEST_COMPLETED",
          message: `Test #${foundTest?.testNumber} completed — PASSED`,
          testId: testId,
        });
      }

      const allDone = completed === prev.config.maxTests;

      return {
        ...prev,
        status: allDone ? "completed" : "testing",
        progress: {
          total: prev.config.maxTests,
          completed,
          passed,
          failed,
          running: allDone ? 0 : running,
        },
        tests: updatedTests,
        failures: newFailures,
        logs: newLogs,
      };
    });

    setActiveTestId(testId);
  };

  // Deterministic simulation interval when testing
  useEffect(() => {
    if (data.status !== "testing") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalTime = Math.max(800, 2500 / simSpeed);

    timerRef.current = setInterval(() => {
      // Find the next test to run
      const nextPendingIndex = data.tests.findIndex(
        (test) => test.strategy === selectedGoal && (test.status === "pending" || test.status === "running")
      );

      if (nextPendingIndex === -1) {
        setData((prev) => ({ ...prev, status: "completed" }));
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      const targetTest = data.tests[nextPendingIndex];

      // Set to running first, then resolve
      if (targetTest.status === "pending") {
        setData((prev) => ({
          ...prev,
          tests: prev.tests.map((t, idx) =>
            idx === nextPendingIndex ? { ...t, status: "running" as const } : t
          ),
          progress: {
            ...prev.progress,
            running: 1,
          },
        }));
        setActiveTestId(targetTest.id);
      } else {
        // Resolve running test
        executeSingleTestStep(targetTest.id);
      }
    }, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data.status, data.tests, simSpeed, selectedGoal]);

  const handleGoalSelect = (goal: AttackCategory) => {
    if (data.status === "testing") return;
    setSelectedGoal(goal);
    setData((prev) => ({
      ...prev,
      config: { ...prev.config, attackCategories: [goal] },
    }));
    const nextTest = data.tests.find(
      (test) => test.strategy === goal && (test.status === "pending" || test.status === "running")
    );
    setActiveTestId(nextTest?.id ?? "");
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
        pass_rate_percentage: Math.round((data.progress.passed / (data.progress.completed || 1)) * 100),
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
  const isPaused = !isRunning && activeTest?.status === "running";
  const currentGoal = selectedGoalDetails;
  const verdict = activeTest?.status === "failed" ? "failed" : activeTest?.status === "passed" ? "passed" : null;
  const activeFailure = activeTest ? data.failures.find((failure) => failure.testId === activeTest.id) : null;
  const turnCount = Math.ceil((activeTest?.conversation.length ?? 0) / 2);

  return (
    <div className="min-h-screen bg-[#f3f5f2] text-[#202a2a]">
      <header className="sticky top-0 z-30 border-b border-[#dfe5df] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-17 max-w-360 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#e7efeb] text-[#28614f]">
              <Shield size={19} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold tracking-normal">AdverSight</span>
                <span className="hidden border-l border-[#dfe5df] pl-2 text-xs text-[#71807a] sm:inline">Security evaluation</span>
              </div>
              <p className="truncate text-[11px] text-[#78847f]">Agent attack workspace</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className={`inline-flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium ${isRunning ? "bg-[#fff3df] text-[#94601b]" : data.status === "completed" ? "bg-[#e6f1e9] text-[#34714b]" : "bg-[#eef1ed] text-[#56635d]"}`}>
              <span className={`size-1.5 rounded-full ${isRunning ? "bg-[#c7872d]" : data.status === "completed" ? "bg-[#42825a]" : "bg-[#8b9790]"}`} />
              {isRunning ? "Attack running" : isPaused ? "Attack paused" : data.status === "completed" ? "Attack complete" : "Ready to test"}
            </span>
            <button onClick={handleExportAudit} title="Export audit report" className="inline-flex size-9 items-center justify-center rounded-md border border-[#dfe5df] text-[#586660] transition hover:bg-[#f3f6f3] hover:text-[#254f40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]">
              <ArrowDownToLine size={16} />
              <span className="sr-only">Export audit report</span>
            </button>
            <button onClick={handleReset} title="Reset workspace" className="hidden size-9 items-center justify-center rounded-md border border-[#dfe5df] text-[#586660] transition hover:bg-[#f3f6f3] hover:text-[#254f40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63] sm:inline-flex">
              <RotateCcw size={15} />
              <span className="sr-only">Reset workspace</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-360 flex-col gap-7 px-4 pb-12 pt-7 sm:px-6 lg:px-8">
        <section className="flex flex-col justify-between gap-5 border-b border-[#dfe5df] pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#567565]">Evaluation / {data.sessionId}</p>
            <h1 className="text-[26px] font-semibold leading-tight text-[#202a2a] sm:text-[30px]">Attack workspace</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#65736d]">Choose an attack goal, run it against your agent, then inspect and reproduce any security failures.</p>
          </div>
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-[#53615a] sm:w-65">
            Target agent
            <select
              value={data.config.targetAgent.id}
              disabled={isRunning}
              onChange={(event) => {
                const agent = MOCK_TARGET_AGENTS.find((candidate) => candidate.id === event.target.value);
                if (agent) handleAgentChange(agent);
              }}
              className="h-10 w-full rounded-md border border-[#d5ddd6] bg-white px-3 text-sm text-[#27332e] shadow-sm outline-none transition focus:border-[#52816b] focus:ring-2 focus:ring-[#52816b]/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {MOCK_TARGET_AGENTS.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
        </section>

        <nav aria-label="Attack workflow" className="grid grid-cols-3 border-b border-[#dfe5df]">
          {[
            { number: "01", label: "Choose goal", step: 1 },
            { number: "02", label: "Run attack", step: 2 },
            { number: "03", label: "Inspect outcome", step: 3 },
          ].map((item, index) => {
            const activeStep = isRunning || isPaused ? 2 : data.status === "completed" ? 3 : 1;
            const complete = item.step < activeStep || (item.step === 1 && data.status !== "idle");
            return (
              <div key={item.number} className={`flex items-center gap-2.5 border-b-2 px-1 pb-3 text-sm ${item.step === activeStep ? "border-[#37735a] font-semibold text-[#2c674f]" : complete ? "border-transparent text-[#65736d]" : "border-transparent text-[#9aa49e]"}`}>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${complete ? "bg-[#e4eee8] text-[#34714f]" : item.step === activeStep ? "bg-[#dcebe2] text-[#2c674f]" : "bg-[#e9ede9] text-[#849089]"}`}>
                  {complete ? <CheckCircle2 size={13} /> : item.number}
                </span>
                <span>{item.label}</span>
                {index < 2 && <ArrowRight size={13} className="ml-auto hidden text-[#a2aca6] sm:block" />}
              </div>
            );
          })}
        </nav>

        {!data.config.targetAgent.connected && (
          <div role="alert" className="flex items-start gap-3 border border-[#e7c9ad] bg-[#fff8ef] px-4 py-3 text-sm text-[#80562f]">
            <WifiOff size={17} className="mt-0.5 shrink-0" />
            <div><p className="font-semibold">Target endpoint is offline</p><p className="mt-0.5 text-xs">Reconnect the agent before starting an attack. The selected endpoint is {data.config.targetAgent.endpoint}.</p></div>
          </div>
        )}

        <section className="grid min-w-0 gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col gap-4">
            <div className="overflow-hidden rounded-md border border-[#dfe5df] bg-white">
              <div className="border-b border-[#e7ebe7] px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#718078]">01 / Attack goal</p>
                <h2 className="mt-1 text-[15px] font-semibold">Select a strategy</h2>
              </div>
              <div className="divide-y divide-[#edf0ed]">
                {ATTACK_GOALS.map((goal) => {
                  const selected = selectedGoal === goal.id;
                  const queued = data.tests.filter((test) => test.strategy === goal.id && (test.status === "pending" || test.status === "running")).length;
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={isRunning}
                      onClick={() => handleGoalSelect(goal.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#417b63] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "bg-[#f0f6f1]" : "bg-white hover:bg-[#f8faf8]"}`}
                    >
                      <span className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#3e795f] bg-[#3e795f] text-white" : "border-[#bdc8bf] bg-white text-transparent"}`}><CircleDot size={12} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-[#2a3530]">
                          {goal.label}
                          <span className="font-mono text-[10px] font-medium tabular-nums text-[#88938c]">{queued} queued</span>
                        </span>
                        <span className="mt-1 block text-xs leading-[1.45] text-[#748078]">{goal.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-[#e7ebe7] bg-[#fafbf9] px-4 py-3">
                <label className="flex items-center justify-between gap-3 text-xs text-[#6e7a73]">
                  <span>Simulation speed</span>
                  <span className="inline-flex rounded border border-[#dce3dc] bg-white p-0.5">
                    {[1, 2, 4].map((speed) => <button key={speed} onClick={() => setSimSpeed(speed)} aria-pressed={simSpeed === speed} className={`min-w-9 rounded px-2 py-1 font-mono text-[11px] transition ${simSpeed === speed ? "bg-[#e7f0e9] font-semibold text-[#31664e]" : "text-[#77837b] hover:bg-[#f2f5f2]"}`}>{speed}x</button>)}
                  </span>
                </label>
              </div>
            </div>

            <div className="rounded-md border border-[#dfe5df] bg-white px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {data.config.targetAgent.connected ? <Wifi size={16} className="shrink-0 text-[#4c8060]" /> : <WifiOff size={16} className="shrink-0 text-[#ad684c]" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{data.config.targetAgent.name}</p>
                    <p className="truncate font-mono text-[10px] text-[#7b8780]">{data.config.targetAgent.endpoint}</p>
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold ${data.config.targetAgent.connected ? "text-[#477655]" : "text-[#ad684c]"}`}>{data.config.targetAgent.connected ? "Connected" : "Offline"}</span>
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col overflow-hidden rounded-md border border-[#d9e1da] bg-white shadow-[0_1px_2px_rgba(25,42,32,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eae5] px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#718078]">02 / Live attack</p>
                <h2 className="mt-1 truncate text-base font-semibold text-[#27332e]">{currentGoal?.label ?? selectedGoalDetails.label}</h2>
                <p className="mt-0.5 truncate text-xs text-[#748078]">{activeTest ? `Probe #${String(activeTest.testNumber).padStart(2, "0")} · ${activeTest.id}` : "Waiting for an attack to start"}</p>
              </div>
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#fff3df] px-2.5 py-1.5 text-xs font-medium text-[#94601b]"><LoaderCircle size={13} className="animate-spin" />Running</span>
                    <button onClick={handlePause} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dfd7] bg-white px-3 text-xs font-semibold text-[#4c5a52] transition hover:bg-[#f6f8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]"><Square size={12} fill="currentColor" />Stop</button>
                  </>
                ) : data.status === "completed" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#e6f1e9] px-2.5 py-1.5 text-xs font-medium text-[#34714b]"><CheckCircle2 size={14} />Complete</span>
                ) : (
                  <button onClick={handleStart} disabled={!data.config.targetAgent.connected || queuedGoalCount === 0} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#326a51] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285941] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#326a51] disabled:cursor-not-allowed disabled:bg-[#a5b6a9]"><Play size={14} fill="currentColor" />{isPaused ? "Resume attack" : "Start attack"}</button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#edf0ed] bg-[#fafbf9] px-4 py-2.5 text-xs sm:px-5">
              <span className="flex items-center gap-2 text-[#637169]"><span className={`size-1.5 rounded-full ${isRunning ? "bg-[#c7872d]" : "bg-[#89958d]"}`} />{isRunning ? "Streaming response" : isPaused ? "Paused · ready to resume" : data.status === "completed" ? "Probe execution finished" : queuedGoalCount === 0 ? "No queued probes for this goal" : "Ready to execute"}</span>
              <span className="font-mono tabular-nums text-[#68756d]">Turn {turnCount} <span className="text-[#a0aaa3">/</span> {data.config.maxTurnsPerTest}</span>
              <span className="font-mono tabular-nums text-[#68756d]">{data.progress.completed} of {data.progress.total} probes evaluated</span>
            </div>

            <div className="flex min-h-82.5 flex-1 flex-col gap-4 bg-[#fcfdfb] p-4 sm:p-5">
              {activeTest ? activeTest.conversation.map((turn, index) => {
                const isProbe = turn.role === "adversight";
                return (
                  <article key={`${activeTest.id}-${index}`} className={`max-w-[92%] rounded-md border px-4 py-3 sm:max-w-[82%] ${isProbe ? "self-start border-[#dce6df] bg-white" : "self-end border-[#d9e4de] bg-[#f0f5f1]"}`}>
                    <div className="mb-2 flex items-center justify-between gap-6 border-b border-[#e8ede8] pb-2">
                      <span className={`flex items-center gap-2 text-[11px] font-semibold ${isProbe ? "text-[#65746b]" : "text-[#34644f]"}`}>{isProbe ? <Shield size={13} /> : <Bot size={13} />}{isProbe ? "AdverSight · attack probe" : `${data.config.targetAgent.name} · response`}</span>
                      <time className="font-mono text-[10px] tabular-nums text-[#87928a]">{turn.timestamp}</time>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#34413a]">{turn.content}</p>
                    <p className="mt-2 font-mono text-[10px] text-[#9aa49d]">Turn {Math.floor(index / 2) + 1}</p>
                  </article>
                );
              }) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-[#edf3ee] text-[#47765c]"><ShieldCheck size={20} /></div>
                  <p className="text-sm font-semibold text-[#3a4840]">{queuedGoalCount === 0 ? "No queued probes for this goal" : "Choose a goal to prepare an attack"}</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[#77837b]">{queuedGoalCount === 0 ? "Select another strategy with queued probes to start a new attack." : "The live conversation and evaluation outcome will appear here when the run starts."}</p>
                </div>
              )}
              {isRunning && activeTest?.status === "running" && (
                <div role="status" className="flex items-center gap-2 self-start rounded-md border border-[#e6e3d9] bg-[#fffdf7] px-3 py-2.5 text-xs text-[#7c6b48]"><LoaderCircle size={14} className="animate-spin text-[#a8792d]" />Waiting for the target agent response…</div>
              )}
            </div>

            {verdict && (
              <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-5 ${verdict === "failed" ? "border-[#eadbd4] bg-[#fff8f5]" : "border-[#dce9de] bg-[#f5faf5]"}`}>
                <div className="flex min-w-0 items-start gap-2.5">
                  {verdict === "failed" ? <XCircle size={17} className="mt-0.5 shrink-0 text-[#b55e4c]" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#4b815b]" />}
                  <div className="min-w-0"><p className={`text-sm font-semibold ${verdict === "failed" ? "text-[#8e4739]" : "text-[#376c48]"}`}>{verdict === "failed" ? activeTest?.failureType ?? "Security failure detected" : "Attack resisted"}</p><p className="mt-0.5 text-xs leading-5 text-[#6f7972]">{verdict === "failed" ? activeTest?.failureDescription ?? "The target agent crossed a defined security boundary." : "The agent maintained its expected security boundaries for this probe."}</p></div>
                </div>
                {activeFailure && <button onClick={() => setSelectedFailure(activeFailure)} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#39674f] hover:text-[#234d38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]">Inspect failure <ArrowRight size={14} /></button>}
              </div>
            )}
          </section>
        </section>

        <section className="border-t border-[#dfe5df] pt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#718078]">03 / Findings</p>
              <div className="mt-1 flex items-baseline gap-2.5"><h2 className="text-lg font-semibold">Failures</h2><span className="font-mono text-xs tabular-nums text-[#7a867e]">{data.failures.length} recorded</span></div>
            </div>
            <label className="relative block w-full sm:w-65">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#87938b]" />
              <input value={failureSearch} onChange={(event) => setFailureSearch(event.target.value)} placeholder="Search failures" className="h-9 w-full rounded-md border border-[#d8e0d8] bg-white pl-9 pr-3 text-sm text-[#344139] outline-none transition placeholder:text-[#98a29b] focus:border-[#52816b] focus:ring-2 focus:ring-[#52816b]/15" />
            </label>
          </div>

          {filteredFailures.length === 0 ? (
            <div className="border border-dashed border-[#d8e0d8] bg-white px-5 py-10 text-center">
              <ShieldCheck size={22} className="mx-auto text-[#5b8668]" />
              <p className="mt-2 text-sm font-semibold text-[#435047]">{data.failures.length ? "No failures match this search" : "No failures recorded"}</p>
              <p className="mt-1 text-xs text-[#7b877f]">{data.failures.length ? "Try a different strategy, test ID, or severity." : "Run an attack to see any security findings here."}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e8ece8] border-y border-[#dfe5df] bg-white">
              {filteredFailures.map((failure) => (
                <article key={failure.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <button onClick={() => setSelectedFailure(failure)} className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.07em] ${failure.severity === "critical" || failure.severity === "high" ? "border-[#e7d1ca] bg-[#fcf1ed] text-[#9a5141]" : "border-[#eadfca] bg-[#fbf6e9] text-[#8c713d]"}`}>{failure.severity}</span>
                      <span className="truncate text-sm font-semibold text-[#2e3a33]">{failure.type}</span>
                      <span className="font-mono text-[10px] tabular-nums text-[#869189]">#{String(failure.testNumber).padStart(2, "0")}</span>
                    </span>
                    <span className="mt-1.5 block line-clamp-2 max-w-4xl text-xs leading-5 text-[#69766e]">{failure.description}</span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[#8a958d]"><span>{failure.strategy.replace(/_/g, " ")}</span><span>{failure.timestamp}</span>{failure.toolCalls?.[0] && <span>{failure.toolCalls[0].name}()</span>}</span>
                  </button>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button onClick={() => setSelectedFailure(failure)} className="h-8 rounded-md border border-[#d8e0d8] px-3 text-xs font-semibold text-[#536159] transition hover:bg-[#f5f8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]">Inspect</button>
                    <button onClick={() => setSelectedFailure(failure)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#e9f1eb] px-3 text-xs font-semibold text-[#37674d] transition hover:bg-[#dce9df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63]"><RotateCcw size={13} />Replay</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dfe5df] pt-4 text-xs text-[#7c8880]">
          <span>{data.progress.completed} probes evaluated in this session</span>
          <span className="flex items-center gap-2 font-mono text-[10px]"><Clock3 size={12} /> Session {data.sessionId}</span>
        </footer>
      </main>

      <FailureDetails failure={selectedFailure} onClose={() => setSelectedFailure(null)} />
    </div>
  );
}
