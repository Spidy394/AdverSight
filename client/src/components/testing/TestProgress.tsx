import { type TestProgress } from "@/types/testing";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface TestProgressProps {
  progress: TestProgress;
}

export function TestProgressBar({ progress }: TestProgressProps) {
  const pct = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2
            size={12}
            strokeWidth={1.5}
            className="text-[var(--adv-running)] animate-spin"
          />
          <span className="text-[11px] text-muted-foreground uppercase tracking-widest">
            Progress
          </span>
        </div>
        <span className="adv-mono text-[11px] text-muted-foreground">
          {progress.completed}{" "}
          <span className="text-[var(--adv-border-visible)]">/</span>{" "}
          {progress.total} tests
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full rounded-full bg-[var(--adv-surface)] overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--adv-cyan)] transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        {/* Scan shimmer */}
        <div
          className="absolute top-0 h-full w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{
            left: `calc(${pct}% - 16px)`,
            transition: "left 700ms ease-out",
          }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2
              size={13}
              strokeWidth={1.5}
              className="text-[var(--adv-pass)]"
            />
            <span className="adv-mono text-sm font-semibold text-[var(--adv-pass)]">
              {progress.passed}
            </span>
            <span className="text-[10px] text-muted-foreground">passed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle
              size={13}
              strokeWidth={1.5}
              className="text-[var(--adv-fail)]"
            />
            <span className="adv-mono text-sm font-semibold text-[var(--adv-fail)]">
              {progress.failed}
            </span>
            <span className="text-[10px] text-muted-foreground">failed</span>
          </div>
        </div>
        <span className="adv-mono text-[11px] text-muted-foreground">
          {pct}%
        </span>
      </div>
    </div>
  );
}
