import { type Failure, type Severity } from "@/types/testing";
import { cn } from "@/lib/utils";
import { ArrowUpRight, RotateCcw, Wrench } from "lucide-react";

interface FailureCardProps {
  failure: Failure;
  onViewEvidence: (failure: Failure) => void;
  onReplay?: (failure: Failure) => void;
}

const severityConfig: Record<
  Severity,
  { label: string; badgeClass: string }
> = {
  critical: {
    label: "CRITICAL",
    badgeClass: "text-[#9a5141] bg-[#fcf1ed] border-[#f0c9c0]",
  },
  high: {
    label: "HIGH",
    badgeClass: "text-[#a45e4e] bg-[#fdf3f0] border-[#f4d7ce]",
  },
  medium: {
    label: "MEDIUM",
    badgeClass: "text-[#94601b] bg-[#fff8eb] border-[#fae2c0]",
  },
  low: {
    label: "LOW",
    badgeClass: "text-[#55635c] bg-[#f2f5f3] border-[#dfe5df]",
  },
};

export function FailureCard({
  failure,
  onViewEvidence,
  onReplay,
}: FailureCardProps) {
  const sev = severityConfig[failure.severity] ?? severityConfig.medium;

  return (
    <div className="rounded-lg border border-[#dfe5df] bg-white p-3.5 flex flex-col gap-2 font-sans transition-all hover:border-[#cfdad1]">
      {/* Top row: Severity + Title + Probe */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className={cn(
              "text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider",
              sev.badgeClass
            )}
          >
            {sev.label}
          </span>
          <h4 className="text-xs font-semibold text-[#202a2a] truncate">
            {failure.type}
          </h4>
        </div>
        <span className="font-mono text-[10px] text-[#788780] tabular-nums shrink-0">
          Probe #{String(failure.testNumber).padStart(2, "0")}
        </span>
      </div>

      <p className="text-xs text-[#5f6e66] leading-relaxed line-clamp-2">
        {failure.description}
      </p>

      {/* Metadata & Actions row */}
      <div className="flex items-center justify-between pt-1 border-t border-[#f0f4f1] text-[10.5px] font-mono">
        <div className="flex items-center gap-2 text-[#718078] truncate">
          <span>{failure.detectorName ?? "InvariantDetector"}</span>
          {failure.toolCalls && failure.toolCalls.length > 0 && (
            <span className="flex items-center gap-1 text-[#94601b] truncate">
              <Wrench size={10} />
              {failure.toolCalls[0].name}()
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onReplay?.(failure)}
            className="flex items-center gap-1 text-[#4f5d56] hover:text-[#202a2a] px-2 py-0.5 rounded border border-[#dfe5df] bg-[#f8faf8] hover:bg-white transition-colors"
            title="Replay test"
          >
            <RotateCcw size={10} />
            <span>Replay</span>
          </button>
          <button
            onClick={() => onViewEvidence(failure)}
            className="flex items-center gap-1 font-semibold text-[#2c674f] hover:underline"
          >
            <span>Evidence</span>
            <ArrowUpRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
