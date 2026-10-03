import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Code2, Globe } from "lucide-react";

export function DomainAgnostic() {
  const reduceMotion = useReducedMotion();

  const frameworks = [
    { name: "Google Gemini Agents", badge: "REST + Function Calling" },
    { name: "LangChain / LangGraph", badge: "StateGraph & Tools" },
    { name: "CrewAI & AutoGen", badge: "Multi-Agent Networks" },
    { name: "Anthropic Claude", badge: "Tool Use & Computer Use" },
    { name: "OpenAI Assistants", badge: "Code Interpreter & Tools" },
    { name: "Custom In-House Runtime", badge: "Standard HTTP / SSE" },
  ];

  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto border-t border-[#dfe5df]">
      {/* Editorial Header */}
      <div className="max-w-3xl mb-16 sm:mb-20">
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-mono uppercase tracking-widest text-[#2c674f] font-semibold block mb-3"
        >
          Interoperability
        </motion.span>
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-[#202a2a] leading-[1.08]"
        >
          One QA layer. <br className="hidden sm:inline" />
          <span className="text-[#202a2a]/60">Any model. Any agent framework.</span>
        </motion.h2>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-6 text-base sm:text-lg text-[#52635c] leading-relaxed max-w-2xl font-normal"
        >
          Whether your agents are powered by Gemini 2.0, Claude 3.5, custom fine-tuned weights, or
          orchestrated via LangGraph or CrewAI—AdverSight integrates via an open HTTP wiretap.
        </motion.p>
      </div>

      {/* 2-Column Split: Frameworks Grid on Left + 3-Line Code Wrapper on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Frameworks list - 7 cols */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:col-span-7 rounded-[2rem] border border-[#dfe5df] bg-white p-7 sm:p-9 flex flex-col justify-between shadow-[0_16px_40px_rgba(0,0,0,0.02)]"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#edf0ed] mb-6">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#718078] font-semibold flex items-center gap-2">
                <Globe size={14} className="text-[#2c674f]" />
                COMPATIBILITY MATRIX
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f1f4f1] text-[#2c674f] font-semibold">
                Universal Adapter
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {frameworks.map((fw) => (
                <div
                  key={fw.name}
                  className="p-3.5 rounded-xl border border-[#edf0ed] bg-[#fbfbf9] hover:bg-white hover:border-[#dfe5df] transition-all flex flex-col justify-between"
                >
                  <span className="font-sans font-semibold text-xs text-[#202a2a]">{fw.name}</span>
                  <span className="font-mono text-[10px] text-[#2c674f] font-medium mt-1">{fw.badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-[#edf0ed] flex items-center justify-between text-[11px] font-mono text-[#718078]">
            <span>Wire format: JSON Schema over HTTP or SSE</span>
            <span className="text-[#2c674f] font-semibold flex items-center gap-1">
              Zero SDK Lock-In <ArrowRight size={12} />
            </span>
          </div>
        </motion.div>

        {/* Right: 3-Line Code Snippet - 5 cols */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-5 rounded-[2rem] border border-[#2c674f]/30 bg-[#1e2723] text-white p-7 sm:p-9 flex flex-col justify-between shadow-[0_20px_48px_-15px_rgba(0,0,0,0.2)]"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6 font-mono text-xs">
              <span className="text-white/70 flex items-center gap-2">
                <Code2 size={13} className="text-[#7bd9b1]" />
                integration.ts
              </span>
              <span className="text-[10px] text-[#7bd9b1] bg-white/10 px-2 py-0.5 rounded">
                TypeScript / Python
              </span>
            </div>

            <pre className="font-mono text-xs text-[#dcebe2] leading-relaxed overflow-x-auto">
              <code>{`import { AdverSight } from "@adversight/qa";

const qa = new AdverSight({
  target: "http://localhost:9000/agent",
  invariants: [
    "require_confirmation_on_mutation",
    "isolated_customer_pii",
    "no_unauthorized_state_drift"
  ]
});

// Run autonomous evaluation suite
const report = await qa.evaluate();`}</code>
            </pre>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between font-mono text-[11px] text-white/60">
            <span>Runs locally or in CI/CD pipeline</span>
            <span className="text-[#7bd9b1]">CI Ready</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
