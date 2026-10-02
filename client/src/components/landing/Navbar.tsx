import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full transition-all duration-300">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3 pb-2">
        <nav
          aria-label="Main Navigation"
          className={`flex h-14 items-center justify-between px-4 sm:px-6 rounded-xl transition-all duration-300 ${
            isScrolled
              ? "bg-white/90 backdrop-blur-md border border-[#dfe5df] shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
              : "bg-white/60 backdrop-blur-xs border border-[#dfe5df]/70"
          }`}
        >
          {/* Left: Brand Identity */}
          <Link to="/" className="flex items-center gap-3 group focus-visible:outline-none">
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e7efeb] border border-[#d2dfd8] transition-transform duration-300 group-hover:scale-105">
              <img
                src="/logo.png"
                alt="AdverSight logo"
                className="size-9 object-contain"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-[#202a2a] tracking-tight font-sans group-hover:text-[#2c674f] transition-colors">
                AdverSight
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 border-l border-[#dfe5df] pl-2.5 font-mono text-[10px] uppercase tracking-wider text-[#65736d]">
                <span className="size-1.5 rounded-full bg-[#37735a] animate-pulse" />
                Autonomous QA
              </span>
            </div>
          </Link>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-7 text-xs font-medium text-[#65736d]">
            <a
              href="#how-it-works"
              className="hover:text-[#202a2a] transition-colors"
            >
              How it works
            </a>
            <a
              href="#capabilities"
              className="hover:text-[#202a2a] transition-colors"
            >
              Capabilities
            </a>
            <a
              href="#evidence"
              className="hover:text-[#202a2a] transition-colors"
            >
              Failure evidence
            </a>
          </div>

          {/* Right: Nested Island Button */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="group relative inline-flex items-center gap-2 pl-3.5 pr-1.5 py-1.5 rounded-lg text-xs font-semibold bg-[#202a2a] text-white hover:bg-[#2c674f] shadow-xs active:scale-[0.98] transition-all duration-200"
            >
              <span>Open Console</span>
              <span className="size-6 rounded-md bg-white/15 flex items-center justify-center text-white transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight size={13} strokeWidth={2.5} />
              </span>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden size-8 inline-flex items-center justify-center rounded-lg border border-[#dfe5df] text-[#586660] hover:bg-[#f3f5f2]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="md:hidden mx-4 mt-1 rounded-xl border border-[#dfe5df] bg-white p-4 shadow-lg text-sm space-y-3"
          >
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-[#65736d] hover:text-[#202a2a]"
            >
              How it works
            </a>
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-[#65736d] hover:text-[#202a2a]"
            >
              Capabilities
            </a>
            <a
              href="#evidence"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-[#65736d] hover:text-[#202a2a]"
            >
              Failure evidence
            </a>
            <div className="pt-2 border-t border-[#edf0ed]">
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#202a2a] py-2 text-xs font-semibold text-white"
              >
                <span>Enter Console</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
