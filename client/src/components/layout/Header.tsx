import { type DashboardStatus } from "@/types/testing";
import { type DemoModeSpeed } from "@/lib/presentationScheduler";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  RotateCcw,
  Play,
  Square,
  Sparkles,
  Zap,
} from "lucide-react";

interface HeaderProps {
  status: DashboardStatus;
  targetName: string;
  sessionId?: string;
  currentTestNumber?: number;
  totalTests?: number;
  demoSpeed: DemoModeSpeed;
  onDemoSpeedChange: (speed: DemoModeSpeed) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onExportReport: () => void;
  canStart: boolean;
}

export function Header({
  status,
  targetName,
  currentTestNumber,
  totalTests = 20,
  demoSpeed,
  onDemoSpeedChange,
  onStart,
  onPause,
  onReset,
  canStart,
}: HeaderProps) {
  const isRunning = status === "testing";

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-[#dfe5df]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-13 flex items-center justify-between">
        {/* Left: Brand + Target */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus-visible:outline-none"
          >
            <div className="flex size-7 items-center justify-center overflow-hidden rounded bg-[#e7efeb] border border-[#d2dfd8]">
              <img
                src="/logo.png"
                alt="AdverSight"
                className="size-8 object-contain"
              />
            </div>
            <span className="text-sm font-bold text-[#202a2a] tracking-tight group-hover:text-[#2c674f] transition-colors">
              AdverSight
            </span>
          </Link>

          <div className="h-3 w-px bg-[#dfe5df] hidden sm:block" />

          <span className="hidden sm:inline-block font-mono text-[11px] text-[#65736d] truncate max-w-[200px]">
            {targetName}
          </span>
        </div>

        {/* Center: Status indicator */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4e5] border border-[#fbd8b3] px-2.5 py-0.5 text-xs font-mono text-[#94601b]">
              <span className="size-1.5 rounded-full bg-[#c7872d] animate-pulse" />
              <span>Probe {currentTestNumber ? String(currentTestNumber).padStart(2, "0") : "01"}/{totalTests}</span>
            </span>
          ) : status === "completed" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f4ec] border border-[#c4decb] px-2.5 py-0.5 text-xs font-mono text-[#2c674f]">
              <span className="size-1.5 rounded-full bg-[#3e8658]" />
              <span>Completed</span>
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-[#f3f5f3] border border-[#e1e6e2] px-2.5 py-0.5 text-xs font-mono text-[#65736d]">
              <span className="size-1.5 rounded-full bg-[#99a69f]" />
              <span>Idle</span>
            </span>
          )}

          {/* Speed Toggle */}
          <div className="flex items-center rounded-md border border-[#dfe5df] bg-[#f8faf8] p-0.5 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onDemoSpeedChange("live")}
              className={cn(
                "px-2 py-0.5 rounded transition-all flex items-center gap-1",
                demoSpeed === "live"
                  ? "bg-white text-[#202a2a] font-semibold shadow-2xs border border-[#d2dbd4]"
                  : "text-[#65736d] hover:text-[#202a2a]"
              )}
              title="Instant streaming"
            >
              <Zap size={10} />
              <span>Live</span>
            </button>
            <button
              type="button"
              onClick={() => onDemoSpeedChange("1x")}
              className={cn(
                "px-2 py-0.5 rounded transition-all flex items-center gap-1",
                demoSpeed === "1x"
                  ? "bg-[#2c674f] text-white font-semibold shadow-2xs"
                  : "text-[#65736d] hover:text-[#202a2a]"
              )}
              title="Deliberate presentation pacing"
            >
              <Sparkles size={10} />
              <span>Demo</span>
            </button>
          </div>
        </div>

        {/* Right: Primary Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReset}
            className="inline-flex size-7 items-center justify-center rounded border border-[#dfe5df] bg-white text-[#65736d] hover:text-[#202a2a] hover:bg-[#f3f5f2] transition-colors"
            title="Reset"
          >
            <RotateCcw size={12} />
          </button>

          {isRunning ? (
            <button
              onClick={onPause}
              className="inline-flex items-center gap-1 rounded bg-[#fff2ef] hover:bg-[#ffe5df] border border-[#f5c6bc] text-[#9a5141] text-xs font-mono font-semibold px-3 py-1.5 transition-all"
            >
              <Square size={10} fill="currentColor" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={!canStart}
              className="inline-flex items-center gap-1 rounded bg-[#202a2a] hover:bg-[#2c674f] text-white text-xs font-mono font-semibold px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={10} fill="currentColor" />
              <span>{status === "completed" ? "Rerun" : "Start Test"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
