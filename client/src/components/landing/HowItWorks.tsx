export function HowItWorks() {
  const steps = [
    {
      num: "01",
      name: "PROBE",
      desc: "Probe the agent with normal, adversarial and edge-case inputs.",
    },
    {
      num: "02",
      name: "OBSERVE",
      desc: "Observe responses, conversational context and tool usage.",
    },
    {
      num: "03",
      name: "DETECT",
      desc: "Detect policy, behavioral and action-level invariant failures.",
    },
    {
      num: "04",
      name: "REPLAY",
      desc: "Turn failures into exact reproducible test cases.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-[#dfe5df]">
      <div className="text-center max-w-xl mx-auto mb-16">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#567565] font-semibold block mb-2">
          How it works
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202a2a]">
          From probe to proof.
        </h2>
        <p className="mt-2 text-sm text-[#65736d]">
          A continuous loop that tests agent behavior and validates safety guardrails.
        </p>
      </div>

      {/* 4 Steps Connected by a Thin Line */}
      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 font-mono text-xs">
        {/* Horizontal Connecting Line (Desktop) */}
        <div className="hidden lg:block absolute top-7 left-12 right-12 h-px bg-[#dfe5df] -z-0" />

        {steps.map((step) => (
          <div key={step.num} className="relative z-10 flex flex-col items-start sm:items-center text-left sm:text-center">
            {/* Step Number Circle */}
            <div className="size-10 rounded-full border border-[#dfe5df] bg-white flex items-center justify-center font-bold text-xs text-[#2c674f] shadow-2xs mb-4">
              {step.num}
            </div>

            {/* Step Name */}
            <h3 className="font-semibold text-sm text-[#202a2a] mb-2 tracking-wide">
              {step.name}
            </h3>

            {/* Step Description */}
            <p className="text-xs font-sans text-[#65736d] leading-relaxed">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
