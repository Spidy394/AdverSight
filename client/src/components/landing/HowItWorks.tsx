import { motion, useReducedMotion } from "motion/react";
import { Terminal, Eye, ShieldAlert, RotateCcw, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export function HowItWorks() {
  const reduceMotion = useReducedMotion();

  const steps = [
    {
      num: "01",
      title: "Autonomous Probing",
      subtitle: "Multi-turn State Drift",
      desc: "Dispatches dynamic conversations that progressively probe behavioral boundaries, persona resilience, and prompt injection thresholds.",
      icon: Terminal,
      code: "probe_engine.dispatch({\n  strategy: 'GOAL_HIJACKING',\n  depth: 6,\n  target: ':9000/chat'\n})",
    },
    {
      num: "02",
      title: "Wiretap Observation",
      subtitle: "Full Cognitive Telemetry",
      desc: "Captures every internal step: intermediate LLM reasoning tokens, tool invocations, parameters sent to external APIs, and state memory.",
      icon: Eye,
      code: "wiretap.intercept({\n  tool: 'cancel_flight',\n  params: { flight_id: 'BA-204' },\n  latency_ms: 148\n})",
    },
    {
      num: "03",
      title: "Invariant Detection",
      subtitle: "Policy & Safety Guardrails",
      desc: "Evaluates intercepted tool actions against declarative security invariants. Flagging unauthorized mutations before production damage.",
      icon: ShieldAlert,
      code: "invariant.assert({\n  rule: 'CONFIRMATION_REQUIRED',\n  tool: 'cancel_flight',\n  status: 'BREACH'\n})",
      highlight: true,
    },
    {
      num: "04",
      title: "1-Click Regression Freeze",
      subtitle: "Deterministic Replay Suites",
      desc: "Freezes caught failures into permanent regression artifacts. Re-run identical adversarial trajectories in CI/CD before any deployment.",
      icon: RotateCcw,
      code: "suite.freeze({\n  trace_id: 'tr_live_948',\n  tags: ['auth', 'unauthorized'],\n  replay_ready: true\n})",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto border-t border-[#dfe5df] scroll-mt-16">
      {/* Editorial Header */}
      <div className="max-w-3xl mb-16 sm:mb-20">
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-mono uppercase tracking-widest text-[#2c674f] font-semibold block mb-3"
        >
          Operational Lifecycle
        </motion.span>
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-[#202a2a] leading-[1.08]"
        >
          From probe to proof. <br className="hidden sm:inline" />
          <span className="text-[#202a2a]/60">The continuous QA loop.</span>
        </motion.h2>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-6 text-base sm:text-lg text-[#52635c] leading-relaxed max-w-2xl font-normal"
        >
          Four synchronized steps that turn unstructured agent interactions into rigorous,
          reproducible security and compliance guarantees.
        </motion.p>
      </div>

      {/* 4-Card Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.num}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: index * 0.1 }}
              className={`rounded-[2rem] border p-7 sm:p-9 flex flex-col justify-between transition-all duration-300 ${
                step.highlight
                  ? "border-[#2c674f]/35 bg-gradient-to-b from-[#f2f7f4] via-white to-[#f9faf9] shadow-[0_20px_40px_-15px_rgba(44,103,79,0.06)] hover:shadow-lg"
                  : "border-[#dfe5df] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.02)] hover:shadow-md hover:border-[#cfd8cf]"
              }`}
            >
              <div>
                {/* Step Top Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-[#edf0ed] mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`size-9 rounded-xl flex items-center justify-center ${
                      step.highlight ? "bg-[#2c674f] text-white" : "bg-[#f1f4f1] text-[#2c674f]"
                    }`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-[#849089] block font-semibold">PHASE {step.num}</span>
                      <span className="text-xs font-mono font-bold text-[#202a2a]">{step.subtitle}</span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#849089]">
                    {step.num}
                  </span>
                </div>

                {/* Title & Desc */}
                <h3 className="text-lg sm:text-xl font-sans font-semibold text-[#202a2a] mb-2">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#5a6b63] leading-relaxed mb-6">
                  {step.desc}
                </p>

                {/* Code snippet simulation */}
                <div className="rounded-xl border border-[#edf0ed] bg-[#fbfbf9] p-3.5 font-mono text-[11px] text-[#2c674f] overflow-x-auto">
                  <pre className="text-[#324b3f] leading-snug">
                    <code>{step.code}</code>
                  </pre>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#edf0ed] flex items-center justify-between text-[11px] font-mono text-[#718078]">
                <span>Status: Autonomous Pipeline</span>
                <Link to="/dashboard" className="text-[#2c674f] hover:underline flex items-center gap-1 font-semibold">
                  <span>View Console</span>
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
