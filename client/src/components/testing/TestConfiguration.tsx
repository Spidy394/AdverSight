import { useState } from "react";
import {
  type TestSessionConfig,
  type AttackCategory,
  type TestMode,
  type DashboardStatus,
} from "@/types/testing";
import { cn } from "@/lib/utils";
import {
  Sliders,
  Play,
  Pause,
  RotateCcw,
  CheckSquare,
  Square,
  Shield,
  Zap,
} from "lucide-react";

interface TestConfigurationProps {
  config: TestSessionConfig;
  status: DashboardStatus;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onConfigChange: (newConfig: TestSessionConfig) => void;
}

const ATTACK_CATEGORIES: { id: AttackCategory; label: string; desc: string }[] = [
  {
    id: "goal_hijacking",
    label: "Goal Hijacking",
    desc: "Redirects agent from primary objective",
  },
  {
    id: "identity_confusion",
    label: "Identity Confusion",
    desc: "Admin/developer role impersonation",
  },
  {
    id: "policy_violation",
    label: "Policy Violation",
    desc: "Bypassing business or ethical rules",
  },
  {
    id: "unauthorized_action",
    label: "Unauthorized Action",
    desc: "Action execution without user confirmation",
  },
  {
    id: "context_manipulation",
    label: "Context Manipulation",
    desc: "False history or memory distortion",
  },
  {
    id: "tool_misuse",
    label: "Tool Misuse",
    desc: "Parameter tampering & cross-tenant leaks",
  },
  {
    id: "information_extraction",
    label: "Information Extraction",
    desc: "Prompt leakage & internal API schemas",
  },
];

