import { type DashboardStatus } from "@/types/testing";
import { cn } from "@/lib/utils";
import { ShieldAlert, Radio, RotateCcw, Download, Cpu } from "lucide-react";

interface HeaderProps {
  status: DashboardStatus;
  targetName: string;
  sessionId?: string;
  onReset?: () => void;
  onExportReport?: () => void;
}

const statusConfig: Record<
  DashboardStatus,
  { label: string; dotClass: string; labelClass: string; borderClass: string }
> = {
  idle: {
    label: "IDLE",
    dotClass: "bg-zinc-500",
    labelClass: "text-zinc-400",
    borderClass: "border-zinc-800 bg-zinc-900/60",
  },
  testing: {
    label: "TESTING ACTIVE",
    dotClass: "bg-amber-400 animate-ping",
    labelClass: "text-amber-300",
    borderClass: "border-amber-500/40 bg-amber-950/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  },
  completed: {
    label: "COMPLETED",
    dotClass: "bg-emerald-400",
    labelClass: "text-emerald-300",
    borderClass: "border-emerald-500/40 bg-emerald-950/20",
  },
};

export function Header({
  status,
  targetName,
  sessionId = "session_hackspire_2026_001",
  onReset,
  onExportReport,
}: HeaderProps) {
  const s = statusConfig[status];

  return (
    <header className="border-b border-border/50 bg-[#0B0F19] px-4 lg:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
      {/* Left — Brand & Positioning */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
          <ShieldAlert size={18} strokeWidth={2} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-zinc-100 flex items-center gap-1.5">
              AdverSight
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                v1.0-RC
              </span>
            </h1>
          </div>
          <p className="text-[10.5px] text-zinc-400 tracking-wide font-normal">
            Autonomous Adversarial Testing for AI Agents
          </p>
        </div>
      </div>

      {/* Center — Target & Session Telemetry */}
      <div className="hidden lg:flex items-center gap-2">
        {/* Session ID */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900/80 border border-border/50 text-[10.5px] font-mono text-zinc-400">
          <Cpu size={11} className="text-zinc-500" />
          <span className="text-zinc-500">SESSION:</span>
          <span className="text-zinc-200">{sessionId}</span>
        </div>

        {/* Target Agent quick indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900/80 border border-border/50 text-[10.5px] font-mono">
          <Radio size={11} className="text-emerald-400 animate-pulse" />
          <span className="text-zinc-500">TARGET:</span>
          <span className="text-zinc-200 font-sans font-medium">{targetName}</span>
          <span className="text-[9px] text-emerald-400 px-1 rounded bg-emerald-500/10 border border-emerald-500/20">
            HTTP 200
          </span>
        </div>
      </div>

      {/* Right — Actions & Testing Status */}
      <div className="flex items-center gap-3">
        {/* Quick Actions */}
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-border/40 transition-colors"
            title="Reset testing state"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
          <button
            onClick={onExportReport}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-cyan-300 hover:bg-cyan-950/20 border border-border/40 transition-colors"
            title="Export audit evidence JSON"
          >
            <Download size={11} />
            <span className="hidden md:inline">Export Audit</span>
          </button>
        </div>

        {/* Status Pill */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px] font-mono font-semibold tracking-wider transition-all duration-300",
            s.borderClass
          )}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                s.dotClass
              )}
            />
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                status === "testing" ? "bg-amber-400" : status === "completed" ? "bg-emerald-400" : "bg-zinc-500"
              )}
            />
          </span>
          <span className={s.labelClass}>{s.label}</span>
        </div>
      </div>
    </header>
  );
}
