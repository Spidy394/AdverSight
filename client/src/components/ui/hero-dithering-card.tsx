import { ArrowRight } from "lucide-react";
import { useState, Suspense, lazy } from "react";
import { Link } from "react-router-dom";

/**
 * Lazy-load the Dithering shader to avoid blocking the main bundle.
 * The warp + 4×4 dithering pattern creates a subtle animated texture
 * that activates on hover for an interactive feel.
 */
const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((mod) => ({
    default: mod.Dithering,
  }))
);

export function CTASection() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="py-16 w-full flex justify-center items-center px-4 md:px-6">
      <div
        className="w-full max-w-6xl relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Outer rounded card */}
        <div className="relative overflow-hidden rounded-[40px] border border-[#dfe5df] bg-[#f2f6f3] min-h-[560px] md:min-h-[580px] flex flex-col items-center justify-center transition-shadow duration-500 hover:shadow-[0_8px_48px_rgba(44,103,79,0.08)]">

          {/* Dithering WebGL shader — lazy loaded, pointer-events disabled */}
          <Suspense fallback={<div className="absolute inset-0 bg-[#e3ece7]/30" />}>
            <div
              className="absolute inset-0 z-0 pointer-events-none opacity-35 mix-blend-multiply"
              aria-hidden="true"
            >
              <Dithering
                colorBack="#00000000"
                colorFront="#2c674f"
                shape="warp"
                type="4x4"
                speed={isHovered ? 0.55 : 0.18}
                className="size-full"
                minPixelRatio={1}
              />
            </div>
          </Suspense>

          {/* Content */}
          <div className="relative z-10 px-6 max-w-4xl mx-auto text-center flex flex-col items-center">

            {/* Eyebrow pill */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2c674f]/15 bg-white/60 px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-widest text-[#2c674f] backdrop-blur-sm">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#37735a] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#37735a]" />
              </span>
              Continuous Evaluation
            </div>

            {/* Display headline — serif for editorial weight at large sizes */}
            <h2 className="font-serif text-5xl md:text-7xl lg:text-[84px] font-medium tracking-tight text-[#202a2a] mb-8 leading-[1.04]">
              Your agent passed <br />
              <span className="text-[#202a2a]/70">the tests you wrote.</span>
            </h2>

            {/* Supporting copy */}
            <p className="text-[#65736d] text-lg md:text-xl max-w-2xl mb-12 leading-relaxed font-normal">
              Now test the ones you didn&apos;t. AdverSight autonomously generates
              multi-turn adversarial attacks, detects policy leaks, and freezes
              every failure into a reproducible regression suite.
            </p>

            {/* Primary CTA — pill button with slide arrow animation */}
            <Link
              to="/dashboard"
              className="group inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-full bg-[#202a2a] px-12 text-base font-medium text-white transition-all duration-300 hover:bg-[#2c674f] hover:scale-[1.03] active:scale-[0.97] hover:ring-4 hover:ring-[#2c674f]/20"
            >
              <span>Open Testing Console</span>
              <ArrowRight
                className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
