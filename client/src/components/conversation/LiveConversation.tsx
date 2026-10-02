import { type ConversationTurn, type TestCase } from "@/types/testing";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Loader2, Shield, Bot } from "lucide-react";

interface MessageBubbleProps {
  turn: ConversationTurn;
}

export function MessageBubble({ turn }: MessageBubbleProps) {
  const isAdversight = turn.role === "adversight";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex gap-2.5",
        isAdversight ? "flex-row" : "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
          isAdversight
            ? "bg-[var(--adv-cyan-bg)] border border-[var(--adv-cyan)]/20"
            : "bg-[var(--adv-surface)] border border-[var(--adv-border)]"
        )}
      >
        {isAdversight ? (
          <Shield size={11} strokeWidth={1.5} className="text-[var(--adv-cyan)]" />
        ) : (
          <Bot size={11} strokeWidth={1.5} className="text-muted-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <span
          className={cn(
            "text-[9px] uppercase tracking-widest font-medium",
            isAdversight ? "text-[var(--adv-cyan)]" : "text-muted-foreground"
          )}
        >
          {isAdversight ? "AdverSight" : "Target Agent"}
        </span>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-xs leading-relaxed",
            isAdversight
              ? "bg-[var(--adv-cyan-bg)] border border-[var(--adv-cyan)]/15 text-foreground"
              : "bg-[var(--adv-surface)] border border-[var(--adv-border)] text-foreground"
          )}
        >
          {turn.content}
        </div>
        <span className="adv-mono text-[9px] text-muted-foreground px-1">
          {turn.timestamp}
        </span>
      </div>
    </motion.div>
  );
}

// ── Live Conversation Panel ────────────────────────────────────────────────────

interface LiveConversationProps {
  activeTest: TestCase | null;
}

export function LiveConversation({ activeTest }: LiveConversationProps) {
  if (!activeTest) {
    return (
      <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] p-4 flex flex-col gap-3 flex-1">
        <header className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          Live Test Session
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Waiting for test session…</p>
        </div>
      </div>
    );
  }

  const { status, failureType, failureDescription, conversation, testNumber, strategy } = activeTest;
  const isPass = status === "passed";
  const isFail = status === "failed";
  const isRunning = status === "running";

  return (
    <div className="rounded-lg border border-[var(--adv-border)] bg-[var(--adv-panel)] flex flex-col overflow-hidden">
      {/* Test header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--adv-border)]">
        <div className="flex items-center gap-2">
          <span className="adv-mono text-[10px] text-muted-foreground">
            TEST #{String(testNumber).padStart(2, "0")}
          </span>
          <div className="h-3 w-px bg-[var(--adv-border)]" />
          <span className="text-[10px] text-muted-foreground capitalize">
            {strategy.replace(/_/g, " ")}
          </span>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={10} strokeWidth={1.5} className="animate-spin text-[var(--adv-running)]" />
            <span className="text-[9px] text-[var(--adv-running)] uppercase tracking-widest">
              Running
            </span>
          </div>
        )}
      </div>

      {/* Conversation scroll area */}
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <AnimatePresence initial={false}>
          {conversation.map((turn, i) => (
            <MessageBubble key={i} turn={turn} />
          ))}
        </AnimatePresence>

        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 items-center pl-8"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground adv-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Target agent responding…
            </span>
          </motion.div>
        )}
      </div>

      {/* Result badge */}
      {(isPass || isFail) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "mx-4 mb-4 rounded-md border px-3 py-2.5 flex items-start gap-2",
            isFail
              ? "bg-[var(--adv-fail-bg)] border-[var(--adv-fail-border)]"
              : "bg-[var(--adv-pass-bg,oklch(0.55_0.17_145_/_8%))] border-[var(--adv-pass-border,oklch(0.55_0.17_145_/_25%))]"
          )}
        >
          {isFail ? (
            <XCircle size={14} strokeWidth={1.5} className="text-[var(--adv-fail)] mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={14} strokeWidth={1.5} className="text-[var(--adv-pass)] mt-0.5 shrink-0" />
          )}
          <div>
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-widest",
                isFail ? "text-[var(--adv-fail)]" : "text-[var(--adv-pass)]"
              )}
            >
              {isFail ? "✗ Failure Detected" : "✓ Policy Followed"}
            </p>
            {isFail && failureType && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {failureType}
                {failureDescription && ` — ${failureDescription}`}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
