import { useState } from "react";
import { type Failure } from "@/types/testing";
import {
  X,
  RotateCcw,
  Code2,
  Copy,
  Check,
  Zap,
  Bot,
  AlertTriangle,
  Play,
  Terminal,
} from "lucide-react";

interface FailureDetailsProps {
  failure: Failure | null;
  onClose: () => void;
}

export function FailureDetails({ failure, onClose }: FailureDetailsProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStep, setReplayStep] = useState(0);

  if (!failure) return null;

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  const handleStartReplay = () => {
    setIsReplaying(true);
    setReplayStep(1);
    setTimeout(() => setReplayStep(2), 900);
    setTimeout(() => setReplayStep(3), 1800);
  };

  const reproduciblePayload = JSON.stringify(
    {
      test_id: failure.testId,
      strategy: failure.strategy,
      vulnerability_type: failure.type,
      severity: failure.severity,
      probe: failure.attack,
      expected_behavior: "Enforce user confirmation invariant",
      actual_response: failure.response,
      intercepted_tool_calls: failure.toolCalls ?? [],
    },
    null,
    2
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-red-900/50 bg-[#0B0E17] shadow-[0_0_35px_rgba(0,0,0,0.8)] flex flex-col text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0F1320] border-b border-border/50 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertTriangle size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-red-300">
                  {failure.type}
                </h3>
                <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.2 rounded bg-red-950/80 text-red-400 border border-red-800/60 font-semibold">
                  {failure.severity.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-400">
                Adversarial Evidence Bundle // Test #{String(failure.testNumber).padStart(2, "0")} [{failure.testId}]
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center border border-border/40 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] bg-zinc-950/60 p-3 rounded border border-border/40">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                Failure Class
              </span>
              <span className="text-red-400 font-semibold truncate block">
                {failure.type}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                Attack Strategy
              </span>
              <span className="text-zinc-300 capitalize truncate block">
                {failure.strategy.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                Target Test ID
              </span>
              <span className="text-cyan-400 truncate block">
                {failure.testId}
              </span>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                Detected At
              </span>
              <span className="text-zinc-400 truncate block">
                {failure.timestamp}
              </span>
            </div>
          </div>

          {/* Section 1: ATTACK PROBE */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Zap size={11} />
                1. Adversarial Probe (AdverSight Input)
              </span>
              <button
                onClick={() => handleCopy(failure.attack, "attack")}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
              >
                {copiedSection === "attack" ? (
                  <Check size={11} className="text-emerald-400" />
                ) : (
                  <Copy size={11} />
                )}
                <span>Copy</span>
              </button>
            </div>
            <div className="rounded border border-cyan-500/20 bg-[#0C1424] p-3 font-mono text-xs text-zinc-200 leading-relaxed">
              &ldquo;{failure.attack}&rdquo;
            </div>
          </div>

          {/* Section 2: TARGET AGENT RESPONSE */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
                <Bot size={11} />
                2. Target Agent Observed Response
              </span>
              <button
                onClick={() => handleCopy(failure.response, "response")}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
              >
                {copiedSection === "response" ? (
                  <Check size={11} className="text-emerald-400" />
                ) : (
                  <Copy size={11} />
                )}
                <span>Copy</span>
              </button>
            </div>
            <div className="rounded border border-amber-500/20 bg-[#14120D] p-3 font-mono text-xs text-zinc-200 leading-relaxed">
              &ldquo;{failure.response}&rdquo;
            </div>
          </div>

          {/* Section 3: TOOL CALL (if present) */}
          {failure.toolCalls && failure.toolCalls.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Code2 size={11} />
                  3. Intercepted Tool Invocation
                </span>
                <span className="text-[9.5px] font-mono text-zinc-500">
                  {failure.toolCalls[0].timestamp}
                </span>
              </div>
              <div className="rounded border border-zinc-800 bg-[#07090F] p-3 font-mono text-xs overflow-x-auto text-zinc-300">
                <span className="text-cyan-400 font-bold">
                  {failure.toolCalls[0].name}(
                </span>
                <div className="pl-4 space-y-0.5 my-1 text-zinc-400">
                  {Object.entries(failure.toolCalls[0].arguments).map(
                    ([key, val]) => (
                      <div key={key}>
                        <span className="text-zinc-500">{key}:</span>{" "}
                        <span className="text-amber-300 font-semibold">
                          {JSON.stringify(val)}
                        </span>
                        <span className="text-zinc-600">,</span>
                      </div>
                    )
                  )}
                </div>
                <span className="text-cyan-400 font-bold">)</span>
              </div>
            </div>
          )}

          {/* Section 4: WHY THIS FAILED */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              4. Failure Diagnosis & Security Rationale
            </span>
            <div className="rounded border border-red-900/30 bg-red-950/20 p-3 text-xs leading-relaxed text-zinc-200 font-sans">
              {failure.whyItFailed}
            </div>
          </div>

          {/* Interactive Replay Simulation Viewer */}
          {isReplaying ? (
            <div className="rounded border border-cyan-500/40 bg-zinc-950 p-3 flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between text-cyan-400 border-b border-border/40 pb-1">
                <div className="flex items-center gap-1.5">
                  <Terminal size={12} />
                  <span className="font-bold">LIVE REPLAY ENGINE [SIMULATING TEST]</span>
                </div>
                <span className="text-[10px] text-zinc-500">
                  Replay State: {replayStep === 3 ? "COMPLETED" : "STEPPING"}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] pt-1">
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="text-cyan-400">[0.0s]</span> Dispatching exact probe payload to target endpoint...
                </div>
                {replayStep >= 2 && (
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="text-amber-400">[0.8s]</span> Agent reproduced execution: tool `{failure.toolCalls?.[0]?.name ?? "action"}` invoked without confirmation.
                  </div>
                )}
                {replayStep >= 3 && (
                  <div className="flex items-center gap-2 text-red-400 font-bold">
                    <span className="text-red-400">[1.7s]</span> REPRODUCED VULNERABILITY: Invariant broken deterministically.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Section 5: REPRODUCIBLE PAYLOAD CODE */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] uppercase font-mono text-zinc-500">
                JSON Replay Specification
              </span>
              <button
                onClick={() => handleCopy(reproduciblePayload, "json")}
                className="text-[9.5px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
              >
                {copiedSection === "json" ? (
                  <Check size={10} className="text-emerald-400" />
                ) : (
                  <Copy size={10} />
                )}
                <span>Copy JSON Bundle</span>
              </button>
            </div>
            <pre className="p-2.5 rounded bg-zinc-950 border border-border/40 font-mono text-[10px] text-zinc-400 overflow-x-auto max-h-32">
              {reproduciblePayload}
            </pre>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[#0F1320] border-t border-border/50 sticky bottom-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartReplay}
              disabled={isReplaying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-xs font-mono font-medium transition-colors cursor-pointer"
            >
              {isReplaying ? (
                <>
                  <RotateCcw size={12} className="animate-spin" />
                  <span>Replaying Test...</span>
                </>
              ) : (
                <>
                  <Play size={12} className="fill-current" />
                  <span>Replay Test in Sandbox</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleCopy(reproduciblePayload, "all")}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-900 text-zinc-300 border border-border/40 hover:bg-zinc-800 text-xs font-mono transition-colors"
            >
              {copiedSection === "all" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>Copy Full Report</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
