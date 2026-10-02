export function FailureTaxonomy() {
  const categories = [
    {
      num: "01",
      name: "Goal hijacking",
      desc: "Diverting the agent away from its designated workflow toward arbitrary tasks.",
    },
    {
      num: "02",
      name: "Identity confusion",
      desc: "Tricking the agent into accepting fake administrative authority or role overrides.",
    },
    {
      num: "03",
      name: "Policy violations",
      desc: "Disregarding safety limits, transaction bounds, or business rules.",
    },
    {
      num: "04",
      name: "Unauthorized actions",
      desc: "Invoking mutating tools or APIs without required affirmative confirmation.",
    },
    {
      num: "05",
      name: "Context manipulation",
      desc: "Injecting false turn history or altered assumptions into memory.",
    },
    {
      num: "06",
      name: "Tool misuse",
      desc: "Calling unregistered tools, fabricating schemas, or leaking sensitive parameters.",
    },
    {
      num: "07",
      name: "Information extraction",
      desc: "Coaxing the agent into revealing internal system prompts, tokens, or customer PII.",
    },
  ];

  return (
    <section id="capabilities" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-[#dfe5df]">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto mb-14">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#567565] font-semibold block mb-2">
          Capabilities
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202a2a]">
          What AdverSight looks for.
        </h2>
        <p className="mt-2 text-sm text-[#65736d]">
          Systematic failure categories inspected across every testing session.
        </p>
      </div>

      {/* Clean 2-Column Editorial Typographic List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
        {categories.map((cat) => (
          <div
            key={cat.num}
            className="group py-3 border-b border-[#edf0ed] flex items-baseline gap-4 hover:border-[#dfe5df] transition-colors"
          >
            <span className="font-mono text-xs font-semibold text-[#849089] group-hover:text-[#2c674f] transition-colors">
              {cat.num}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#202a2a] group-hover:text-[#2c674f] transition-colors">
                {cat.name}
              </h3>
              <p className="mt-1 text-xs text-[#718078] leading-relaxed">
                {cat.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
