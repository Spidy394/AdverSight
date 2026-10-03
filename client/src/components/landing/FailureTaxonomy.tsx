import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck, Compass, UserX, AlertOctagon, Key, Database, FileCode, Unlock } from "lucide-react";

export function FailureTaxonomy() {
  const reduceMotion = useReducedMotion();

  const categories = [
    {
      num: "01",
      name: "Goal Hijacking",
      invariant: "Workflow Determinism",
      desc: "Diverting the agent away from authorized mission workflows toward unvetted tasks or endless lateral exploration.",
      icon: Compass,
    },
    {
      num: "02",
      name: "Identity Confusion",
      invariant: "Role & Permission Boundary",
      desc: "Tricking the agent into honoring synthetic administrative authority, bypass codes, or role elevation claims.",
      icon: UserX,
    },
    {
      num: "03",
      name: "Policy Invariant Drift",
      invariant: "Business Rule Bounds",
      desc: "Violating declarative business logic: refund ceilings, transactional thresholds, or geographic restrictions.",
      icon: AlertOctagon,
    },
    {
      num: "04",
      name: "Unauthorized Mutations",
      invariant: "Side-Effect Isolation",
      desc: "Executing mutating database writes, fund transfers, or email dispatches without user confirmation.",
      icon: Unlock,
    },
    {
      num: "05",
      name: "Context Poisoning",
      invariant: "State Memory Integrity",
      desc: "Injecting false preceding turns into agent memory to warp subsequent decision logic over multi-turn conversations.",
      icon: Database,
    },
    {
      num: "06",
      name: "Tool Schema Misuse",
      invariant: "Tool Argument Schema",
      desc: "Fabricating imaginary parameters, leaking internal tokens in arguments, or invoking unregistered endpoints.",
      icon: FileCode,
    },
    {
      num: "07",
      name: "Information Extraction",
      invariant: "PII & Secret Confidentiality",
      desc: "Coaxing the model into disclosing system prompts, internal tool documentation, API keys, or customer PII.",
      icon: Key,
    },
  ];

  return (
    <section id="capabilities" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto border-t border-[#dfe5df] scroll-mt-16">
      {/* Editorial Header */}
      <div className="max-w-3xl mb-16 sm:mb-20">
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-mono uppercase tracking-widest text-[#2c674f] font-semibold block mb-3"
        >
          Capabilities & Invariants
        </motion.span>
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-[#202a2a] leading-[1.08]"
        >
          What AdverSight probes. <br className="hidden sm:inline" />
          <span className="text-[#202a2a]/60">The comprehensive vulnerability taxonomy.</span>
        </motion.h2>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-6 text-base sm:text-lg text-[#52635c] leading-relaxed max-w-2xl font-normal"
        >
          Seven foundational attack categories autonomously generated, exercised across multi-turn
          journeys, and validated against verifiable safety invariants.
        </motion.p>
      </div>

      {/* Grid of Capability Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat, idx) => {
          const Icon = cat.icon;
          return (
            <motion.div
              key={cat.num}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.06 }}
              className="group rounded-[1.75rem] border border-[#dfe5df] bg-white p-7 flex flex-col justify-between shadow-[0_12px_32px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-[#2c674f]/40 hover:-translate-y-[2px] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-[#edf0ed] mb-5">
                  <div className="size-9 rounded-xl bg-[#f2f6f3] text-[#2c674f] flex items-center justify-center transition-colors group-hover:bg-[#2c674f] group-hover:text-white">
                    <Icon size={16} />
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#849089]">
                    CAT_{cat.num}
                  </span>
                </div>

                <div className="mb-2">
                  <span className="text-[10px] font-mono text-[#2c674f] font-semibold uppercase tracking-wider block">
                    {cat.invariant}
                  </span>
                  <h3 className="text-base font-semibold text-[#202a2a] group-hover:text-[#2c674f] transition-colors">
                    {cat.name}
                  </h3>
                </div>

                <p className="text-xs text-[#52635c] leading-relaxed mt-2">
                  {cat.desc}
                </p>
              </div>

              <div className="mt-6 pt-3.5 border-t border-[#edf0ed] flex items-center justify-between text-[11px] font-mono text-[#718078]">
                <span>Invariant Protected</span>
                <ShieldCheck size={13} className="text-[#37735a]" />
              </div>
            </motion.div>
          );
        })}

        {/* 8th Tile: Custom Invariant Extensibility */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="rounded-[1.75rem] border border-dashed border-[#2c674f]/35 bg-[#f4f8f5]/60 p-7 flex flex-col justify-between"
        >
          <div>
            <div className="pb-3.5 border-b border-[#dcebe2] mb-5">
              <span className="font-mono text-xs font-semibold text-[#2c674f]">
                + EXTENSIBILITY
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#202a2a] mb-2">
              Custom Domain Invariants
            </h3>
            <p className="text-xs text-[#52635c] leading-relaxed">
              Define proprietary invariants in simple TypeScript or Python schemas. Check HIPAA compliance, KYC rules, or specific ERP transaction limits.
            </p>
          </div>

          <div className="mt-6 pt-3.5 border-t border-[#dcebe2] text-[11px] font-mono text-[#2c674f] font-semibold">
            Define in Config &bull; Instant Enforcement
          </div>
        </motion.div>
      </div>
    </section>
  );
}
