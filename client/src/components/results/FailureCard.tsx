import { type Failure, type Severity } from "@/types/testing";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { XCircle, ChevronRight, RotateCcw } from "lucide-react";

interface FailureCardProps {
  failure: Failure;
  onViewEvidence: (failure: Failure) => void;
  index?: number;
}

const severityConfig: Record<Severity, { label: string; class: string }> = {
  critical: {
    label: "CRITICAL",
    class: "text-[var(--adv-fail)] bg-[var(--adv-fail-bg)] border-[var(--adv-fail-border)]",
  },
  high: {
    label: "HIGH",
    class: "text-[var(--adv-fail)] bg-[var(--adv-fail-bg)] border-[var(--adv-fail-border)]",
  },
  medium: {
    label: "MEDIUM",
    class: "text-[var(--adv-running)] bg-[color-mix(in_oklch,var(--adv-running)_10%,transparent)] border-[color-mix(in_oklch,var(--adv-running)_25%,transparent)]",
  },
  low: {
    label: "LOW",
    class: "text-[var(--adv-pending)] bg-[var(--adv-surface)] border-[var(--adv-border)]",
  },
};

export function FailureCard({ failure, onViewEvidence, index = 0 }: FailureCardProps) {
  const sev = severityConfig[failure.severity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="rounded-lg border border-[var(--adv-fail-border,oklch(0.65_0.22_25_/_20%))] bg-[var(--adv-panel)] overflow-hidden"
    >
      {/* Red left-edge accent */}
      <div className="flex">
        <div className="w-0.5 bg-[var(--adv-fail)] shrink-0 rounded-l-lg" />
        <div className="flex flex-col gap-2.5 p-3 flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <XCircle
                size={13}
                strokeWidth={1.5}
                className="text-[var(--adv-fail)] shrink-0"
              />
              <span className="text-xs font-semibold text-[var(--adv-fail)] truncate">
                {failure.type}
              </span>
            </div>
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0",
                sev.class
              )}
            >
              {sev.label}
            </span>
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
            {failure.description}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3">
            <span className="adv-mono text-[10px] text-muted-foreground">
              Test #{String(failure.testNumber).padStart(2, "0")}
            </span>
            <span className="text-[var(--adv-border)] text-[10px]">·</span>
            <span className="adv-mono text-[10px] text-muted-foreground">
              {failure.timestamp}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              id={`view-evidence-${failure.id}`}
              onClick={() => onViewEvidence(failure)}
              className="flex items-center gap-1 text-[11px] text-[var(--adv-cyan)] hover:opacity-80 transition-opacity duration-150 group"
            >
              View Evidence
              <ChevronRight
                size={11}
                strokeWidth={1.5}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </button>
            <span className="text-[var(--adv-border)] text-[10px]">·</span>
            <button
              id={`replay-${failure.id}`}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-150"
              title="Replay functionality coming from test engine."
            >
              <RotateCcw size={10} strokeWidth={1.5} />
              Replay
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
