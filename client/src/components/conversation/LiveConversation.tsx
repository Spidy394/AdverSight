import { type TestCase } from "@/types/testing";
import { cn } from "@/lib/utils";
import { MessageBubble } from "@/components/conversation/MessageBubble";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Code2,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";

interface LiveConversationProps {
  activeTest: TestCase | null;
  agentName?: string;
  currentActivity?: string | null;
  onViewEvidence?: (testId: string) => void;
  onReplayTest?: (test: TestCase) => void;
}

export function LiveConversation({
  activeTest,
  agentName = "Target Agent",
  currentActivity,
  onViewEvidence,
  onReplayTest,
}: LiveConversationProps) {
  if (!activeTest) {
    return (
      <div className="rounded-lg border border-[#dfe5df] bg-white p-8 flex flex-col items-center justify-center min-h-[300px] text-center font-sans">
        <span className="font-mono text-xs uppercase tracking-wider text-[#8a9891]">
          Live Probe Stream
        </span>
        <p className="text-xs text-[#526059] mt-1">
          Select an attack strategy and click Start Test to begin evaluation.
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
  } = activeTest;

  const isPass = status === "passed";
  const isFail = status === "failed";
  const isRunning = status === "running";

  return (
    <div className="rounded-lg border border-[#dfe5df] bg-white flex flex-col overflow-hidden font-sans">
      {/* Test Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#f8faf8] border-b border-[#e7ebe7] select-none text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[#2c674f] font-bold">
            PROBE #{String(testNumber).padStart(2, "0")}
          </span>
          <span className="text-[#adb9b2]">·</span>
          <span className="text-[#65736d] text-[11px]">{id}</span>
          <span className="text-[#adb9b2]">·</span>
          <span className="px-1.5 py-0.2 rounded bg-white border border-[#d8e0d9] text-[10.5px] text-[#4e5c55] capitalize">
            {strategy.replace(/_/g, " ")}
          </span>
        </div>

        {/* Status and Action */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fff6e8] border border-[#f4ddbb] text-[#94601b] text-[10.5px] font-mono font-medium">
              <Loader2 size={11} className="animate-spin text-[#c7872d]" />
              <span>ACTIVE</span>
            </div>
          )}
          {isPass && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#e8f4ec] border border-[#c4decb] text-[#2c674f] text-[10.5px] font-mono font-semibold">
              <CheckCircle2 size={11} />
              <span>COMPLIANT</span>
            </div>
          )}
          {isFail && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fff1ee] border border-[#f5c6bc] text-[#9a5141] text-[10.5px] font-mono font-semibold">
              <XCircle size={11} />
              <span>FAILED</span>
            </div>
          )}
          {status === "pending" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#f1f4f1] border border-[#dfe5df] text-[#65736d] text-[10.5px] font-mono">
              <Clock size={11} />
              <span>QUEUED</span>
            </div>
          )}

          <button
            onClick={() => onReplayTest?.(activeTest)}
            className="flex items-center gap-1 px-2 py-0.8 rounded bg-white hover:bg-[#f6f8f6] text-[#4f5d56] border border-[#dfe5df] text-[10.5px] font-mono transition-colors"
          >
            <RotateCcw size={10} />
            <span>Replay</span>
          </button>
        </div>
      </div>

      {/* Real-time Activity Bar */}
      {(isRunning || currentActivity) && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#f0f6f2] border-b border-[#cfe0d5] text-[11px] font-mono text-[#2c674f]">
          <span className="size-1.5 rounded-full bg-[#2c674f] animate-pulse" />
          <span className="text-[#202a2a] truncate font-medium">
            {currentActivity ?? "Analyzing invariant compliance..."}
          </span>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="p-3.5 flex flex-col gap-2.5 min-h-[220px] max-h-[380px] overflow-y-auto overscroll-contain bg-[#fafbfa]">
        {conversation.map((turn, idx) => (
          <MessageBubble
            key={idx}
            turn={turn}
            agentName={agentName}
            turnIndex={idx}
          />
        ))}

        {isRunning && conversation.length === 0 && (
          <div className="flex items-center gap-2 p-3 text-xs font-mono text-[#65736d]">
            <Loader2 size={12} className="animate-spin text-[#c7872d]" />
            <span>Dispatching probe to agent...</span>
          </div>
        )}

        {/* Tool Call Invocation */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="rounded border border-[#fae2c0] bg-white p-3 font-mono text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#f3e9db] text-[#94601b]">
              <div className="flex items-center gap-1.5 font-semibold">
                <Code2 size={12} />
                <span>Tool Execution: {toolCalls[0].name}()</span>
              </div>
              <span className="text-[10px] text-[#9a8979]">{toolCalls[0].timestamp}</span>
            </div>

            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1 gap-x-2 text-[11px]">
              {Object.entries(toolCalls[0].arguments).map(([key, val]) => (
                <div key={key} className="contents">
                  <span className="text-[#7c8880]">{key}</span>
                  <span className="text-[#202a2a] font-medium break-all">
                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Verdict Strip */}
      {(isPass || isFail) && (
        <div
          className={cn(
            "px-4 py-2.5 border-t flex items-center justify-between gap-3 text-xs font-mono",
            isFail
              ? "bg-[#fff8f5] border-[#f2ded8] text-[#9a5141]"
              : "bg-[#f4f9f5] border-[#cfe2d5] text-[#2c674f]"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {isFail ? <XCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
            <span className="font-semibold truncate">
              {isFail ? `Vulnerability: ${failureType ?? "Safety Invariant Broken"}` : "Policy Compliant: Attack Resisted"}
            </span>
          </div>

          {isFail && (
            <button
              onClick={() => onViewEvidence?.(id)}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#9a5141] hover:underline shrink-0"
            >
              <span>Inspect Evidence</span>
              <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { MessageBubble } from "@/components/conversation/MessageBubble";
