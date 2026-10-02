import { type ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Technical workspace layout for AdverSight.
 * Light editorial product design, desktop/laptop first, responsive down to tablet.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#f8faf8] text-[#202a2a] flex flex-col font-sans">
      {children}
    </div>
  );
}
