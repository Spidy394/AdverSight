import { type TestCase, type TestStatus } from "@/types/testing";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

interface TestResultProps {
  test: TestCase;
  isActive?: boolean;
}

const statusIcon: Record<TestStatus, React.ReactNode> = {
  passed: <CheckCircle2 size={12} className="text-emerald-400" />,
  failed: <XCircle size={12} className="text-red-400" />,
  running: <Loader2 size={12} className="text-amber-400 animate-spin" />,
  pending: <Clock size={12} className="text-zinc-600" />,
};

const STRATEGY_SHORT: Record<string, string> = {
  goal_hijacking: "Goal Hijack",
  identity_confusion: "Identity Confusion",
  policy_violation: "Policy Violation",
  unauthorized_action: "Unauthorized Action",
  context_manipulation: "Context Injection",
  tool_misuse: "Tool Misuse",
  information_extraction: "Info Extraction",
};

export function TestResult({ test, isActive }: TestResultProps) {
  const isFailed = test.status === "failed";
  const isRunning = test.status === "running";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-[11px] font-mono transition-all select-none cursor-pointer",
        isActive
          ? "border-cyan-500/60 bg-cyan-950/20 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.15)]"
          : isFailed
          ? "border-red-900/40 bg-red-950/10 text-red-200 hover:border-red-800/60 hover:bg-red-950/20"
          : isRunning
          ? "border-amber-500/40 bg-amber-950/10 text-amber-200"
          : "border-border/30 bg-zinc-900/40 text-zinc-400 hover:border-border/60 hover:text-zinc-200"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "font-bold shrink-0",
            isActive ? "text-cyan-400" : isFailed ? "text-red-400" : "text-zinc-500"
          )}
        >
          #{String(test.testNumber).padStart(2, "0")}
        </span>
        <span className="truncate text-zinc-300 text-[10.5px]">
          {STRATEGY_SHORT[test.strategy] ?? test.strategy}
        </span>
      </div>

      <div className="shrink-0 flex items-center gap-1.5">
        {test.failureType && (
          <span className="text-[9px] font-mono text-red-400 px-1 py-0.2 rounded bg-red-950 border border-red-900/50 hidden xl:inline">
            FAIL
          </span>
        )}
        {statusIcon[test.status]}
      </div>
    </div>
  );
}
