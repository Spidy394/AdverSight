import { type TestCase, type TestStatus } from "@/types/testing";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

interface TestResultProps {
  test: TestCase;
  isActive?: boolean;
}

const statusIcon: Record<TestStatus, React.ReactNode> = {
  passed: <CheckCircle2 size={12} strokeWidth={1.5} />,
  failed: <XCircle size={12} strokeWidth={1.5} />,
  running: <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />,
  pending: <Clock size={12} strokeWidth={1.5} />,
};

const statusClass: Record<TestStatus, string> = {
  passed: "text-[var(--adv-pass)]",
  failed: "text-[var(--adv-fail)]",
  running: "text-[var(--adv-running)]",
  pending: "text-[var(--adv-pending)]",
};

const STRATEGY_SHORT: Record<string, string> = {
  goal_hijacking: "Goal Hijack",
  identity_confusion: "Identity",
  policy_violation: "Policy",
  unauthorized_action: "Unauth",
  context_manipulation: "Context",
  tool_misuse: "Tool",
  information_extraction: "Info Exfil",
};

export function TestResult({ test, isActive }: TestResultProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-[11px] transition-all duration-200",
        isActive
          ? "border-[var(--adv-cyan)]/30 bg-[var(--adv-cyan-bg)]"
          : test.status === "failed"
          ? "border-[var(--adv-fail-border,var(--adv-border))] bg-[var(--adv-fail-bg,var(--adv-surface))]"
          : "border-[var(--adv-border)] bg-[var(--adv-surface)]"
      )}
    >
      {/* Number */}
      <span className="adv-mono text-muted-foreground w-6 shrink-0">
        #{String(test.testNumber).padStart(2, "0")}
      </span>

      {/* Strategy */}
      <span className="text-muted-foreground truncate flex-1">
        {STRATEGY_SHORT[test.strategy] ?? test.strategy}
      </span>

      {/* Status icon */}
      <span className={cn("shrink-0", statusClass[test.status])}>
        {statusIcon[test.status]}
      </span>
    </div>
  );
}
