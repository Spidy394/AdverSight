import { type ConversationTurn } from "@/types/testing";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  turn: ConversationTurn;
  agentName?: string;
  turnIndex?: number;
}

export function MessageBubble({ turn, agentName = "Target Agent", turnIndex }: MessageBubbleProps) {
  const isAdversight = turn.role === "adversight";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-md border text-xs font-sans transition-colors",
        isAdversight
          ? "bg-white border-[#dce6df] text-[#202a2a] shadow-2xs"
          : "bg-[#f4f7f5] border-[#dfe7e2] text-[#202a2a]"
      )}
    >
      <div className="flex items-center justify-between font-mono text-[10px] text-[#65736d]">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-bold uppercase tracking-wider px-1 py-0.2 rounded text-[9.5px]",
              isAdversight
                ? "bg-[#eaf3ee] text-[#2c674f]"
                : "bg-[#e4ede7] text-[#345b48]"
            )}
          >
            {isAdversight ? "ADVERSARY" : agentName.toUpperCase()}
          </span>
          {turnIndex !== undefined && (
            <span className="text-[#8e9c95]">Turn {turnIndex + 1}</span>
          )}
        </div>
        <span className="tabular-nums">{turn.timestamp}</span>
      </div>

      <p className="leading-relaxed text-xs text-[#202a2a] selection:bg-[#dcebe2] whitespace-pre-wrap pl-0.5">
        {turn.content}
      </p>
    </div>
  );
}
