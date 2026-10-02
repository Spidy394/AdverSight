import { type DashboardStatus } from "@/types/testing";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

interface HeaderProps {
  status: DashboardStatus;
  targetName: string;
}

const statusConfig: Record<
  DashboardStatus,
  { label: string; dotClass: string; labelClass: string }
> = {
  idle: {
    label: "IDLE",
    dotClass: "bg-[var(--adv-pending)]",
    labelClass: "text-[var(--adv-pending)]",
  },
  testing: {
    label: "TESTING",
    dotClass: "bg-[var(--adv-running)] adv-pulse",
    labelClass: "text-[var(--adv-running)]",
  },
  completed: {
    label: "COMPLETED",
    dotClass: "bg-[var(--adv-pass)]",
    labelClass: "text-[var(--adv-pass)]",
  },
};

export function Header({ status, targetName }: HeaderProps) {
  const s = statusConfig[status];

  return (
    <header className="border-b border-[var(--adv-border)] bg-[var(--adv-panel)] px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      {/* Left — brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--adv-cyan-bg)] border border-[var(--adv-cyan)]/20">
          <ShieldAlert
            size={17}
            strokeWidth={1.5}
            className="text-[var(--adv-cyan)]"
          />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight leading-none text-foreground">
            AdverSight
          </h1>
          <p className="text-[10px] text-muted-foreground tracking-wide leading-tight mt-0.5">
            Autonomous Adversarial Testing
          </p>
        </div>
      </div>

      {/* Center — target */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--adv-surface)] border border-[var(--adv-border)]">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Target
        </span>
        <span className="text-xs font-medium text-foreground">{targetName}</span>
      </div>

      {/* Right — session status */}
      <div className="flex items-center gap-2">
        <div
          className={cn("w-2 h-2 rounded-full", s.dotClass)}
        />
        <span
          className={cn(
            "text-[11px] font-semibold tracking-widest adv-mono",
            s.labelClass
          )}
        >
          {s.label}
        </span>
      </div>
    </header>
  );
}
