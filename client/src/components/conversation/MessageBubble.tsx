import { type ConversationTurn } from "@/types/testing";
import { cn } from "@/lib/utils";
import { Shield, Bot, ArrowRight, CornerDownRight } from "lucide-react";

interface MessageBubbleProps {
  turn: ConversationTurn;
}

export function MessageBubble({ turn }: MessageBubbleProps) {
  const isAdversight = turn.role === "adversight";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-md border text-xs transition-all",
        isAdversight
          ? "bg-[#0E1524] border-cyan-500/30 text-zinc-100"
          : "bg-[#0E111A] border-border/50 text-zinc-200"
      )}
    >
      {/* Sender Header */}
      <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/5 pb-1">
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-4 h-4 rounded flex items-center justify-center border",
              isAdversight
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400"
            )}
          >
            {isAdversight ? <Shield size={10} /> : <Bot size={10} />}
          </div>
          <span
            className={cn(
              "font-bold uppercase tracking-wider",
              isAdversight ? "text-cyan-400" : "text-zinc-400"
            )}
          >
            {isAdversight ? "ADVERSIGHT PROBE" : "TARGET AGENT RESPONSE"}
          </span>
          <ArrowRight size={9} className="text-zinc-600" />
          <span className="text-zinc-500 font-normal">
            {isAdversight ? "Synthesized input" : "Observed output"}
          </span>
        </div>
        <span className="text-zinc-500 font-mono text-[9.5px]">
          {turn.timestamp}
        </span>
      </div>

      {/* Message Content */}
      <div className="flex items-start gap-2 pt-0.5">
        <CornerDownRight size={12} className={isAdversight ? "text-cyan-500/70 mt-0.5 shrink-0" : "text-zinc-500 mt-0.5 shrink-0"} />
        <p className="leading-relaxed font-sans text-xs text-zinc-200 selection:bg-cyan-500/30">
          {turn.content}
        </p>
      </div>
    </div>
  );
}
