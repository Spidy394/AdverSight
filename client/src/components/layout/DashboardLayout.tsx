import { type ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Three-column dashboard layout for laptop/desktop.
 * Left: config panel   Center: live session   Right: results/failures
 * Bottom: observability log (full-width)
 *
 * Collapses to single-column on tablet and below.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
