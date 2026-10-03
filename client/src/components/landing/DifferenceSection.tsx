import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ShieldCheck, AlertOctagon, Terminal, Layers, Cpu, Database } from "lucide-react";

export function DifferenceSection() {
  const reduceMotion = useReducedMotion();

  const pipeline = [
    { title: "Agent Input", desc: "User prompt, system instructions, session memory", icon: Terminal },
    { title: "Cognitive Context", desc: "Retrieval augmentation, tool schemas, state history", icon: Layers },
    { title: "Tool Dispatch", desc: "API payload generation & execution intents", icon: Cpu },
    { title: "Environment Mutation", desc: "Database writes, payment transactions, external webhooks", icon: Database },
    { title: "Policy Invariant Gate", desc: "AdverSight sandboxing & invariant verification", icon: ShieldCheck, highlight: true },
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
          Architectural Contrast
        </motion.span>
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-[#202a2a] leading-[1.08]"
        >
          Not another prompt tester. <br className="hidden sm:inline" />
          <span className="text-[#202a2a]/60">An agent QA layer.</span>
        </motion.h2>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-6 text-base sm:text-lg text-[#52635c] leading-relaxed max-w-2xl font-normal"
        >
          Prompt evaluators grade semantic tone and grammar. AdverSight intercepts
          the real-world mechanics: parameters sent to APIs, database mutations, and
          multi-turn boundary violations.
        </motion.p>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Prompt Evaluation - 4 cols */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:col-span-4 rounded-[2rem] border border-[#dfe5df] bg-white p-7 sm:p-8 flex flex-col justify-between shadow-[0_16px_40px_rgba(0,0,0,0.02)]"
        >
          <div>
            <div className="pb-4 border-b border-[#edf0ed] mb-6 flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#718078] font-semibold">
                PROMPT BENCHMARKING
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f1f3f1] text-[#718078]">
                Surface Level
              </span>
            </div>

            <div className="space-y-4 font-mono text-xs my-8">
              <div className="p-3 rounded-xl border border-[#edf0ed] bg-[#fbfbf9] text-center text-[#586660]">
                User Prompt String
              </div>
              <div className="flex justify-center text-[#99a6a0]">
                &darr; LLM Completion
              </div>
              <div className="p-3 rounded-xl border border-[#edf0ed] bg-[#fbfbf9] text-center text-[#586660]">
                Generated Text Output
              </div>
            </div>

            <p className="text-xs text-[#718078] leading-relaxed">
              Analyzes perplexity, tone, and regex keywords. Unaware of backend state, authorized credentials, or tool side-effects.
            </p>
          </div>

          <div className="mt-8 pt-4 border-t border-[#edf0ed] flex items-center gap-2 text-[11px] font-mono text-[#913b2c]">
            <AlertOctagon size={13} />
            <span>Blind to API mutations</span>
          </div>
        </motion.div>

        {/* Right: Full Cognitive Loop Layer - 8 cols */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-8 rounded-[2rem] border border-[#2c674f]/25 bg-white p-7 sm:p-9 flex flex-col justify-between shadow-[0_20px_48px_-15px_rgba(44,103,79,0.05)]"
        >
          <div>
            <div className="pb-4 border-b border-[#edf0ed] mb-6 flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#2c674f] font-bold flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#37735a]" />
                ADVERSIGHT AGENT QA SYSTEM
              </span>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#e6f1ea] text-[#2c674f] font-semibold">
                End-to-End Interception
              </span>
            </div>

            {/* Stepped cognitive pipeline */}
            <div className="space-y-3 mb-6">
              {pipeline.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      item.highlight
                        ? "border-[#2c674f]/40 bg-[#f2f7f4] text-[#202a2a] shadow-xs"
                        : "border-[#edf0ed] bg-[#fafbfa] hover:bg-white text-[#2a3530]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.highlight ? "bg-[#2c674f] text-white" : "bg-white border border-[#dfe5df] text-[#52635c]"
                      }`}>
                        <Icon size={14} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-[#202a2a]">{item.title}</span>
                          <span className="text-[10px] font-mono text-[#849089]">0{idx + 1}</span>
                        </div>
                        <p className="text-xs text-[#65736d] font-sans mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                    {item.highlight && (
                      <span className="self-start sm:self-center font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#2c674f] border border-[#2c674f]/30">
                        INVARIANT SHIELD
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[#edf0ed] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-[#2c674f]">
            <span>Automated sandboxing on every tool invocation</span>
            <span className="font-semibold flex items-center gap-1">
              Zero Production Leaks <ArrowRight size={12} />
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
