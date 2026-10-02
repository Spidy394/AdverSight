export function DomainAgnostic() {
  const agentTypes = [
    "Flight agents",
    "Support agents",
    "Shopping agents",
    "Research agents",
    "Tool-using agents",
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-[#dfe5df] text-center">
      {/* Editorial Headline */}
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202a2a]">
        One QA layer. <br />
        <span className="text-[#37735a]">Any agent.</span>
      </h2>

      <p className="mt-4 text-sm sm:text-base text-[#65736d] max-w-lg mx-auto leading-relaxed">
        Model-agnostic and domain-agnostic. Connect via a standard HTTP JSON endpoint or in-process adapter.
      </p>

      {/* Converging Labels */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 font-mono text-xs">
        {agentTypes.map((type) => (
          <span
            key={type}
            className="px-3.5 py-1.5 rounded-md border border-[#dfe5df] bg-white text-[#2a3530] font-medium shadow-2xs"
          >
            {type}
          </span>
        ))}
        <span className="hidden sm:inline text-[#849089]">&rarr;</span>
        <span className="px-4 py-1.5 rounded-md border border-[#37735a] bg-[#37735a] text-white font-semibold shadow-2xs">
          AdverSight
        </span>
      </div>
    </section>
  );
}
