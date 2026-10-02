import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-[#dfe5df] text-center">
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#202a2a] leading-[1.1] max-w-xl mx-auto">
        Your agent passed the tests you wrote. <br />
        <span className="text-[#37735a]">Now test the ones you didn&apos;t.</span>
      </h2>

      <div className="mt-8 flex justify-center">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-md bg-[#37735a] px-6 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#2c674f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#37735a]"
        >
          <span>Open AdverSight</span>
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
