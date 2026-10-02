import { ArrowDown } from "lucide-react";

export function DifferenceSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-[#dfe5df]">
      {/* Editorial Statement */}
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202a2a] text-center">
        Not another prompt tester. <br />
        <span className="text-[#37735a]">An agent QA layer.</span>
      </h2>

      <p className="mt-4 text-sm sm:text-base text-[#65736d] text-center max-w-lg mx-auto leading-relaxed">
        Prompt testing evaluates text tokens. AdverSight tests how the entire agent
        interacts with users, databases, and permissions across time.
      </p>

      {/* Minimal Side-by-Side Diagram */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs items-stretch">
        {/* Left: Prompt Tester */}
        <div className="rounded-lg border border-[#dfe5df] bg-white p-6 flex flex-col justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-semibold text-[#849089] uppercase tracking-wider block mb-4">
              PROMPT TESTING (SURFACE)
            </span>
            <div className="space-y-2 flex flex-col items-center">
              <div className="w-full text-center py-2 rounded bg-[#fbfbf9] border border-[#edf0ed] text-[#586660]">
                PROMPT
              </div>
              <ArrowDown size={14} className="text-[#a2aca6]" />
              <div className="w-full text-center py-2 rounded bg-[#fbfbf9] border border-[#edf0ed] text-[#586660]">
                RESPONSE
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs font-sans text-[#718078]">
            Evaluates raw completion quality or sentiment. Zero tool awareness.
          </p>
        </div>

        {/* Right: Agent QA Layer */}
        <div className="rounded-lg border border-[#37735a]/30 bg-[#f4f8f5] p-6 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-semibold text-[#2c674f] uppercase tracking-wider">
                ADVERSIGHT AGENT QA (SYSTEMIC)
              </span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#e4eee8] text-[#2c674f]">
                PROTECTED
              </span>
            </div>
            <div className="space-y-1.5 flex flex-col items-center">
              {["AGENT", "CONTEXT", "DECISION", "TOOLS", "ACTION", "POLICY"].map((step, idx) => (
                <div key={step} className="w-full flex flex-col items-center">
                  <div className="w-full text-center py-1.5 rounded bg-white border border-[#d2dfd8] text-[#202a2a] font-semibold">
                    {step}
                  </div>
                  {idx < 5 && <ArrowDown size={11} className="text-[#37735a] my-0.5" />}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-xs font-sans text-[#34714f] font-medium">
            Probes decision boundaries, catches unauthorized actions, and validates invariants.
          </p>
        </div>
      </div>
    </section>
  );
}
