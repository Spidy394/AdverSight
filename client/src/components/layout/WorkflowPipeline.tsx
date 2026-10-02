import { Target, Zap, Bot, Eye, AlertTriangle, FileCode2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DashboardStatus } from "@/types/testing";

interface WorkflowPipelineProps {
  status: DashboardStatus;
  currentStep?: number; // 1 to 6
}

const STEPS = [
  {
    num: "01",
    label: "TARGET AGENT",
    sub: "Connected Endpoint",
    icon: Target,
    activeColor: "text-blue-400 border-blue-500/40 bg-blue-500/10",
  },
  {
    num: "02",
    label: "ADVERSARIAL PROBE",
    sub: "Autonomous Attack",
    icon: Zap,
    activeColor: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  },
  {
    num: "03",
    label: "AGENT RESPONSE",
    sub: "LLM + Tool Invocations",
    icon: Bot,
    activeColor: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  },
  {
    num: "04",
    label: "OBSERVATION",
    sub: "Invariant Checking",
    icon: Eye,
    activeColor: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10",
  },
  {
    num: "05",
    label: "PASS / FAILURE",
    sub: "Verdict Classification",
    icon: AlertTriangle,
    activeColor: "text-red-400 border-red-500/40 bg-red-500/10",
  },
  {
    num: "06",
    label: "REPRO EVIDENCE",
    sub: "Deterministic Replay",
    icon: FileCode2,
    activeColor: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  },
];

export function WorkflowPipeline({ status, currentStep = 4 }: WorkflowPipelineProps) {
  const isTesting = status === "testing";

  return (
    <div className="w-full bg-[#0A0E17] border-b border-border/40 px-4 py-2 overflow-x-auto select-none">
      <div className="max-w-[1700px] mx-auto flex items-center justify-between min-w-212.5 gap-2">
        <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-border/40 mr-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 font-semibold">
            TESTING PIPELINE
          </span>
        </div>

        <div className="flex items-center justify-between flex-1 gap-1">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const stepNum = idx + 1;
            const isCurrent = isTesting && currentStep === stepNum;
            const isPast = isTesting ? stepNum < currentStep : status === "completed";

            return (
              <div key={step.num} className="flex items-center flex-1">
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded border transition-all duration-200 flex-1 min-w-0",
                    isCurrent
                      ? cn("border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_12px_rgba(34,211,238,0.15)]", step.activeColor)
                      : isPast
                      ? "border-zinc-800 bg-zinc-900/60 text-zinc-300"
                      : "border-border/30 bg-zinc-950/40 text-zinc-500 opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded flex items-center justify-center shrink-0 border text-[10px]",
                      isCurrent
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                        : isPast
                        ? "bg-zinc-800 border-zinc-700 text-zinc-400"
                        : "bg-zinc-900/50 border-zinc-800 text-zinc-600"
                    )}
                  >
                    <Icon size={11} strokeWidth={isCurrent ? 2 : 1.5} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold tracking-wider uppercase truncate leading-tight">
                      {step.label}
                    </span>
                    <span className="text-[8.5px] font-mono text-zinc-500 truncate leading-none">
                      {step.sub}
                    </span>
                  </div>
                </div>

                {idx < STEPS.length - 1 && (
                  <div className="px-1 text-zinc-600 shrink-0">
                    <ChevronRight size={12} strokeWidth={1.5} className={isCurrent ? "text-cyan-400 animate-pulse" : ""} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
