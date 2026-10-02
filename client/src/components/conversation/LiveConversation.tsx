import { type TestCase } from "@/types/testing";
import { cn } from "@/lib/utils";
import { MessageBubble } from "@/components/conversation/MessageBubble";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Terminal,
  Code2,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
} from "lucide-react";

interface LiveConversationProps {
  activeTest: TestCase | null;
  onViewEvidence?: (testId: string) => void;
  onReplayTest?: (test: TestCase) => void;
}

export function LiveConversation({
  activeTest,
  onViewEvidence,
  onReplayTest,
}: LiveConversationProps) {
  if (!activeTest) {
    return (
      <div className="rounded-lg border border-border/60 bg-[#0B0F17] p-6 flex flex-col items-center justify-center min-h-90 text-center shadow-md">
        <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3 animate-pulse">
          <Terminal size={18} />
        </div>
        <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
          No Active Test Selected
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Select a test from the suite matrix or start the adversarial runner to observe real-time agent probing.
        </p>
      </div>
    );
  }

  const {
    id,
    testNumber,
    strategy,
    status,
    conversation,
    toolCalls,
    failureType,
    failureDescription,
    startedAt,
    completedAt,
  } = activeTest;

  const isPass = status === "passed";
  const isFail = status === "failed";
  const isRunning = status === "running";

  return (
    <section className="rounded-lg border border-border/60 bg-[#0B0F17] flex flex-col overflow-hidden shadow-md">
      {/* Test Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0D121D] border-b border-border/40 select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-cyan-400 font-bold">
              TEST #{String(testNumber).padStart(2, "0")}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400 text-[11px]">[{id}]</span>
          </div>

          <div className="h-3 w-px bg-border/50 hidden sm:block" />

          {/* Strategy badge */}
          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-border/50 text-[10px] font-mono text-zinc-300 capitalize">
            Strategy: {strategy.replace(/_/g, " ")}
          </span>
        </div>

        {/* Status and Action pills */}
        <div className="flex items-center gap-2">
          {startedAt && (
            <span className="text-[10px] font-mono text-zinc-500 hidden md:inline">
              Started: {startedAt} {completedAt ? `(Completed: ${completedAt})` : ""}
            </span>
          )}

          {/* Status badge */}
          {isRunning && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10.5px] font-mono">
              <Loader2 size={11} className="animate-spin" />
              <span>RUNNING PROBE</span>
            </div>
          )}
          {isPass && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-mono font-medium">
              <CheckCircle2 size={11} />
              <span>POLICY COMPLIANT</span>
            </div>
          )}
          {isFail && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-[10.5px] font-mono font-semibold animate-pulse">
              <XCircle size={11} />
              <span>VULNERABILITY DETECTED</span>
            </div>
          )}
          {status === "pending" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10.5px] font-mono">
              <Clock size={11} />
              <span>QUEUED</span>
            </div>
          )}

          {/* Replay action */}
          <button
            onClick={() => onReplayTest?.(activeTest)}
            title="Replay this exact test turn"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-border/40 text-[10px] font-mono transition-colors"
          >
            <RotateCcw size={10} />
            <span className="hidden sm:inline">Replay</span>
          </button>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="p-3.5 flex flex-col gap-3 min-h-55 max-h-95 overflow-y-auto bg-[#080B12]">
        {conversation.map((turn, idx) => (
          <MessageBubble key={idx} turn={turn} />
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 p-2.5 rounded bg-zinc-900/60 border border-border/40 text-xs font-mono text-zinc-400">
            <Loader2 size={12} className="animate-spin text-amber-400" />
            <span>Intercepting agent reasoning trace & evaluating invariants...</span>
          </div>
        )}

        {/* Intercepted Tool Invocation Display */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-[#10131B] p-3 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[10.5px] font-semibold">
                <Code2 size={12} />
                <span>INTERCEPTED AGENT TOOL CALL</span>
              </div>
              <span className="text-[9px] font-mono text-zinc-500">
                {toolCalls[0].timestamp}
              </span>
            </div>

            {toolCalls.map((tc, idx) => (
              <div
                key={idx}
                className="font-mono text-[11px] bg-zinc-950 p-2.5 rounded border border-border/40 text-zinc-300"
              >
                <div className="text-cyan-400 font-semibold mb-1">
                  {tc.name}(
                </div>
                <div className="pl-4 space-y-0.5 text-zinc-400">
                  {Object.entries(tc.arguments).map(([key, val]) => (
                    <div key={key}>
                      <span className="text-zinc-500">{key}:</span>{" "}
                      <span className="text-amber-300">{JSON.stringify(val)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-cyan-400 font-semibold mt-1">)</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Observation Outcome Verdict Banner */}
      {(isPass || isFail) && (
        <div
          className={cn(
            "p-3 border-t flex flex-wrap items-center justify-between gap-2",
            isFail
              ? "bg-red-950/30 border-red-500/30 text-red-200"
              : "bg-emerald-950/20 border-emerald-500/20 text-emerald-200"
          )}
        >
          <div className="flex items-start gap-2 max-w-[80%]">
            {isFail ? (
              <AlertTriangle size={15} className="text-red-400 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
            )}
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-[11px] font-mono font-bold uppercase tracking-wider",
                  isFail ? "text-red-400" : "text-emerald-400"
                )}
              >
                {isFail ? `FAILURE DETECTED — ${failureType ?? "Safety Invariant Broken"}` : "POLICY FOLLOWED — VERIFIED SECURE"}
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-sans leading-tight">
                {isFail
                  ? failureDescription ?? "Target agent allowed an unauthorized action during adversarial probing."
                  : "Target agent adhered to required authorization constraints and rejected the probe."}
              </p>
            </div>
          </div>

          {isFail && (
            <button
              onClick={() => onViewEvidence?.(id)}
              className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10.5px] font-mono font-medium flex items-center gap-1 transition-colors ml-auto"
            >
              <span>View Evidence</span>
              <ExternalLink size={10} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export { MessageBubble } from "@/components/conversation/MessageBubble";
