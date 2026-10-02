import { useState, useMemo, useEffect, useRef } from "react";
import {
  type DashboardData,
  type Failure,
  type TestCase,
  type TargetAgent,
  type TestSessionConfig,
  type LogEvent,
} from "@/types/testing";
import {
  mockDashboardData,
  SIMULATED_TEST_RUNS,
} from "@/data/mockData";

// Components
import { Header } from "@/components/layout/Header";
import { WorkflowPipeline } from "@/components/layout/WorkflowPipeline";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AgentConfig } from "@/components/agent/AgentConfig";
import { TestConfiguration } from "@/components/testing/TestConfiguration";
import { TestProgressBar } from "@/components/testing/TestProgress";
import { TestControls } from "@/components/testing/TestControls";
import { LiveConversation } from "@/components/conversation/LiveConversation";
import { TestResult } from "@/components/results/TestResult";
import { FailureCard } from "@/components/results/FailureCard";
import { FailureDetails } from "@/components/results/FailureDetails";
import { ObservabilityLogs } from "@/components/logs/ObservabilityLogs";

import {
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Search,
} from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(mockDashboardData);
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null);
  const [activeTestId, setActiveTestId] = useState<string>("test_007");
  const [testFilter, setTestFilter] = useState<"all" | "failed" | "passed" | "pending">("all");
  const [testSearch, setTestSearch] = useState<string>("");
  const [showAllTests, setShowAllTests] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [pipelineStep, setPipelineStep] = useState<number>(4);

  // Simulation timer ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active test memo
  const activeTest = useMemo<TestCase | null>(() => {
    return data.tests.find((t) => t.id === activeTestId) ?? data.tests[0] ?? null;
  }, [data.tests, activeTestId]);

  // Filtered test list
  const filteredTests = useMemo(() => {
    return data.tests.filter((test) => {
      // Status filter
      if (testFilter === "failed" && test.status !== "failed") return false;
      if (testFilter === "passed" && test.status !== "passed") return false;
      if (testFilter === "pending" && test.status !== "pending" && test.status !== "running") return false;

      // Text search
      if (testSearch.trim()) {
        const q = testSearch.toLowerCase();
        const matchesNum = `#${test.testNumber}`.includes(q);
        const matchesStrat = test.strategy.toLowerCase().includes(q);
        const matchesAttack = test.attack.toLowerCase().includes(q);
        return matchesNum || matchesStrat || matchesAttack;
      }
      return true;
    });
  }, [data.tests, testFilter, testSearch]);

  const visibleTests = showAllTests ? filteredTests : filteredTests.slice(0, 8);

  // Start / Resume Simulation
  const handleStart = () => {
    if (data.status === "testing") return;
    setData((prev) => ({ ...prev, status: "testing" }));
    setPipelineStep(2);
  };

  const handlePause = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setData((prev) => ({ ...prev, status: "idle" }));
  };

  const handleResume = () => {
    setData((prev) => ({ ...prev, status: "testing" }));
  };

  // Reset state to initial demo mock
  const handleReset = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setData(mockDashboardData);
    setActiveTestId("test_007");
    setPipelineStep(4);
  };

  // Step single next pending test
  const handleStepNext = () => {
    const nextPending = data.tests.find((t) => t.status === "pending" || t.status === "running");
    if (!nextPending) return;
    executeSingleTestStep(nextPending.id);
  };

  // Focus next failure
  const handleJumpFailure = () => {
    const firstFail = data.tests.find((t) => t.status === "failed");
    if (firstFail) {
      setActiveTestId(firstFail.id);
    }
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

  // Change Test Config
  const handleConfigChange = (newConfig: TestSessionConfig) => {
    setData((prev) => ({
      ...prev,
      config: newConfig,
    }));
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
      let newFailures = [...prev.failures];
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
        (t) => t.status === "pending" || t.status === "running"
      );

      if (nextPendingIndex === -1) {
        // All tests completed!
        setData((prev) => ({ ...prev, status: "completed" }));
        setPipelineStep(6);
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
        setPipelineStep(3);
      } else {
        // Resolve running test
        executeSingleTestStep(targetTest.id);
        setPipelineStep(5);
      }
    }, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data.status, data.tests, simSpeed]);

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

  return (
    <DashboardLayout>
      {/* Top Header */}
      <Header
        status={data.status}
        targetName={data.config.targetAgent.name}
        sessionId={data.sessionId}
        onReset={handleReset}
        onExportReport={handleExportAudit}
      />

      {/* Visual Workflow Pipeline Banner: TARGET AGENT -> PROBE -> RESPONSE -> OBSERVATION -> PASS/FAIL -> EVIDENCE */}
      <WorkflowPipeline status={data.status} currentStep={pipelineStep} />

      {/* Main Workspace Container */}
      <main className="flex-1 p-3 sm:p-4 lg:p-5 flex flex-col gap-4 max-w-[1800px] w-full mx-auto">
        {/* Top Mission Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0A0D15] border border-border/40 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 uppercase tracking-widest text-[9.5px]">
              EVAL CONSOLE:
            </span>
            <span className="text-zinc-200 font-semibold font-sans">
              {data.config.targetAgent.name}
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span className="text-zinc-400 hidden sm:inline">
              Mode: <span className="text-cyan-400 capitalize">{data.config.testMode.replace(/_/g, " ")}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {data.failures.length > 0 && (
              <button
                onClick={handleJumpFailure}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors"
              >
                <AlertOctagon size={11} className="text-red-400" />
                <span className="font-bold">{data.failures.length} Vulnerabilities Detected</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Adversarial Testing Engine Active</span>
            </div>
          </div>
        </div>

        {/* Core 3-Column Technical Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_310px] xl:grid-cols-[320px_1fr_340px] gap-4 items-start">
          {/* ======================================================== */}
          {/* LEFT COLUMN: Target Agent & Test Configuration           */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-4">
            {/* Target Agent Panel */}
            <AgentConfig
              currentAgent={data.config.targetAgent}
              onAgentChange={handleAgentChange}
              disabled={data.status === "testing"}
            />

            {/* Test Configuration Panel */}
            <TestConfiguration
              config={data.config}
              status={data.status}
              speed={simSpeed}
              onSpeedChange={setSimSpeed}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onReset={handleReset}
              onConfigChange={handleConfigChange}
            />
          </div>

          {/* ======================================================== */}
          {/* CENTER COLUMN: Progress, Live Session & Test Matrix      */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Mission Progress Bar */}
            <TestProgressBar
              progress={data.progress}
              isTesting={data.status === "testing"}
            />

            {/* Quick Testing Controls */}
            <TestControls
              status={data.status}
              onStart={handleStart}
              onPause={handlePause}
              onStepNext={handleStepNext}
              onReset={handleReset}
              onJumpFailure={handleJumpFailure}
              hasFailures={data.failures.length > 0}
            />

            {/* Live Test Session Conversation & Tool Interceptor */}
            <LiveConversation
              activeTest={activeTest}
              onViewEvidence={(testId) => {
                const f = data.failures.find((fail) => fail.testId === testId);
                if (f) setSelectedFailure(f);
              }}
              onReplayTest={(test) => {
                const f = data.failures.find((fail) => fail.testId === test.id);
                if (f) {
                  setSelectedFailure(f);
                } else {
                  // Replay non-failure test
                  setActiveTestId(test.id);
                }
              }}
            />

            {/* Test Suite Matrix / Inspector List */}
            <div className="rounded-lg border border-border/60 bg-[#0B0F17] p-3.5 flex flex-col gap-2.5 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2">
                <div className="flex items-center gap-2">
                  <Layers size={13} className="text-cyan-400" />
                  <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-zinc-300">
                    Test Suite Matrix ({data.tests.length})
                  </span>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-border/40 text-[10px] font-mono">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "failed", label: `Fail (${data.progress.failed})` },
                      { id: "passed", label: `Pass (${data.progress.passed})` },
                      { id: "pending", label: "Queued" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTestFilter(f.id)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        testFilter === f.id
                          ? "bg-zinc-800 text-cyan-300 font-semibold"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search test..."
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    className="pl-5 pr-2 py-0.5 rounded bg-zinc-900 border border-border/40 text-[10.5px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/40 w-28"
                  />
                </div>
              </div>

              {/* Grid of Tests */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {visibleTests.map((test) => (
                  <div
                    key={test.id}
                    onClick={() => setActiveTestId(test.id)}
                  >
                    <TestResult
                      test={test}
                      isActive={test.id === activeTestId}
                    />
                  </div>
                ))}
              </div>

              {filteredTests.length > 8 && (
                <button
                  onClick={() => setShowAllTests((v) => !v)}
                  className="flex items-center justify-center gap-1 pt-1 text-[10.5px] font-mono text-zinc-500 hover:text-cyan-400 transition-colors w-full"
                >
                  {showAllTests ? (
                    <>
                      <ChevronUp size={12} />
                      <span>Collapse Test Suite</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      <span>View All {filteredTests.length} Test Cases</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* RIGHT COLUMN: Results Summary & Discovered Failures      */}
          {/* ======================================================== */}
          <div className="flex flex-col gap-4">
            {/* High-Signal Metrics Card */}
            <div className="rounded-lg border border-border/60 bg-[#0B0F17] p-3.5 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between pb-1 border-b border-border/30">
                <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-zinc-300">
                  Adversarial Summary
                </span>
                <span className="text-[9.5px] font-mono text-zinc-500">
                  {data.progress.completed}/{data.progress.total} Evaluated
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-zinc-900/60 border border-border/40 flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase font-mono text-zinc-400">
                    Resisted (Pass)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {data.progress.passed}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-red-950/20 border border-red-500/30 flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase font-mono text-red-300">
                    Breached (Fail)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <XCircle size={15} className="text-red-400" />
                    <span className="text-xl font-bold font-mono text-red-400">
                      {data.progress.failed}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-zinc-950 text-xs font-mono border border-border/40">
                <span className="text-zinc-400">Pass Security Rate:</span>
                <span className="text-cyan-400 font-bold">
                  {data.progress.completed > 0
                    ? Math.round((data.progress.passed / data.progress.completed) * 100)
                    : 100}
                  %
                </span>
              </div>
            </div>

            {/* Discovered Failures Section */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertOctagon size={13} className="text-red-400" />
                  <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-zinc-300">
                    Discovered Failures
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-800/60 font-bold">
                  {data.failures.length} FLAGGED
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {data.failures.length === 0 ? (
                  <div className="rounded-lg border border-border/50 bg-[#0B0F17] p-6 flex flex-col items-center justify-center text-center gap-1.5">
                    <ShieldCheck size={24} className="text-emerald-400 opacity-60 mb-1" />
                    <span className="text-xs font-mono font-semibold text-zinc-300">
                      No Failures Detected Yet
                    </span>
                    <p className="text-[11px] text-zinc-500">
                      The target agent has resisted all executed adversarial probes so far.
                    </p>
                  </div>
                ) : (
                  data.failures.map((failure) => (
                    <FailureCard
                      key={failure.id}
                      failure={failure}
                      onViewEvidence={(f) => setSelectedFailure(f)}
                      onReplay={(f) => {
                        setSelectedFailure(f);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* BOTTOM SECTION: Full-Width Real-Time Observability Logs */}
        {/* ======================================================== */}
        <div className="w-full">
          <ObservabilityLogs
            logs={data.logs}
            onSelectTest={(testId) => setActiveTestId(testId)}
          />
        </div>
      </main>

      {/* Failure Evidence Modal */}
      <FailureDetails
        failure={selectedFailure}
        onClose={() => setSelectedFailure(null)}
      />
    </DashboardLayout>
  );
}
