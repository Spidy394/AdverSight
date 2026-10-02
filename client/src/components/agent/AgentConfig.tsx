import type { TargetAgent, TargetAgentKind } from "@/types/testing";
import { getTargetAgentErrors } from "@/lib/targetAgent";
import { Server } from "lucide-react";

interface AgentConfigProps {
  currentAgent: TargetAgent;
  onAgentChange: (agent: TargetAgent) => void;
  disabled?: boolean;
}

const TARGET_MODES: { id: TargetAgentKind; label: string }[] = [
  { id: "demo_vulnerable", label: "Vulnerable Demo" },
  { id: "demo_secure", label: "Hardened Demo" },
  { id: "http", label: "Custom HTTP" },
];

export function AgentConfig({ currentAgent, onAgentChange, disabled }: AgentConfigProps) {
  const currentKind = currentAgent.kind ?? "demo_vulnerable";
  const isCustom = currentKind === "http";
  const errors = getTargetAgentErrors(currentAgent);
  const isConfigured = Object.keys(errors).length === 0;

  const selectKind = (kind: TargetAgentKind) => {
    if (kind === currentKind) return;
    if (kind === "http") {
      onAgentChange({
        id: "agent_custom",
        name: "",
        endpoint: "",
        agentType: "custom",
        connected: false,
        kind,
        requestTimeoutSeconds: 30,
      });
      return;
    }

    const isSecure = kind === "demo_secure";
    onAgentChange({
      id: isSecure ? "agent_flight_booking_secure" : "agent_flight_booking_vulnerable",
      name: "Flight Booking Agent",
      endpoint: isSecure
        ? "http://localhost:8000/secure-agent"
        : "http://localhost:8000/vulnerable-agent",
      agentType: "tool_calling",
      connected: true,
      kind,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#dfe5df] bg-white p-3.5 text-xs font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={13} className="text-[#2c674f]" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#202a2a]">
            Target Agent
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#65736d]">
          {isCustom ? (isConfigured ? "HTTP Endpoint" : "Unconfigured") : "In-Process"}
        </span>
      </div>

      {/* Segmented Mode Selector */}
      <div className="grid grid-cols-3 gap-1 rounded-md bg-[#f3f6f4] p-1 border border-[#e5ebe6]">
        {TARGET_MODES.map((mode) => {
          const selected = currentKind === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => selectKind(mode.id)}
              className={`rounded py-1.5 text-center text-xs font-medium transition-all ${
                selected
                  ? "bg-white text-[#202a2a] shadow-xs font-semibold"
                  : "text-[#65736d] hover:text-[#202a2a]"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Target Details */}
      <div className="flex items-center justify-between text-[11px] font-mono text-[#526059] pt-0.5">
        <span className="truncate text-[#202a2a] font-medium">
          {isCustom ? currentAgent.name || "Custom Target" : "Flight Booking Agent"}
        </span>
        <span className="text-[#899790] truncate max-w-[170px]">
          {currentAgent.endpoint.replace("http://localhost:8000", "") || "/"}
        </span>
      </div>

      {/* Custom HTTP inputs (only shown when Custom HTTP selected) */}
      {isCustom && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[#edf0ed]">
          <div>
            <label className="text-[10px] font-mono uppercase text-[#718078] block mb-1">
              Agent Name
            </label>
            <input
              value={currentAgent.name}
              onChange={(e) => onAgentChange({ ...currentAgent, name: e.target.value })}
              placeholder="e.g. Refund Assistant"
              disabled={disabled}
              className="w-full rounded border border-[#dfe5df] bg-[#f8faf8] px-2.5 py-1.5 text-xs text-[#202a2a] outline-none focus:border-[#2c674f] focus:bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-[#718078] block mb-1">
              POST Endpoint
            </label>
            <input
              value={currentAgent.endpoint}
              onChange={(e) => onAgentChange({ ...currentAgent, endpoint: e.target.value })}
              placeholder="https://api.youragent.com/chat"
              disabled={disabled}
              className="w-full rounded border border-[#dfe5df] bg-[#f8faf8] px-2.5 py-1.5 text-xs text-[#202a2a] outline-none focus:border-[#2c674f] focus:bg-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-[#718078] block mb-1">
              Timeout (seconds)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={currentAgent.requestTimeoutSeconds ?? 30}
              onChange={(e) =>
                onAgentChange({
                  ...currentAgent,
                  requestTimeoutSeconds: Math.max(1, Number(e.target.value) || 30),
                })
              }
              disabled={disabled}
              className="w-full rounded border border-[#dfe5df] bg-[#f8faf8] px-2.5 py-1.5 text-xs text-[#202a2a] outline-none focus:border-[#2c674f] focus:bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
