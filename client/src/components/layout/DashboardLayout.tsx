import { type ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Technical workspace layout for AdverSight.
 * Desktop/laptop first, responsive down to tablet.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#080B12] text-zinc-100 flex flex-col font-sans">
      {children}
    </div>
  );
}