export function TestConfiguration({
  config,
  status,
  speed,
  onSpeedChange,
  onStart,
  onPause,
  onReset,
  onConfigChange,
}: TestConfigurationProps) {
  const isRunning = status === "testing";
  const [selectedMode, setSelectedMode] = useState<TestMode>(config.testMode);
  const [selectedCats, setSelectedCats] = useState<Set<AttackCategory>>(
    new Set(config.attackCategories)
  );
  const [maxTests, setMaxTests] = useState<number>(config.maxTests);
  const [maxTurns, setMaxTurns] = useState<number>(config.maxTurnsPerTest);

  const handleModeChange = (mode: TestMode) => {
    setSelectedMode(mode);
    let tests = config.maxTests;
    let cats = new Set(config.attackCategories);

    if (mode === "quick_scan") {
      tests = 5;
      cats = new Set<AttackCategory>([
        "goal_hijacking",
        "identity_confusion",
        "policy_violation",
      ]);
    } else if (mode === "full_adversarial") {
      tests = 20;
      cats = new Set<AttackCategory>(ATTACK_CATEGORIES.map((c) => c.id));
    }

    setSelectedCats(cats);
    setMaxTests(tests);
    onConfigChange({
      ...config,
      testMode: mode,
      maxTests: tests,
      attackCategories: Array.from(cats),
    });
  };

  const toggleCategory = (cat: AttackCategory) => {
    if (isRunning) return;
    const next = new Set(selectedCats);
    if (next.has(cat)) {
      if (next.size > 1) next.delete(cat); // keep at least 1
    } else {
      next.add(cat);
    }
    setSelectedCats(next);
    onConfigChange({
      ...config,
      attackCategories: Array.from(next),
    });
  };

  const selectAllCategories = () => {
    if (isRunning) return;
    const all = new Set<AttackCategory>(ATTACK_CATEGORIES.map((c) => c.id));
    setSelectedCats(all);
    onConfigChange({
      ...config,
      attackCategories: Array.from(all),
    });
  };

  return (
    <section className="rounded-lg border border-border/60 bg-[#0B0F17] p-3.5 flex flex-col gap-3.5 shadow-md">
      {/* Title */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Sliders size={13} className="text-cyan-400" />
          <span className="text-[10px] uppercase tracking-widest font-mono font-semibold text-zinc-300">
            Test Configuration
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40">
          PROBE ENGINE
        </span>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9.5px] uppercase font-mono tracking-wider text-zinc-400">
          Test Mode
        </span>
        <div className="grid grid-cols-3 gap-1 bg-zinc-950/60 p-1 rounded border border-border/40">
          {(
            [
              { id: "quick_scan", label: "Quick Scan" },
              { id: "full_adversarial", label: "Full Adversarial" },
              { id: "custom", label: "Custom" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              disabled={isRunning}
              className={cn(
                "py-1 px-1.5 rounded text-[10.5px] font-medium transition-colors text-center truncate",
                selectedMode === m.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Attack Categories Checklist */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] uppercase font-mono tracking-wider text-zinc-400">
            Attack Vectors ({selectedCats.size}/{ATTACK_CATEGORIES.length})
          </span>
          <button
            onClick={selectAllCategories}
            disabled={isRunning || selectedCats.size === ATTACK_CATEGORIES.length}
            className="text-[9px] font-mono text-cyan-400 hover:underline disabled:opacity-40"
          >
            Select All
          </button>
        </div>

        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
          {ATTACK_CATEGORIES.map((cat) => {
            const isChecked = selectedCats.has(cat.id);
            return (
              <div
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  "flex items-start gap-2 p-1.5 rounded border text-left cursor-pointer transition-colors select-none",
                  isChecked
                    ? "bg-zinc-900/80 border-cyan-500/30 text-zinc-200"
                    : "bg-zinc-950/40 border-border/30 text-zinc-500 hover:border-border/60 hover:text-zinc-400",
                  isRunning && "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="mt-0.5 shrink-0 text-cyan-400">
                  {isChecked ? (
                    <CheckSquare size={13} className="text-cyan-400" />
                  ) : (
                    <Square size={13} className="text-zinc-600" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-medium leading-tight truncate">
                    {cat.label}
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-tight">
                    {cat.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Numerical Parameters */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/30">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase font-mono text-zinc-400 tracking-wider">
            Max Tests
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={maxTests}
            disabled={isRunning}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value) || 1);
              setMaxTests(val);
              onConfigChange({ ...config, maxTests: val });
            }}
            className="w-full rounded border border-border/50 bg-zinc-900/80 px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[9px] uppercase font-mono text-zinc-400 tracking-wider">
            Max Turns / Test
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxTurns}
            disabled={isRunning}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value) || 1);
              setMaxTurns(val);
              onConfigChange({ ...config, maxTurnsPerTest: val });
            }}
            className="w-full rounded border border-border/50 bg-zinc-900/80 px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Simulation Speed Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <span className="text-[9.5px] uppercase font-mono text-zinc-400 tracking-wider flex items-center gap-1">
          <Zap size={11} className="text-amber-400" />
          Test Execution Speed
        </span>
        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-border/40">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors",
                speed === s
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Primary Actions Button: Start Adversarial Test */}
      <div className="pt-2 flex flex-col gap-2">
        {!isRunning ? (
          <button
            id="start-adversarial-test"
            onClick={status === "completed" ? onReset : onStart}
            className="w-full py-2.5 px-4 rounded-md font-semibold text-xs text-black bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)] cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center">
              <Play size={11} className="fill-current text-black group-hover:scale-110 transition-transform" />
            </div>
            <span>
              {status === "completed"
                ? "Restart Adversarial Suite"
                : "Start Adversarial Test"}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPause}
              className="py-2 px-3 rounded-md font-medium text-xs text-amber-300 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Pause size={12} />
              <span>Pause Run</span>
            </button>
            <button
              onClick={onReset}
              className="py-2 px-3 rounded-md font-medium text-xs text-zinc-300 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Abort Suite</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 font-mono">
          <Shield size={10} className="text-zinc-500" />
          <span>Autonomous multi-turn probing active</span>
        </div>
      </div>
    </section>
  );
}
