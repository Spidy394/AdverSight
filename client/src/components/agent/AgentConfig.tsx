import type { TargetAgent, TargetAgentKind } from "@/types/testing";
import { getTargetAgentErrors } from "@/lib/targetAgent";
import { CircleDot, Server, ShieldCheck } from "lucide-react";

interface AgentConfigProps {
  currentAgent: TargetAgent;
  onAgentChange: (agent: TargetAgent) => void;
  disabled?: boolean;
}

const TARGET_MODES: { id: TargetAgentKind; label: string }[] = [
  { id: "demo_vulnerable", label: "Vulnerable Demo" },
  { id: "demo_secure", label: "Secure Demo" },
  { id: "http", label: "Custom HTTP Agent" },
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
    <section className="flex flex-col gap-4 rounded-md border border-[#dfe5df] bg-white p-4">
      <div className="flex items-center gap-2 border-b border-[#e7ebe7] pb-3">
        <Server size={15} className="text-[#47765c]" />
        <h2 className="text-sm font-semibold text-[#2a3530]">What AI agent are you testing?</h2>
      </div>

      <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-60">
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#718078]">
          Agent type
        </legend>
        <div role="radiogroup" className="grid gap-1.5">
          {TARGET_MODES.map((mode) => {
            const selected = currentKind === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectKind(mode.id)}
                className={`flex min-h-10 items-center gap-2.5 rounded border px-3 text-left text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#417b63] ${selected ? "border-[#80a58b] bg-[#eff5f0] text-[#315b42]" : "border-[#e2e8e2] bg-white text-[#647169] hover:bg-[#f7f9f7]"}`}
              >
                <CircleDot size={14} className={selected ? "text-[#3f7554]" : "text-[#aab4ac]"} />
                {mode.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-[#e7ebe7] pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#718078]">Agent</p>
          <p className="mt-1 text-sm font-semibold text-[#2a3530]">
            {isCustom ? currentAgent.name || "Name your agent" : "Flight Booking Agent"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#748078]">
            {currentKind === "demo_vulnerable"
              ? "Intentionally vulnerable agent for demonstrating AdverSight failure discovery."
              : currentKind === "demo_secure"
                ? "Hardened reference agent used to validate false-positive behavior."
                : "Configure a JSON HTTP endpoint. This target remains in local simulation until the backend provides an HTTP adapter."}
          </p>
        </div>

        {isCustom && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#53615a] sm:col-span-2">
              Agent name
              <input
                value={currentAgent.name}
                onChange={(event) => onAgentChange({ ...currentAgent, name: event.target.value })}
                disabled={disabled}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "target-agent-name-error" : undefined}
                className="h-9 w-full rounded-md border border-[#d5ddd6] bg-white px-3 text-sm font-normal text-[#27332e] outline-none focus:border-[#52816b] focus:ring-2 focus:ring-[#52816b]/15 disabled:cursor-not-allowed"
                placeholder="My Customer Support Agent"
              />
              {errors.name && <span id="target-agent-name-error" className="text-[11px] font-normal text-[#a24f3e]">{errors.name}</span>}
            </label>
            {!disabled ? (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#53615a] sm:col-span-2">
                Endpoint
                <input
                  value={currentAgent.endpoint}
                  onChange={(event) => onAgentChange({ ...currentAgent, endpoint: event.target.value })}
                  aria-invalid={Boolean(errors.endpoint)}
                  aria-describedby={errors.endpoint ? "target-agent-endpoint-error" : undefined}
                  className="h-9 w-full rounded-md border border-[#d5ddd6] bg-white px-3 font-mono text-xs font-normal text-[#27332e] outline-none focus:border-[#52816b] focus:ring-2 focus:ring-[#52816b]/15"
                  placeholder="https://example.com/agent"
                  inputMode="url"
                />
                {errors.endpoint && <span id="target-agent-endpoint-error" className="text-[11px] font-normal text-[#a24f3e]">{errors.endpoint}</span>}
              </label>
            ) : (
              <p className="text-xs text-[#748078] sm:col-span-2">Endpoint configured for this session</p>
            )}
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#53615a]">
              Request timeout (seconds)
              <input
                type="number"
                min="1"
                step="1"
                value={currentAgent.requestTimeoutSeconds ?? ""}
                onChange={(event) => onAgentChange({ ...currentAgent, requestTimeoutSeconds: Number(event.target.value) })}
                disabled={disabled}
                aria-invalid={Boolean(errors.timeout)}
                aria-describedby={errors.timeout ? "target-agent-timeout-error" : undefined}
                className="h-9 w-full rounded-md border border-[#d5ddd6] bg-white px-3 text-sm font-normal tabular-nums text-[#27332e] outline-none focus:border-[#52816b] focus:ring-2 focus:ring-[#52816b]/15 disabled:cursor-not-allowed"
              />
              {errors.timeout && <span id="target-agent-timeout-error" className="text-[11px] font-normal text-[#a24f3e]">{errors.timeout}</span>}
            </label>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#edf0ed] pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#718078]">Status</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isConfigured ? "text-[#477655]" : "text-[#a45e3e]"}`}>
            <span className={`size-1.5 rounded-full ${isConfigured ? "bg-[#4c8060]" : "bg-[#bb7a44]"}`} />
            {isConfigured ? (isCustom ? "Configured" : "Ready") : "Needs configuration"}
          </span>
        </div>
        {isCustom && (
          <div role="note" className="flex items-start gap-2 rounded border border-[#e7e5d8] bg-[#fbfaf4] p-2.5 text-[11px] leading-4 text-[#756d50]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <p>Simulation mode will not send requests to this endpoint. Timeout is saved locally because the current session API does not define a timeout field.</p>
          </div>
        )}
      </div>
    </section>
  );
}
