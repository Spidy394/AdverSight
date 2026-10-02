import { type TestProgress } from "@/types/testing";
import { CheckCircle2, XCircle, Loader2, Clock, Percent } from "lucide-react";

interface TestProgressProps {
  progress: TestProgress;
  isTesting?: boolean;
}

export function TestProgressBar({ progress, isTesting }: TestProgressProps) {
  const { total, completed, passed, failed, running } = progress;
  const pending = Math.max(0, total - completed - running);

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 100;

  const passedPct = total > 0 ? (passed / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;
  const runningPct = total > 0 ? (running / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-border/60 bg-[#0B0F17] p-3.5 flex flex-col gap-3 shadow-md">
      {/* Header telemetry row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isTesting || running > 0 ? (
            <Loader2 size={13} className="text-amber-400 animate-spin" />
          ) : (
            <Clock size={13} className="text-cyan-400" />
          )}
          <span className="text-[10px] uppercase font-mono font-semibold tracking-widest text-zinc-300">
            Adversarial Test Suite Progress
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-zinc-200 font-bold">{completed}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{total} tests</span>
          <span className="text-cyan-400 font-semibold bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
            {pct}%
          </span>
        </div>
      </div>

      {/* Segmented High-Density Multi-Status Progress Bar */}
      <div className="relative h-2.5 w-full rounded bg-zinc-900 border border-zinc-800 overflow-hidden flex">
        {/* Passed Segment */}
        <div
          style={{ width: `${passedPct}%` }}
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          title={`Passed: ${passed}`}
        />
        {/* Failed Segment */}
        <div
          style={{ width: `${failedPct}%` }}
          className="h-full bg-red-500 transition-all duration-500 ease-out"
          title={`Failed: ${failed}`}
        />
        {/* Running Segment (animated striped pulse) */}
        {running > 0 && (
          <div
            style={{ width: `${runningPct}%` }}
            className="h-full bg-amber-400 animate-pulse transition-all duration-500 ease-out"
            title={`Running: ${running}`}
          />
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        {/* Passed */}
        <div className="flex items-center gap-2 p-1.5 rounded bg-emerald-950/20 border border-emerald-500/20">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400/80">
              Passed
            </span>
            <span className="text-xs font-bold text-emerald-300">
              {passed}
            </span>
          </div>
        </div>

        {/* Failed */}
        <div className="flex items-center gap-2 p-1.5 rounded bg-red-950/20 border border-red-500/20">
          <XCircle size={13} className="text-red-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] uppercase tracking-wider text-red-400/80">
              Failed
            </span>
            <span className="text-xs font-bold text-red-300">
              {failed}
            </span>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="flex items-center gap-2 p-1.5 rounded bg-cyan-950/20 border border-cyan-500/20">
          <Percent size={13} className="text-cyan-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] uppercase tracking-wider text-cyan-400/80">
              Pass Rate
            </span>
            <span className="text-xs font-bold text-cyan-300">
              {passRate}%
            </span>
          </div>
        </div>

        {/* Pending */}
        <div className="flex items-center gap-2 p-1.5 rounded bg-zinc-900/40 border border-border/40">
          <Clock size={13} className="text-zinc-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              Pending
            </span>
            <span className="text-xs font-bold text-zinc-300">
              {pending}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
