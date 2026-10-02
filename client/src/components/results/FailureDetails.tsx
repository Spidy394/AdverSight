import { useState } from "react";
import { type Failure } from "@/types/testing";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { XCircle, X, RotateCcw, Code2 } from "lucide-react";

interface FailureDetailsProps {
  failure: Failure | null;
  onClose: () => void;
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-[var(--adv-border)]" />
    </div>
  );
}

function EvidenceBlock({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <div
        className={cn(
          "rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-3 py-2.5 text-xs leading-relaxed",
          mono ? "adv-mono text-[var(--adv-cyan)]" : "text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function FailureDetails({ failure, onClose }: FailureDetailsProps) {
  const [replayClicked, setReplayClicked] = useState(false);

  return (
    <AnimatePresence>
      {failure && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-[var(--adv-border)] bg-[var(--adv-panel)] shadow-2xl pointer-events-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--adv-border)] sticky top-0 bg-[var(--adv-panel)] z-10 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <XCircle
                    size={15}
                    strokeWidth={1.5}
                    className="text-[var(--adv-fail)]"
                  />
                  <h2 className="text-sm font-semibold text-foreground">
                    Failure Evidence
                  </h2>
                </div>
                <button
                  id="close-failure-modal"
                  onClick={onClose}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--adv-surface)] transition-colors duration-150"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-4 p-5">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Failure
                    </span>
                    <span className="text-xs font-semibold text-[var(--adv-fail)]">
                      {failure.type}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Strategy
                    </span>
                    <span className="text-xs text-foreground capitalize">
                      {failure.strategy.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Test ID
                    </span>
                    <span className="adv-mono text-[11px] text-foreground">
                      {failure.testId}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      Detected At
                    </span>
                    <span className="adv-mono text-[11px] text-foreground">
                      {failure.timestamp}
                    </span>
                  </div>
                </div>

                <Divider />

                {/* Attack */}
                <EvidenceBlock label="Attack">
                  <span className="italic text-muted-foreground">
                    &ldquo;{failure.attack}&rdquo;
                  </span>
                </EvidenceBlock>

                <Divider />

                {/* Agent response */}
                <EvidenceBlock label="Agent Response">
                  <span className="italic text-muted-foreground">
                    &ldquo;{failure.response}&rdquo;
                  </span>
                </EvidenceBlock>

                {/* Tool calls */}
                {failure.toolCalls && failure.toolCalls.length > 0 && (
                  <>
                    <Divider />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-1.5">
                        <Code2 size={10} strokeWidth={1.5} />
                        Tool Calls
                      </span>
                      {failure.toolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] px-3 py-2.5"
                        >
                          <p className="adv-mono text-[11px] text-[var(--adv-cyan)]">
                            {tc.name}(
                          </p>
                          {Object.entries(tc.arguments).map(([k, v]) => (
                            <p
                              key={k}
                              className="adv-mono text-[11px] text-muted-foreground pl-4"
                            >
                              {k}={" "}
                              <span className="text-[var(--adv-running)]">
                                {JSON.stringify(v)}
                              </span>
                            </p>
                          ))}
                          <p className="adv-mono text-[11px] text-[var(--adv-cyan)]">
                            )
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Divider />

                {/* Why failed */}
                <EvidenceBlock label="Why This Failed">
                  {failure.whyItFailed}
                </EvidenceBlock>

                {/* Replay */}
                <motion.button
                  id={`modal-replay-${failure.id}`}
                  onClick={() => setReplayClicked(true)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="mt-1 w-full flex items-center justify-center gap-2 rounded-md border border-[var(--adv-border)] bg-[var(--adv-surface)] py-2 text-xs text-muted-foreground hover:text-foreground hover:border-[var(--adv-cyan)]/30 transition-all duration-200"
                >
                  <RotateCcw size={12} strokeWidth={1.5} />
                  {replayClicked
                    ? "Replay functionality coming from test engine."
                    : "Replay Test"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
