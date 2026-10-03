import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 48);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#capabilities", label: "Capabilities" },
    { href: "#evidence", label: "Failure evidence" },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      setMobileMenuOpen(false);
      if (href === "#hero") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.history.pushState(null, "", window.location.pathname);
        return;
      }
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", href);
      }
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full transition-all duration-500">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 pb-2">
        <nav
          aria-label="Main Navigation"
          className={`flex h-14 items-center justify-between px-5 sm:px-6 rounded-2xl transition-all duration-500 ${
            isScrolled
              ? "bg-[#f8faf8]/85 backdrop-blur-xl border border-[#dfe5df] shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
              : "bg-transparent border border-transparent"
          }`}
        >
          {/* Brand — clicks scroll to hero section */}
          <a
            href="#hero"
            onClick={(e) => handleNavClick(e, "#hero")}
            className="flex items-center gap-3 group focus-visible:outline-none cursor-pointer"
            aria-label="AdverSight - scroll to top"
          >
            <div
              className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-all duration-500 group-hover:scale-105 ${
                isScrolled
                  ? "bg-[#e7efeb] border border-[#d2dfd8]"
                  : "bg-white/30 border border-white/40 backdrop-blur-sm"
              }`}
            >
              <img
                src="/logo.png"
                alt="AdverSight logo"
                className="size-9 object-contain"
              />
            </div>
            <span
              className={`text-[15px] font-bold tracking-tight font-sans transition-colors duration-300 text-[#202a2a] group-hover:text-[#2c674f]`}
            >
              AdverSight
            </span>
          </a>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-7 text-xs font-medium">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className={`transition-colors duration-200 hover:text-[#2c674f] cursor-pointer ${
                  isScrolled ? "text-[#65736d]" : "text-[#3a4e46]"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Right CTA */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className={`group relative inline-flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs active:scale-[0.98] transition-all duration-300 ${
                isScrolled
                  ? "bg-[#202a2a] text-white hover:bg-[#2c674f]"
                  : "bg-[#202a2a]/90 text-white hover:bg-[#2c674f] backdrop-blur-sm"
              }`}
            >
              <span>Open Console</span>
              <span className="size-6 rounded-lg bg-white/15 flex items-center justify-center transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight size={13} strokeWidth={2.5} />
              </span>
            </Link>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden size-8 inline-flex items-center justify-center rounded-lg transition-colors ${
                isScrolled
                  ? "border border-[#dfe5df] text-[#586660] hover:bg-[#f3f5f2]"
                  : "border border-white/30 text-[#3a4e46] hover:bg-white/20"
              }`}
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
            className="md:hidden mx-4 mt-1 rounded-2xl border border-[#dfe5df] bg-[#f8faf8]/95 backdrop-blur-xl p-4 shadow-xl text-sm space-y-3"
          >
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="block py-1.5 text-xs font-medium text-[#65736d] hover:text-[#202a2a] transition-colors cursor-pointer"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 border-t border-[#edf0ed]">
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#202a2a] py-2.5 text-xs font-semibold text-white"
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
