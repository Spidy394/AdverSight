import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

// Data
import { mockDashboardData } from "@/data/mockData";

// Types
import type { DashboardData, DashboardStatus, Failure, TestCase } from "@/types/testing";

// Components
import { Header } from "@/components/layout/Header";
import { AgentConfig } from "@/components/agent/AgentConfig";
import { TestProgressBar } from "@/components/testing/TestProgress";
import { LiveConversation } from "@/components/conversation/LiveConversation";
import { TestResult } from "@/components/results/TestResult";
import { FailureCard } from "@/components/results/FailureCard";
import { FailureDetails } from "@/components/results/FailureDetails";
import { ObservabilityLogs } from "@/components/logs/ObservabilityLogs";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(mockDashboardData);
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | undefined>(
    data.activeTestId
  );
  const [showAllTests, setShowAllTests] = useState(false);

  // Find the currently active / most recent test to show in live panel
  const activeTest = useMemo<TestCase | null>(() => {
    if (!activeTestId) {
      // Fall back to latest non-pending test
      return (
        [...data.tests]
          .reverse()
          .find((t) => t.status !== "pending") ?? null
      );
    }
    return data.tests.find((t) => t.id === activeTestId) ?? null;
  }, [data.tests, activeTestId]);

  const visibleTests = showAllTests ? data.tests : data.tests.slice(0, 8);

  const handleStart = () => {
    if (data.status === "testing") return;
    setData((prev) => ({ ...prev, status: "testing" }));
  };

  return (
    <div className="dark min-h-screen bg-background flex flex-col">
      {/* Sticky header */}
      <Header
        status={data.status}
        targetName={data.config.targetAgent.name}
      />

      {/* Main content */}
      <main className="flex-1 p-4 lg:p-5 flex flex-col gap-4">

        {/* Three-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 items-start">

          {/* ── LEFT: Config ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <AgentConfig
              config={data.config}
              onStart={handleStart}
              isRunning={data.status === "testing"}
            />
          </div>

          {/* ── CENTER: Live Session ──────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Progress bar */}
            <TestProgressBar progress={data.progress} />

            {/* Test list (compact) */}
            <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Tests
                </span>
                <div className="flex items-center gap-3 adv-mono text-[10px]">
                  <span className="flex items-center gap-1 text-[var(--adv-pass)]">
                    <CheckCircle2 size={10} strokeWidth={1.5} />
                    {data.progress.passed}
                  </span>
                  <span className="flex items-center gap-1 text-[var(--adv-fail)]">
                    <XCircle size={10} strokeWidth={1.5} />
                    {data.progress.failed}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock size={10} strokeWidth={1.5} />
                    {data.progress.total - data.progress.completed}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-1.5">
                {visibleTests.map((test) => (
                  <div
                    key={test.id}
                    onClick={() => setActiveTestId(test.id)}
                    className="cursor-pointer"
                  >
                    <TestResult
                      test={test}
                      isActive={test.id === activeTestId}
                    />
                  </div>
                ))}
              </div>
              {data.tests.length > 8 && (
                <button
                  onClick={() => setShowAllTests((v) => !v)}
                  className="flex items-center justify-center gap-1 pt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-150 w-full"
                >
                  {showAllTests ? (
                    <>
                      <ChevronUp size={11} strokeWidth={1.5} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={11} strokeWidth={1.5} />
                      {data.tests.length - 8} more
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Live conversation */}
            <LiveConversation activeTest={activeTest} />
          </div>

          {/* ── RIGHT: Results ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Summary stats */}
            <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-4 flex flex-col gap-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Session Results
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 rounded-md bg-[var(--adv-surface)] border border-[var(--adv-border)] px-3 py-2.5">
                  <span className="adv-mono text-2xl font-bold text-[var(--adv-pass)]">
                    {data.progress.passed}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Passed</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-md bg-[color-mix(in_oklch,var(--adv-fail)_8%,var(--adv-surface))] border border-[color-mix(in_oklch,var(--adv-fail)_20%,transparent)] px-3 py-2.5">
                  <span className="adv-mono text-2xl font-bold text-[var(--adv-fail)]">
                    {data.progress.failed}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Failed</span>
                </div>
              </div>
              {data.progress.running > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--adv-running)]">
                  <Loader2 size={10} strokeWidth={1.5} className="animate-spin" />
                  {data.progress.running} test running
                </div>
              )}
            </div>

            {/* Discovered Failures */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Discovered Failures
                </span>
                {data.failures.length > 0 && (
                  <span className="adv-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--adv-fail-border,oklch(0.65_0.22_25_/_25%))] bg-[var(--adv-fail-bg,oklch(0.65_0.22_25_/_8%))] text-[var(--adv-fail)]">
                    {data.failures.length}
                  </span>
                )}
              </div>

              <AnimatePresence>
                {data.failures.length === 0 ? (
                  <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-6 flex flex-col items-center gap-2">
                    <CheckCircle2 size={24} strokeWidth={1} className="text-[var(--adv-pass)] opacity-40" />
                    <p className="text-xs text-muted-foreground text-center">
                      No failures detected yet
                    </p>
                  </div>
                ) : (
                  data.failures.map((failure, i) => (
                    <FailureCard
                      key={failure.id}
                      failure={failure}
                      index={i}
                      onViewEvidence={setSelectedFailure}
                    />
                  ))
                )}
              </AnimatePresence>
            </section>
          </div>
        </div>

        {/* ── BOTTOM: Observability Log (full-width) ─────────────────────── */}
        <ObservabilityLogs logs={data.logs} />
      </main>

      {/* Failure evidence modal */}
      <FailureDetails
        failure={selectedFailure}
        onClose={() => setSelectedFailure(null)}
      />
    </div>
  );
}
