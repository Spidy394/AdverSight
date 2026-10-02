import { ArrowRight } from "lucide-react";

export function ProblemSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-[#dfe5df]">
      {/* Editorial Headline */}
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202a2a] text-center">
        AI agents are harder to test <br className="hidden sm:inline" />
        than ordinary software.
      </h2>

      {/* Short Explanatory Paragraph */}
      <p className="mt-4 text-sm sm:text-base text-[#65736d] text-center max-w-xl mx-auto leading-relaxed">
        An agent can produce the right response and still take the wrong action.
        AdverSight tests the behavior around the response.
      </p>

      {/* Clean Minimal Comparison */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Traditional testing */}
        <div className="rounded-lg border border-[#dfe5df] bg-white p-6 shadow-2xs">
          <span className="text-[10.5px] uppercase font-semibold text-[#718078] tracking-wider block mb-3">
            TRADITIONAL TESTING
          </span>
          <div className="flex items-center gap-2 text-sm text-[#2a3530] font-semibold">
            <span>input</span>
            <ArrowRight size={14} className="text-[#849089]" />
            <span>output</span>
          </div>
          <p className="mt-4 text-xs font-sans text-[#718078] leading-normal">
            Deterministic check asserting that a fixed input produces a predictable output.
          </p>
        </div>

        {/* Agent testing */}
        <div className="rounded-lg border border-[#c3dfce] bg-[#f0f6f1] p-6 shadow-2xs">
          <span className="text-[10.5px] uppercase font-semibold text-[#2c674f] tracking-wider block mb-3">
            AGENT TESTING (ADVERSIGHT)
          </span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#202a2a] font-semibold">
            <span>input</span>
            <ArrowRight size={12} className="text-[#2c674f]" />
            <span>context</span>
            <ArrowRight size={12} className="text-[#2c674f]" />
            <span>decision</span>
            <ArrowRight size={12} className="text-[#2c674f]" />
            <span>tool</span>
            <ArrowRight size={12} className="text-[#2c674f]" />
            <span>action</span>
          </div>
          <p className="mt-4 text-xs font-sans text-[#567565] leading-normal">
            Stateful inspection of turn-by-turn memory, tool dispatch, and authorization invariants.
          </p>
        </div>
      </div>
    </section>
  );
}
