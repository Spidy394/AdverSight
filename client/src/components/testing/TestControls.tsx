import { Play, Pause, SkipForward, RotateCcw, AlertTriangle, ShieldCheck } from "lucide-react";
import { type DashboardStatus } from "@/types/testing";

interface TestControlsProps {
  status: DashboardStatus;
  onStart: () => void;
  onPause: () => void;
  onStepNext?: () => void;
  onReset: () => void;
  onJumpFailure?: () => void;
  hasFailures: boolean;
}

export function TestControls({
  status,
  onStart,
  onPause,
  onStepNext,
  onReset,
  onJumpFailure,
  hasFailures,
}: TestControlsProps) {
  const isRunning = status === "testing";

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/40 bg-[#0B0F17] text-xs font-mono">
      <div className="flex items-center gap-1.5">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
          >
            <Play size={11} />
            <span>{status === "completed" ? "Rerun" : "Run All"}</span>
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
          >
            <Pause size={11} />
            <span>Pause</span>
          </button>
        )}

        <button
          onClick={onStepNext}
          disabled={isRunning}
          title="Step execute one single test probe"
          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 text-zinc-300 border border-border/40 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          <SkipForward size={11} />
          <span className="hidden sm:inline">Step</span>
        </button>

        <button
          onClick={onReset}
          title="Reset test session to beginning"
          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 text-zinc-400 border border-border/40 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {hasFailures && (
          <button
            onClick={onJumpFailure}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-950/60 border border-red-800/40 text-red-300 text-[10px] hover:bg-red-900/60 transition-colors"
          >
            <AlertTriangle size={10} />
            <span>Focus Failure</span>
          </button>
        )}
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          <ShieldCheck size={11} className="text-cyan-400" />
          <span className="hidden md:inline">Continuous Telemetry</span>
        </div>
      </div>
    </div>
  );
}
