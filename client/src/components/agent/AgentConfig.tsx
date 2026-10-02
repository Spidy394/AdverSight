import { useState } from "react";
import { type TargetAgent } from "@/types/testing";
import { MOCK_TARGET_AGENTS } from "@/data/mockData";
import { ChevronDown, Wifi, WifiOff, Server, Wrench, ShieldCheck, Check } from "lucide-react";

interface AgentConfigProps {
  currentAgent: TargetAgent;
  onAgentChange: (agent: TargetAgent) => void;
  disabled?: boolean;
}

const AGENT_TOOLS: Record<string, string[]> = {
  agent_flight_booking_v1: ["book_flight", "search_flights", "cancel_ticket"],
  agent_customer_support_v1: ["fetch_account", "create_ticket", "escalate_human"],
  agent_shopping_v1: ["search_catalog", "apply_coupon", "checkout_cart"],
  agent_custom: ["custom_tool_01", "system_exec", "sandbox_eval"],
};

export function AgentConfig({ currentAgent, onAgentChange, disabled }: AgentConfigProps) {
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState(currentAgent.endpoint);

  const handleSelect = (agentId: string) => {
    const found = MOCK_TARGET_AGENTS.find((a) => a.id === agentId);
    if (found) {
      onAgentChange(found);
      if (agentId === "agent_custom") {
        setIsEditingCustom(true);
      } else {
        setIsEditingCustom(false);
      }
    }
  };

  const handleCustomEndpointSave = () => {
    onAgentChange({
      ...currentAgent,
      endpoint: customEndpoint,
      connected: true,
    });
    setIsEditingCustom(false);
  };

  const tools = AGENT_TOOLS[currentAgent.id] ?? ["tool_call_handler"];

  return (
    <section className="rounded-lg border border-border/60 bg-[#0B0F17] p-3.5 flex flex-col gap-3 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Server size={13} className="text-cyan-400" />
          <span className="text-[10px] uppercase tracking-widest font-mono font-semibold text-zinc-300">
            Target Agent
          </span>
        </div>
        <span className="text-[9px] font-mono text-zinc-500 uppercase">
          [ DOMAIN-AGNOSTIC ]
        </span>
      </div>

      {/* Target Agent Selector */}
      <div className="flex flex-col gap-1">
        <label htmlFor="agent-dropdown" className="text-[9.5px] uppercase font-mono tracking-wider text-zinc-400">
          Selected Target Agent
        </label>
        <div className="relative">
          <select
            id="agent-dropdown"
            value={currentAgent.id}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={disabled}
            className="w-full appearance-none rounded border border-border/60 bg-zinc-900/90 px-3 py-2 pr-8 text-xs font-medium text-zinc-200 focus:outline-none focus:border-cyan-500/50 cursor-pointer disabled:opacity-60 transition-colors"
          >
            {MOCK_TARGET_AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id} className="bg-zinc-900 text-zinc-200">
                {agent.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
        </div>
      </div>

      {/* Target Endpoint URL */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[9.5px] uppercase font-mono tracking-wider text-zinc-400">
            Endpoint URL
          </label>
          {currentAgent.id === "agent_custom" && !isEditingCustom && (
            <button
              onClick={() => setIsEditingCustom(true)}
              className="text-[9px] text-cyan-400 hover:underline font-mono"
            >
              Edit
            </button>
          )}
        </div>
        {isEditingCustom ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={customEndpoint}
              onChange={(e) => setCustomEndpoint(e.target.value)}
              className="flex-1 rounded border border-cyan-500/50 bg-zinc-900 px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none"
            />
            <button
              onClick={handleCustomEndpointSave}
              className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono hover:bg-cyan-500/30"
            >
              <Check size={12} />
            </button>
          </div>
        ) : (
          <div className="rounded border border-border/40 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 truncate">
            {currentAgent.endpoint}
          </div>
        )}
      </div>

      {/* Agent Spec & Status Matrix */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {/* Agent Architecture Type */}
        <div className="rounded border border-border/40 bg-zinc-900/40 p-2 flex flex-col gap-0.5">
          <span className="text-[8.5px] uppercase font-mono text-zinc-500 tracking-wider">
            Agent Type
          </span>
          <span className="text-[11px] font-medium text-zinc-200 capitalize">
            {currentAgent.agentType.replace(/_/g, " ")}
          </span>
        </div>

        {/* Live Health / Connection Status */}
        <div className="rounded border border-border/40 bg-zinc-900/40 p-2 flex flex-col gap-0.5">
          <span className="text-[8.5px] uppercase font-mono text-zinc-500 tracking-wider">
            Telemetry Status
          </span>
          <div className="flex items-center gap-1.5">
            {currentAgent.connected ? (
              <>
                <Wifi size={11} className="text-emerald-400" />
                <span className="text-[11px] font-mono font-medium text-emerald-400">
                  Connected
                </span>
              </>
            ) : (
              <>
                <WifiOff size={11} className="text-red-400" />
                <span className="text-[11px] font-mono font-medium text-red-400">
                  Offline
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Interceptable Declared Tools */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/30">
        <div className="flex items-center justify-between text-[9.5px] font-mono text-zinc-400">
          <span className="flex items-center gap-1 uppercase tracking-wider">
            <Wrench size={10} className="text-amber-400" />
            Monitored Agent Tools
          </span>
          <span className="text-zinc-500 font-mono">({tools.length})</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-amber-300/90"
            >
              {t}()
            </span>
          ))}
        </div>
      </div>

      {/* Target Agent Scope Indicator */}
      <div className="rounded bg-cyan-950/20 border border-cyan-500/20 p-2 flex items-center gap-2 text-[10.5px] text-cyan-300/90">
        <ShieldCheck size={14} className="shrink-0 text-cyan-400" />
        <p className="leading-tight">
          AdverSight evaluates boundary compliance via black-box probing.
        </p>
      </div>
    </section>
  );
}
