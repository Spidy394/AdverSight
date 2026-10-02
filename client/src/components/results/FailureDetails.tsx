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
    <ol className="flex flex-col divide-y divide-white/5" aria-label="Replay attempts">
      {Array.from({ length: totalAttempts }, (_, index) => {
        const attempt = index + 1;
        const replayAttempt = results[index];
        const result = replayAttempt?.result;
        const isCurrent = attempt === currentAttempt;
        const hasFailed = attempt === failedAttempt;
        const isExpanded = expandedAttempt === index;

        return (
          <li key={attempt} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              disabled={!result}
              aria-expanded={isExpanded}
              onClick={() => onToggle(isExpanded ? null : index)}
              className="flex w-full items-center gap-2 text-left text-[11px] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            >
              {result ? result.reproduced ? (
                <CircleCheck size={14} className="shrink-0 text-red-300" />
              ) : (
                <CircleX size={14} className="shrink-0 text-zinc-500" />
              ) : isCurrent ? (
                <LoaderCircle size={14} className="shrink-0 animate-spin text-cyan-300" />
              ) : hasFailed ? (
                <CircleX size={14} className="shrink-0 text-red-300" />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-zinc-700" />
              )}
              <span className="font-mono tabular-nums text-zinc-500">{String(attempt).padStart(2, "0")}</span>
              <span className="font-medium text-zinc-200">
                {result ? result.reproduced ? "Failure reproduced" : "Not reproduced" : hasFailed ? "Request error" : isCurrent ? "Running" : "Queued"}
              </span>
              {result && (isExpanded ? <ChevronDown size={13} className="ml-auto text-zinc-500" /> : <ChevronRight size={13} className="ml-auto text-zinc-500" />)}
            </button>
            {result && isExpanded && (
              <div className="mt-2 flex flex-col gap-2 border-l border-zinc-700 pl-4 text-[11px]">
                <p className="font-semibold uppercase tracking-wide text-zinc-500">Replay interaction</p>
                {result.turns.map((turn, turnIndex) => (
                  <div key={`${attempt}-${turnIndex}`} className="flex flex-col gap-1.5 rounded border border-zinc-800 bg-zinc-950/60 p-2.5">
                    <div>
                      <p className="text-[10px] font-semibold text-cyan-300">Recorded attack</p>
                      <p className="mt-1 whitespace-pre-wrap leading-4 text-zinc-300">{turn.attack}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-amber-300">Agent response</p>
                      <p className="mt-1 whitespace-pre-wrap leading-4 text-zinc-300">{turn.response.text}</p>
                    </div>
                    {turn.response.toolCalls.map((tool, toolIndex) => (
                      <div key={`${attempt}-${turnIndex}-${toolIndex}`} className="font-mono text-[10px] text-zinc-400">
                        <span className="text-amber-200">{tool.name}</span> {JSON.stringify(tool.arguments)}
                      </div>
                    ))}
                  </div>
                ))}
                <div>
                  <p className="text-[10px] font-semibold text-zinc-500">Detection result</p>
                  {result.findings.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1 text-zinc-300">
                      {result.findings.map((finding, findingIndex) => (
                        <li key={`${attempt}-finding-${findingIndex}`}>
                          <span className="capitalize">{finding.type.replace(/_/g, " ")}</span>: {finding.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-zinc-400">No matching failure finding was returned.</p>
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
      for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
        setReplayState((current) => ({
          ...current,
          phase: "replaying",
          currentAttempt: attempt,
        }));

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

  if (!failure) return null;

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  const successfulAttempts = replayState.completedAttempts.reduce(
    (count, attempt) => count + attempt.result.reproducedCount,
    0,
  );
  const completedAttemptCount = replayState.completedAttempts.reduce(
    (count, attempt) => count + attempt.result.attempts,
    0,
  );
  const allAttemptsReproduced =
    completedAttemptCount > 0 && successfulAttempts === completedAttemptCount;
  const noAttemptsReproduced = successfulAttempts === 0;

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
    <Dialog
      open={Boolean(failure)}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-red-900/50 bg-[#0B0E17] text-zinc-100 shadow-[0_0_35px_rgba(0,0,0,0.8)] outline-none">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0F1320] border-b border-border/50 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertTriangle size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogPrimitive.Title className="text-sm font-mono font-bold uppercase tracking-wider text-red-300">
                  {formatFailureType(failure.type)}
                </DialogPrimitive.Title>
                <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.2 rounded bg-red-950/80 text-red-400 border border-red-800/60 font-semibold">
                  {failure.severity.toUpperCase()}
                </span>
              </div>
              <DialogPrimitive.Description className="text-[10px] font-mono text-zinc-400">
                Adversarial Evidence Bundle // Test #{String(failure.testNumber).padStart(2, "0")} [{failure.testId}]
              </DialogPrimitive.Description>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={replayState.phase === "replaying"}
            aria-label="Close failure evidence"
            className="w-7 h-7 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center border border-border/40 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                {formatFailureType(failure.type)}
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
                1. Original attack (recorded)
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
                2. Original agent response
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

          <section
            aria-live="polite"
            className="flex flex-col gap-3 border-t border-border/50 pt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-zinc-100">Replay failure</h4>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Replays the recorded interaction. No new attack is generated.
                </p>
              </div>
              {replayState.phase === "completed" && (
                <span className="font-mono text-[10px] text-zinc-400">
                  {successfulAttempts}/{completedAttemptCount} reproduced
                </span>
              )}
            </div>

            {replayState.phase === "configuring" && (
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-[#0D111A] p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <div>
                    <dt className="text-zinc-500">Failure</dt>
                    <dd className="mt-0.5 truncate font-medium text-zinc-200">{formatFailureType(failure.type)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Original test</dt>
                    <dd className="mt-0.5 font-mono text-zinc-300">{failure.testId}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-zinc-500">Strategy</dt>
                    <dd className="mt-0.5 capitalize text-zinc-300">{failure.strategy.replace(/_/g, " ")}</dd>
                  </div>
                </dl>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-zinc-400">
                  Replay attempts
                  <select
                    value={replayState.attempts}
                    onChange={(event) =>
                      setReplayState((current) => ({
                        ...current,
                        attempts: Number(event.target.value),
                      }))
                    }
                    className="h-9 rounded border border-zinc-700 bg-zinc-950 px-2.5 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    {ATTEMPT_OPTIONS.map((attempts) => (
                      <option key={attempts} value={attempts}>{attempts}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {replayState.phase === "replaying" && (
              <div className="flex flex-col gap-2 rounded-md border border-cyan-900/50 bg-[#0C121B] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
                    <LoaderCircle size={14} className="animate-spin" />
                    Replaying failure
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                    Attempt {replayState.currentAttempt} / {replayState.attempts}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">Waiting for the backend replay result...</p>
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
              <div className={`flex flex-col gap-3 rounded-md border p-3 ${allAttemptsReproduced ? "border-red-900/50 bg-red-950/20" : "border-amber-900/50 bg-amber-950/15"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {allAttemptsReproduced ? (
                      <CircleCheck size={17} className="mt-0.5 shrink-0 text-red-300" />
                    ) : noAttemptsReproduced ? (
                      <CircleX size={17} className="mt-0.5 shrink-0 text-amber-300" />
                    ) : (
                      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${allAttemptsReproduced ? "text-red-200" : "text-amber-200"}`}>
                        {allAttemptsReproduced ? "REPRODUCED" : noAttemptsReproduced ? "NOT REPRODUCED" : "NOT FULLY REPRODUCED"}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                        {allAttemptsReproduced
                          ? "The original failure condition was reproduced in every attempt."
                          : noAttemptsReproduced
                            ? "The original failure condition was not reproduced in these attempts."
                            : "The original failure condition reproduced in some, but not all, attempts."}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-sm font-semibold text-zinc-100">{successfulAttempts} / {replayState.attempts}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">{Math.round((successfulAttempts / replayState.attempts) * 100)}% reproduced</p>
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
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-red-900/60 bg-red-950/20 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-200">
                  <CircleX size={15} /> Replay could not be completed
                </div>
                <p className="text-[11px] leading-4 text-red-100/80">{replayState.error}</p>
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[#0F1320] border-t border-border/50 sticky bottom-0">
          <div className="flex items-center gap-2">
            {replayState.phase === "idle" && (
              <button
                onClick={openReplayConfiguration}
                className="flex items-center gap-1.5 rounded bg-cyan-500/20 px-3 py-1.5 text-xs font-mono font-medium text-cyan-200 transition-colors hover:bg-cyan-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <RotateCcw size={12} />
                <span>Replay Test</span>
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
                  className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-mono text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartReplay}
                  className="flex items-center gap-1.5 rounded bg-cyan-500/20 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                >
                  <Play size={12} /> Start Replay
                </button>
              </>
            )}
            {replayState.phase === "replaying" && (
              <button disabled className="flex items-center gap-1.5 rounded border border-cyan-900/50 px-3 py-1.5 text-xs font-mono text-cyan-200 disabled:cursor-wait">
                <LoaderCircle size={12} className="animate-spin" />
                Replaying {replayState.currentAttempt}/{replayState.attempts}
              </button>
            )}
            {replayState.phase === "completed" && (
              <button
                onClick={openReplayConfiguration}
                className="flex items-center gap-1.5 rounded border border-cyan-900/50 px-3 py-1.5 text-xs font-mono text-cyan-200 transition-colors hover:bg-cyan-950/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                <RotateCcw size={12} /> Replay Again
              </button>
            )}
            {replayState.phase === "error" && (
              <button
                onClick={handleStartReplay}
                className="flex items-center gap-1.5 rounded bg-red-500/15 px-3 py-1.5 text-xs font-mono font-semibold text-red-200 transition-colors hover:bg-red-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              >
                <RotateCcw size={12} /> Retry Replay
              </button>
            )}

            <button
              onClick={() => handleCopy(reproduciblePayload, "all")}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-900 text-zinc-300 border border-border/40 hover:bg-zinc-800 text-xs font-mono transition-colors"
            >
              {copiedSection === "all" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>Copy Full Report</span>
            </button>
          </div>

          <button
            onClick={handleClose}
            disabled={replayState.phase === "replaying"}
            className="px-3 py-1.5 rounded text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
