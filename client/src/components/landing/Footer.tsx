import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-[#dfe5df] bg-white py-14 px-4 sm:px-6 lg:px-8 text-xs font-mono">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <span className="font-sans font-bold text-sm text-[#202a2a] block mb-1">
            AdverSight
          </span>
          <p className="font-sans text-xs text-[#718078]">
            Autonomous QA for AI agents.
          </p>
        </div>

        <nav aria-label="Footer links" className="flex items-center gap-6 text-[#65736d]">
          <a href="#how-it-works" className="hover:text-[#202a2a] transition-colors">
            How it works
          </a>
          <a href="#capabilities" className="hover:text-[#202a2a] transition-colors">
            Capabilities
          </a>
          <Link to="/dashboard" className="text-[#2c674f] font-semibold hover:text-[#254f40] transition-colors">
            Console &rarr;
          </Link>
        </nav>

        <div className="text-[#849089]">
          BugLordz &bull; HackSpire &apos;26
        </div>
      </div>
    </footer>
  );
}
