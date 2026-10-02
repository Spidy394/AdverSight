import { type Failure, type Severity } from "@/types/testing";
import { cn } from "@/lib/utils";
import { AlertOctagon, ChevronRight, RotateCcw, Wrench } from "lucide-react";

interface FailureCardProps {
  failure: Failure;
  onViewEvidence: (failure: Failure) => void;
  onReplay?: (failure: Failure) => void;
}

const severityConfig: Record<Severity, { label: string; class: string; dot: string }> = {
  critical: {
    label: "CRITICAL",
    class: "text-red-300 bg-red-950/80 border-red-700/60 shadow-[0_0_10px_rgba(239,68,68,0.25)]",
    dot: "bg-red-400 animate-ping",
  },
  high: {
    label: "HIGH",
    class: "text-red-400 bg-red-950/50 border-red-800/40",
    dot: "bg-red-500",
  },
  medium: {
    label: "MEDIUM",
    class: "text-amber-400 bg-amber-950/40 border-amber-800/40",
    dot: "bg-amber-400",
  },
  low: {
    label: "LOW",
    class: "text-zinc-400 bg-zinc-900 border-zinc-700",
    dot: "bg-zinc-500",
  },
};

export function FailureCard({ failure, onViewEvidence, onReplay }: FailureCardProps) {
  const sev = severityConfig[failure.severity];

  return (
    <div className="rounded-lg border border-red-900/30 bg-[#0E1017] p-3 flex flex-col gap-2.5 transition-all hover:border-red-700/50 hover:bg-[#11141F] shadow-sm relative overflow-hidden group">
      {/* Red vertical hazard line */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/80 group-hover:bg-red-400 transition-colors" />

      {/* Header: Title and Severity */}
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertOctagon size={13} className="text-red-400 shrink-0 mt-0.5" />
          <h4 className="text-xs font-mono font-bold text-red-200 uppercase tracking-tight truncate">
            {failure.type}
          </h4>
        </div>
        <span
          className={cn(
            "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-wider flex items-center gap-1",
            sev.class
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full inline-block", sev.dot)} />
          {sev.label}
        </span>
      </div>

      {/* Vulnerability Description */}
      <p className="text-[11px] text-zinc-300 leading-relaxed font-sans line-clamp-2 pl-1.5">
        {failure.description}
      </p>

      {/* Telemetry metadata: Test ID, timestamp, tool involved */}
      <div className="flex flex-wrap items-center gap-2 pl-1.5 text-[10px] font-mono text-zinc-500 border-t border-white/5 pt-1.5">
        <span className="text-zinc-300 font-semibold">
          Test #{String(failure.testNumber).padStart(2, "0")}
        </span>
        <span>•</span>
        <span>{failure.timestamp}</span>
        {failure.toolCalls && failure.toolCalls.length > 0 && (
          <>
            <span>•</span>
            <span className="text-amber-400 flex items-center gap-0.5 truncate">
              <Wrench size={9} />
              {failure.toolCalls[0].name}()
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pl-1.5 pt-1">
        <button
          onClick={() => onViewEvidence(failure)}
          className="flex items-center gap-1 text-[11px] font-mono font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <span>View Evidence</span>
          <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          onClick={() => onReplay?.(failure)}
          className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded bg-zinc-900/60 hover:bg-zinc-800 border border-border/40 transition-colors"
          title="Replay test execution"
        >
          <RotateCcw size={10} />
          <span>Replay</span>
        </button>
      </div>
    </div>
  );
}
