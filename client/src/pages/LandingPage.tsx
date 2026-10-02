import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { DifferenceSection } from "@/components/landing/DifferenceSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FailureEvidence } from "@/components/landing/FailureEvidence";
import { FailureTaxonomy } from "@/components/landing/FailureTaxonomy";
import { DomainAgnostic } from "@/components/landing/DomainAgnostic";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8faf8] text-[#202a2a] selection:bg-[#dcebe2] selection:text-[#2c674f] antialiased font-sans">
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <DifferenceSection />
        <HowItWorks />
        <FailureEvidence />
        <FailureTaxonomy />
        <DomainAgnostic />
        <ProductPreview />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
