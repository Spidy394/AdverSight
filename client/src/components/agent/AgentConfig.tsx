import { useState } from "react";
import { motion } from "motion/react";
import {
  type TargetAgent,
  type TestSessionConfig,
  type AttackCategory,
  type TestMode,
} from "@/types/testing";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Wifi,
  WifiOff,
  PlayCircle,
  Loader2,
} from "lucide-react";

interface AgentConfigProps {
  config: TestSessionConfig;
  onStart: () => void;
  isRunning: boolean;
}

const ATTACK_CATEGORY_LABELS: Record<AttackCategory, string> = {
  goal_hijacking: "Goal Hijacking",
  identity_confusion: "Identity Confusion",
  policy_violation: "Policy Violation",
  unauthorized_action: "Unauthorized Action",
  context_manipulation: "Context Manipulation",
  tool_misuse: "Tool Misuse",
  information_extraction: "Information Extraction",
};

const TEST_MODE_LABELS: Record<TestMode, string> = {
  quick_scan: "Quick Scan",
  full_adversarial: "Full Adversarial Test",
  custom: "Custom",
};

const AGENT_OPTIONS: { id: string; name: string }[] = [
  { id: "agent_flight_booking_v1", name: "Flight Booking Agent" },
  { id: "agent_customer_support_v1", name: "Customer Support Agent" },
  { id: "agent_shopping_v1", name: "Shopping Agent" },
  { id: "agent_custom", name: "Custom Agent" },
];

const ALL_CATEGORIES: AttackCategory[] = [
  "goal_hijacking",
  "identity_confusion",
  "policy_violation",
  "unauthorized_action",
  "context_manipulation",
  "tool_misuse",
  "information_extraction",
];

export function AgentConfig({ config, onStart, isRunning }: AgentConfigProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    config.targetAgent.id
  );
  const [testMode, setTestMode] = useState<TestMode>(config.testMode);
  const [categories, setCategories] = useState<Set<AttackCategory>>(
    new Set(config.attackCategories)
  );
  const [maxTests, setMaxTests] = useState(config.maxTests);
  const [maxTurns, setMaxTurns] = useState(config.maxTurnsPerTest);

  const toggleCategory = (cat: AttackCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const agent =
    AGENT_OPTIONS.find((a) => a.id === selectedAgent) ?? AGENT_OPTIONS[0];

  return (
    <aside className="flex flex-col gap-4">
      {/* ── Target Agent ── */}
      <section className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-4 flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Target Agent
          </span>
        </header>

        {/* Agent selector */}
        <div className="relative">
          <select
            id="agent-selector"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full appearance-none rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--adv-cyan)]/50 cursor-pointer"
          >
            {AGENT_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            strokeWidth={1.5}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        {/* Endpoint */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Endpoint
          </label>
          <input
            readOnly
            value={config.targetAgent.endpoint}
            className="rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-3 py-1.5 text-xs adv-mono text-muted-foreground focus:outline-none"
          />
        </div>

        {/* Agent type + connection */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Agent Type
            </span>
            <span className="text-xs text-foreground">Tool-Calling Agent</span>
          </div>
          <div className="flex items-center gap-1.5">
            {config.targetAgent.connected ? (
              <>
                <Wifi
                  size={12}
                  strokeWidth={1.5}
                  className="text-[var(--adv-pass)]"
                />
                <span className="text-[11px] text-[var(--adv-pass)] font-medium">
                  Connected
                </span>
              </>
            ) : (
              <>
                <WifiOff size={12} strokeWidth={1.5} className="text-[var(--adv-fail)]" />
                <span className="text-[11px] text-[var(--adv-fail)] font-medium">
                  Offline
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Test Configuration ── */}
      <section className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-4 flex flex-col gap-4">
        <header className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          Test Configuration
        </header>

        {/* Test Mode */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground">Test Mode</span>
          <div className="flex flex-col gap-1.5">
            {(Object.keys(TEST_MODE_LABELS) as TestMode[]).map((mode) => (
              <label
                key={mode}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  onClick={() => setTestMode(mode)}
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer",
                    testMode === mode
                      ? "border-[var(--adv-cyan)] bg-[var(--adv-cyan)]"
                      : "border-[var(--adv-border)] group-hover:border-[var(--adv-cyan)]/50"
                  )}
                >
                  {testMode === mode && (
                    <div className="w-1 h-1 rounded-full bg-[var(--adv-panel)]" />
                  )}
                </div>
                <span className="text-xs text-foreground">
                  {TEST_MODE_LABELS[mode]}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Attack Categories */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground">
            Attack Categories
          </span>
          <div className="flex flex-col gap-1.5">
            {ALL_CATEGORIES.map((cat) => {
              const checked = categories.has(cat);
              return (
                <label
                  key={cat}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <div
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center transition-all duration-200 cursor-pointer",
                      checked
                        ? "border-[var(--adv-cyan)] bg-[var(--adv-cyan-bg)]"
                        : "border-[var(--adv-border)] group-hover:border-[var(--adv-cyan)]/40"
                    )}
                  >
                    {checked && (
                      <svg
                        className="text-[var(--adv-cyan)]"
                        width="9"
                        height="9"
                        viewBox="0 0 10 10"
                        fill="none"
                      >
                        <path
                          d="M2 5.5L4 7.5L8 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[11px]",
                      checked ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {ATTACK_CATEGORY_LABELS[cat]}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Numeric controls */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Max Tests
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxTests}
              onChange={(e) => setMaxTests(Number(e.target.value))}
              className="rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-2 py-1.5 text-sm adv-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--adv-cyan)]/50 w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Turns / Test
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-2 py-1.5 text-sm adv-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--adv-cyan)]/50 w-full"
            />
          </div>
        </div>

        {/* Start button */}
        <motion.button
          id="start-adversarial-test"
          onClick={onStart}
          disabled={isRunning}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold tracking-wide transition-all duration-300",
            isRunning
              ? "bg-[var(--adv-cyan-bg)] text-[var(--adv-cyan)] border border-[var(--adv-cyan)]/20 cursor-not-allowed"
              : "bg-[var(--adv-cyan)] text-[var(--adv-panel)] hover:opacity-90 cursor-pointer shadow-[0_0_20px_var(--adv-cyan-bg)]"
          )}
        >
          {isRunning ? (
            <>
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              Testing in progress…
            </>
          ) : (
            <>
              <PlayCircle size={14} strokeWidth={1.5} />
              Start Adversarial Test
            </>
          )}
        </motion.button>
      </section>
    </aside>
  );
}
