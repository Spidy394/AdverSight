import { useRef, useState } from "react";
import type {
  Failure,
  ReplayAttempt,
  ReplayConfiguration,
} from "@/types/testing";
import { replayTestCase } from "@/lib/api";
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
  LoaderCircle,
  CircleCheck,
  CircleX,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

interface FailureDetailsProps {
  failure: Failure | null;
  onClose: () => void;
}

type ReplayPhase = "idle" | "configuring" | "replaying" | "completed" | "error";

interface ReplayState {
  phase: ReplayPhase;
  attempts: number;
  completedAttempts: ReplayAttempt[];
  currentAttempt: number;
  error: string | null;
}

const ATTEMPT_OPTIONS: ReplayConfiguration["attempts"][] = [1, 2, 3, 5, 10];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Replay could not be completed. Retry the request.";
}

function formatFailureType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

interface ReplayAttemptListProps {
  results: ReplayAttempt[];
  expandedAttempt: number | null;
  onToggle: (attempt: number | null) => void;
  totalAttempts: number;
  currentAttempt?: number;
  failedAttempt?: number;
}

function ReplayAttemptList({
  results,
  expandedAttempt,
  onToggle,
  totalAttempts,
  currentAttempt,
  failedAttempt,
}: ReplayAttemptListProps) {
  return (
    <ol className="flex flex-col divide-y divide-[#edf0ed]" aria-label="Replay attempts">
      {Array.from({ length: totalAttempts }, (_, index) => {
        const attempt = index + 1;
        const replayAttempt = results[index];
        const result = replayAttempt?.result;
        const isCurrent = attempt === currentAttempt;
        const hasFailed = attempt === failedAttempt;
        const isExpanded = expandedAttempt === index;

        return (
          <li key={attempt} className="py-2.5 first:pt-0 last:pb-0">
            <button
              type="button"
              disabled={!result}
              aria-expanded={isExpanded}
              onClick={() => onToggle(isExpanded ? null : index)}
              className="flex w-full items-center gap-2 text-left text-xs disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3e795f]"
            >
              {result ? (
                result.reproduced ? (
                  <CircleCheck size={14} className="shrink-0 text-[#9a5141]" />
                ) : (
                  <CircleX size={14} className="shrink-0 text-[#718078]" />
                )
              ) : isCurrent ? (
                <LoaderCircle size={14} className="shrink-0 animate-spin text-[#2c674f]" />
              ) : hasFailed ? (
                <CircleX size={14} className="shrink-0 text-[#9a5141]" />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-[#cbd5cf]" />
              )}
              <span className="font-mono tabular-nums text-[#718078] text-[11px]">
                Attempt {String(attempt).padStart(2, "0")}
              </span>
              <span className="font-medium text-[#202a2a] text-xs">
                {result
                  ? result.reproduced
                    ? "Failure reproduced"
                    : "Not reproduced"
                  : hasFailed
                    ? "Request error"
                    : isCurrent
                      ? "Running probe..."
                      : "Waiting"}
              </span>
              {result && (
                isExpanded ? (
                  <ChevronDown size={13} className="ml-auto text-[#718078]" />
                ) : (
                  <ChevronRight size={13} className="ml-auto text-[#718078]" />
                )
              )}
            </button>
            {result && isExpanded && (
              <div className="mt-2.5 flex flex-col gap-2 border-l-2 border-[#d5ded7] pl-3 text-xs">
                <p className="font-semibold uppercase tracking-wide text-[#65736d] text-[10px] font-mono">
                  Replay interaction
                </p>
                {result.turns.map((turn, turnIndex) => (
                  <div
                    key={`${attempt}-${turnIndex}`}
                    className="flex flex-col gap-1.5 rounded border border-[#dfe5df] bg-[#f8faf8] p-2.5"
                  >
                    <div>
                      <p className="text-[10px] font-semibold text-[#2c674f] font-mono uppercase">
                        Recorded attack
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#202a2a] text-xs">
                        {turn.attack}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#94601b] font-mono uppercase">
                        Agent response
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#202a2a] text-xs">
                        {turn.response.text}
                      </p>
                    </div>
                    {turn.response.toolCalls.map((tool, toolIndex) => (
                      <div
                        key={`${attempt}-${turnIndex}-${toolIndex}`}
                        className="font-mono text-[10.5px] rounded bg-white p-2 border border-[#fae2c0] text-[#202a2a]"
                      >
                        <span className="text-[#94601b] font-semibold">{tool.name}</span>
                        <div className="text-[#65736d] mt-1 pl-2">
                          {JSON.stringify(tool.arguments, null, 2)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div>
                  <p className="text-[10px] font-semibold text-[#65736d] font-mono uppercase">
                    Detection result
                  </p>
                  {result.findings.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1 text-[#202a2a]">
                      {result.findings.map((finding, findingIndex) => (
                        <li key={`${attempt}-finding-${findingIndex}`} className="flex items-start gap-1.5">
                          <span className="text-[#9a5141] font-semibold uppercase font-mono text-[10.5px]">
                            {finding.type.replace(/_/g, " ")}:
                          </span>
                          <span>{finding.description}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[#718078]">No matching failure finding was returned.</p>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function FailureDetails({ failure, onClose }: FailureDetailsProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const replayInFlightRef = useRef(false);
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>({
    phase: "idle",
    attempts: 1,
    completedAttempts: [],
    currentAttempt: 0,
    error: null,
  });

  const openReplayConfiguration = () => {
    setReplayState((current) => ({ ...current, phase: "configuring", error: null }));
  };

  const handleStartReplay = async () => {
    if (!failure || replayState.phase === "replaying" || replayInFlightRef.current) return;

    replayInFlightRef.current = true;
    const attemptCount = replayState.attempts;
    const completedAttempts: ReplayAttempt[] = [];
    setExpandedAttempt(null);
    setReplayState({
      phase: "replaying",
      attempts: attemptCount,
      completedAttempts,
      currentAttempt: 1,
      error: null,
    });

    try {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
        setReplayState((current) => ({
          ...current,
          phase: "replaying",
          currentAttempt: attempt,
        }));

        await wait(500);

        try {
          const result = await replayTestCase(failure.testId);
          completedAttempts.push({ attempt, result });
          setReplayState((current) => ({
            ...current,
            phase: "replaying",
            completedAttempts: [...completedAttempts],
            currentAttempt: Math.min(attempt + 1, attemptCount),
          }));
        } catch (error) {
          setReplayState((current) => ({
            ...current,
            phase: "error",
            completedAttempts: [...completedAttempts],
            currentAttempt: attempt,
            error: errorMessage(error),
          }));
          return;
        }
      }

      setReplayState((current) => ({ ...current, phase: "completed" }));
    } finally {
      replayInFlightRef.current = false;
    }
  };

  const handleClose = () => {
    if (replayState.phase === "replaying") return;
    onClose();
  };

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!failure) return null;

  const reproduciblePayload = JSON.stringify(
    {
      adversight_version: "1.0-RC",
      reproduction_target: {
        test_id: failure.testId,
        test_number: failure.testNumber,
        strategy: failure.strategy,
        timestamp: failure.timestamp,
      },
      failure_assertion: {
        class: failure.type,
        severity: failure.severity,
        rationale: failure.whyItFailed,
      },
      trace: {
        attack: failure.attack,
        response: failure.response,
        tool_calls: failure.toolCalls ?? [],
      },
    },
    null,
    2
  );

  const completedAttemptCount = replayState.completedAttempts.length;
  const successfulAttempts = replayState.completedAttempts.filter(
    (attempt) => attempt.result.reproduced
  ).length;
  const allAttemptsReproduced =
    completedAttemptCount > 0 && successfulAttempts === completedAttemptCount;
  const noAttemptsReproduced =
    completedAttemptCount > 0 && successfulAttempts === 0;

  return (
    <Dialog
      open={Boolean(failure)}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/50 backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-[#dfe5df] bg-white text-[#202a2a] shadow-2xl outline-none">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-[#fafbfa] border-b border-[#e7ebe7] sticky top-0 z-10">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-md bg-[#fcf1ed] border border-[#f0c9c0] flex items-center justify-center text-[#9a5141]">
                <AlertTriangle size={15} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogPrimitive.Title className="text-sm font-mono font-bold uppercase tracking-wider text-[#9a5141]">
                    {formatFailureType(failure.type)}
                  </DialogPrimitive.Title>
                  <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#fcf1ed] text-[#9a5141] border border-[#f0c9c0] font-semibold">
                    {failure.severity.toUpperCase()}
                  </span>
                </div>
                <DialogPrimitive.Description className="text-[10.5px] font-mono text-[#65736d]">
                  Adversarial Evidence Bundle // Probe #{String(failure.testNumber).padStart(2, "0")} [{failure.testId}]
                </DialogPrimitive.Description>
              </div>
            </div>

            <button
              onClick={handleClose}
              disabled={replayState.phase === "replaying"}
              aria-label="Close failure evidence"
              className="size-7 rounded-md bg-white hover:bg-[#f2f5f2] text-[#65736d] hover:text-[#202a2a] flex items-center justify-center border border-[#dfe5df] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 flex flex-col gap-4 text-xs font-sans">
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] bg-[#f8faf8] p-3 rounded-lg border border-[#e5eae5]">
              <div>
                <span className="text-[9.5px] uppercase tracking-wider text-[#718078] block">
                  Failure Class
                </span>
                <span className="text-[#9a5141] font-semibold truncate block mt-0.5">
                  {formatFailureType(failure.type)}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase tracking-wider text-[#718078] block">
                  Strategy
                </span>
                <span className="text-[#202a2a] capitalize truncate block mt-0.5">
                  {failure.strategy.replace(/_/g, " ")}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase tracking-wider text-[#718078] block">
                  Test ID
                </span>
                <span className="text-[#2c674f] font-medium truncate block mt-0.5">
                  {failure.testId}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] uppercase tracking-wider text-[#718078] block">
                  Detected At
                </span>
                <span className="text-[#65736d] truncate block mt-0.5">
                  {failure.timestamp}
                </span>
              </div>
            </div>

            {/* Section 1: ATTACK PROBE */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider text-[#2c674f] flex items-center gap-1.5">
                  <Zap size={12} />
                  1. Original Attack Probe
                </span>
                <button
                  onClick={() => handleCopy(failure.attack, "attack")}
                  className="text-[10.5px] font-mono text-[#65736d] hover:text-[#202a2a] flex items-center gap-1"
                >
                  {copiedSection === "attack" ? (
                    <Check size={11} className="text-[#2c674f]" />
                  ) : (
                    <Copy size={11} />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <div className="rounded-lg border border-[#cfe2d5] bg-[#f4f9f5] p-3 font-mono text-xs text-[#202a2a] leading-relaxed">
                &ldquo;{failure.attack}&rdquo;
              </div>
            </div>

            {/* Section 2: TARGET AGENT RESPONSE */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider text-[#94601b] flex items-center gap-1.5">
                  <Bot size={12} />
                  2. Agent Response
                </span>
                <button
                  onClick={() => handleCopy(failure.response, "response")}
                  className="text-[10.5px] font-mono text-[#65736d] hover:text-[#202a2a] flex items-center gap-1"
                >
                  {copiedSection === "response" ? (
                    <Check size={11} className="text-[#2c674f]" />
                  ) : (
                    <Copy size={11} />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <div className="rounded-lg border border-[#fae2c0] bg-[#fffbf2] p-3 font-mono text-xs text-[#202a2a] leading-relaxed">
                &ldquo;{failure.response}&rdquo;
              </div>
            </div>

            {/* Section 3: TOOL CALL (if present) */}
            {failure.toolCalls && failure.toolCalls.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider text-[#94601b] flex items-center gap-1.5">
                    <Code2 size={12} />
                    3. Intercepted Tool Invocation
                  </span>
                  <span className="text-[10px] font-mono text-[#8a9891]">
                    {failure.toolCalls[0].timestamp}
                  </span>
                </div>
                <div className="rounded-lg border border-[#fae2c0] bg-white p-3 font-mono text-xs overflow-x-auto text-[#202a2a]">
                  <span className="text-[#2c674f] font-bold">
                    {failure.toolCalls[0].name}(
                  </span>
                  <div className="pl-4 space-y-0.5 my-1 text-[#65736d]">
                    {Object.entries(failure.toolCalls[0].arguments).map(
                      ([key, val]) => (
                        <div key={key}>
                          <span className="text-[#718078]">{key}:</span>{" "}
                          <span className="text-[#94601b] font-semibold">
                            {JSON.stringify(val)}
                          </span>
                          <span className="text-[#adb9b2]">,</span>
                        </div>
                      )
                    )}
                  </div>
                  <span className="text-[#2c674f] font-bold">)</span>
                </div>
              </div>
            )}

            {/* Section 4: WHY THIS FAILED */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase font-mono font-bold tracking-wider text-[#9a5141] flex items-center gap-1.5">
                <AlertTriangle size={12} />
                4. Failure Diagnosis & Security Rationale
              </span>
              <div className="rounded-lg border border-[#f0c9c0] bg-[#fff8f5] p-3 text-xs leading-relaxed text-[#202a2a] font-sans">
                {failure.whyItFailed}
              </div>
            </div>

            {/* Section 5: REPRODUCIBLE PAYLOAD CODE */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-[#718078]">
                  JSON Replay Specification
                </span>
                <button
                  onClick={() => handleCopy(reproduciblePayload, "json")}
                  className="text-[10px] font-mono text-[#2c674f] hover:underline flex items-center gap-1 font-medium"
                >
                  {copiedSection === "json" ? (
                    <Check size={11} className="text-[#2c674f]" />
                  ) : (
                    <Copy size={11} />
                  )}
                  <span>Copy JSON Bundle</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-[#f8faf8] border border-[#dfe5df] font-mono text-[10px] text-[#4f5f58] overflow-x-auto max-h-32">
                {reproduciblePayload}
              </pre>
            </div>

            {/* Section 6: REPRODUCIBILITY / REPLAY */}
            <section
              aria-live="polite"
              className="flex flex-col gap-3 border-t border-[#edf0ed] pt-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-[#202a2a]">Replay Reproducibility</h4>
                  <p className="mt-0.5 text-[11px] text-[#65736d]">
                    Replays the exact recorded probe sequence to verify whether the vulnerability is deterministic.
                  </p>
                </div>
                {replayState.phase === "completed" && (
                  <span className="font-mono text-[11px] font-semibold text-[#2c674f]">
                    {successfulAttempts}/{completedAttemptCount} reproduced
                  </span>
                )}
              </div>

              {replayState.phase === "configuring" && (
                <div className="grid gap-3 rounded-lg border border-[#dfe5df] bg-[#f8faf8] p-3.5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                  <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div>
                      <dt className="text-[#718078]">Failure</dt>
                      <dd className="mt-0.5 truncate font-medium text-[#202a2a]">
                        {formatFailureType(failure.type)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#718078]">Original Probe</dt>
                      <dd className="mt-0.5 font-mono text-[#2c674f] font-medium">{failure.testId}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[#718078]">Strategy</dt>
                      <dd className="mt-0.5 capitalize text-[#202a2a]">{failure.strategy.replace(/_/g, " ")}</dd>
                    </div>
                  </dl>
                  <label className="flex flex-col gap-1 text-[11px] font-medium text-[#48564f]">
                    Replay attempts
                    <select
                      value={replayState.attempts}
                      onChange={(event) =>
                        setReplayState((current) => ({
                          ...current,
                          attempts: Number(event.target.value),
                        }))
                      }
                      className="h-8.5 rounded-md border border-[#d5ded6] bg-white px-2.5 font-mono text-xs text-[#202a2a] outline-none focus:border-[#3e795f] focus:ring-1 focus:ring-[#3e795f]/20"
                    >
                      {ATTEMPT_OPTIONS.map((attempts) => (
                        <option key={attempts} value={attempts}>{attempts} attempts</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {replayState.phase === "replaying" && (
                <div className="flex flex-col gap-2 rounded-lg border border-[#cfe2d5] bg-[#f4f9f5] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[#2c674f]">
                      <LoaderCircle size={14} className="animate-spin" />
                      Replaying failure sequence...
                    </span>
                    <span className="font-mono text-[10.5px] tabular-nums text-[#65736d]">
                      Attempt {replayState.currentAttempt} / {replayState.attempts}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#65736d]">Waiting for the backend replay response...</p>
                  <ReplayAttemptList
                    results={replayState.completedAttempts}
                    expandedAttempt={expandedAttempt}
                    onToggle={setExpandedAttempt}
                    totalAttempts={replayState.attempts}
                    currentAttempt={replayState.currentAttempt}
                  />
                </div>
              )}

              {replayState.phase === "completed" && (
                <div className={`flex flex-col gap-3 rounded-lg border p-3.5 ${allAttemptsReproduced ? "border-[#f0c9c0] bg-[#fff8f5]" : "border-[#fae2c0] bg-[#fffbf2]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {allAttemptsReproduced ? (
                        <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#9a5141]" />
                      ) : noAttemptsReproduced ? (
                        <CircleX size={18} className="mt-0.5 shrink-0 text-[#718078]" />
                      ) : (
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#94601b]" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${allAttemptsReproduced ? "text-[#9a5141]" : "text-[#94601b]"}`}>
                          {allAttemptsReproduced ? "REPRODUCED (100% Deterministic)" : noAttemptsReproduced ? "NOT REPRODUCED" : "PARTIALLY REPRODUCED"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-[#65736d]">
                          {allAttemptsReproduced
                            ? "The exact failure condition and breach rule reproduced in every attempt."
                            : noAttemptsReproduced
                              ? "The original failure condition was not reproduced in these attempts."
                              : "The original failure condition reproduced in some, but not all, attempts."}
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-semibold text-[#202a2a]">{successfulAttempts} / {replayState.attempts}</p>
                      <p className="mt-0.5 text-[10.5px] text-[#718078] font-medium">
                        {Math.round((successfulAttempts / replayState.attempts) * 100)}% reproduction rate
                      </p>
                    </div>
                  </div>
                  <ReplayAttemptList
                    results={replayState.completedAttempts}
                    expandedAttempt={expandedAttempt}
                    onToggle={setExpandedAttempt}
                    totalAttempts={replayState.attempts}
                  />
                </div>
              )}

              {replayState.phase === "error" && (
                <div role="alert" className="flex flex-col gap-2 rounded-lg border border-[#f0c9c0] bg-[#fff8f5] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#9a5141]">
                    <CircleX size={15} /> Replay could not be completed
                  </div>
                  <p className="text-xs text-[#9a5141]">{replayState.error}</p>
                  {replayState.completedAttempts.length > 0 && (
                    <ReplayAttemptList
                      results={replayState.completedAttempts}
                      expandedAttempt={expandedAttempt}
                      onToggle={setExpandedAttempt}
                      totalAttempts={replayState.attempts}
                      failedAttempt={replayState.currentAttempt}
                    />
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[#fafbfa] border-t border-[#e7ebe7] sticky bottom-0">
            <div className="flex items-center gap-2">
              {replayState.phase === "idle" && (
                <button
                  onClick={openReplayConfiguration}
                  className="flex items-center gap-1.5 rounded-md bg-[#2c674f] px-3.5 py-1.5 text-xs font-mono font-medium text-white transition-colors hover:bg-[#23533f]"
                >
                  <RotateCcw size={12} />
                  <span>Configure Replay</span>
                </button>
              )}
              {replayState.phase === "configuring" && (
                <>
                  <button
                    onClick={() =>
                      setReplayState((current) => ({
                        ...current,
                        phase: current.completedAttempts.length > 0 ? "completed" : "idle",
                      }))
                    }
                    className="rounded-md border border-[#dfe5df] bg-white px-3 py-1.5 text-xs font-mono text-[#586660] transition-colors hover:bg-[#f6f8f6]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartReplay}
                    className="flex items-center gap-1.5 rounded-md bg-[#2c674f] px-3.5 py-1.5 text-xs font-mono font-semibold text-white transition-colors hover:bg-[#23533f]"
                  >
                    <Play size={12} /> Start Replay
                  </button>
                </>
              )}
              {replayState.phase === "replaying" && (
                <button disabled className="flex items-center gap-1.5 rounded-md border border-[#cfe2d5] bg-[#f4f9f5] px-3.5 py-1.5 text-xs font-mono text-[#2c674f] font-semibold disabled:cursor-wait">
                  <LoaderCircle size={12} className="animate-spin" />
                  Replaying {replayState.currentAttempt}/{replayState.attempts}
                </button>
              )}
              {replayState.phase === "completed" && (
                <button
                  onClick={openReplayConfiguration}
                  className="flex items-center gap-1.5 rounded-md bg-[#2c674f] px-3.5 py-1.5 text-xs font-mono font-semibold text-white transition-colors hover:bg-[#23533f]"
                >
                  <RotateCcw size={12} /> Replay Again
                </button>
              )}
              {replayState.phase === "error" && (
                <button
                  onClick={handleStartReplay}
                  className="flex items-center gap-1.5 rounded-md bg-[#9a5141] px-3.5 py-1.5 text-xs font-mono font-semibold text-white transition-colors hover:bg-[#864436]"
                >
                  <RotateCcw size={12} /> Retry Replay
                </button>
              )}

              <button
                onClick={() => handleCopy(reproduciblePayload, "all")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white text-[#4f5d56] border border-[#dfe5df] hover:bg-[#f6f8f6] text-xs font-mono transition-colors"
              >
                {copiedSection === "all" ? <Check size={12} className="text-[#2c674f]" /> : <Copy size={12} />}
                <span>Copy Full Evidence</span>
              </button>
            </div>

            <button
              onClick={handleClose}
              disabled={replayState.phase === "replaying"}
              className="px-3 py-1.5 rounded-md text-xs font-mono text-[#718078] hover:text-[#202a2a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
