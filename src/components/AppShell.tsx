"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useBranding } from "@/contexts/BrandingContext";
import { PermissionDebugPanel } from "@/components/PermissionDebugPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";

// Routes that should render without the app shell (no sidebar)
const SHELL_LESS_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { current } = useWorkspace();
  const { brand }   = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);

  const brandName   = brand.brandName   || "Praise Agency";
  const brandSystem = brand.brandSystem || "Affiliate Manager";

  const isShellLess = SHELL_LESS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (isShellLess) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full bg-background">

      {/* ── Sidebar (desktop: static | mobile: fixed drawer) ── */}
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* ── Mobile backdrop overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main content area ── */}
      <main className="flex-1 overflow-auto bg-background min-w-0 flex flex-col">

        {/* Mobile top bar (hidden on lg+) */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-border bg-surface/90 backdrop-blur-md shrink-0">
          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-subtle transition-colors"
            aria-label="Buka menu navigasi"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand wordmark */}
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">{brandName.slice(0, 2)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate leading-tight">{brandSystem}</p>
            </div>
          </div>

          {/* Notification bell (mobile header) */}
          <NotificationBell />
        </header>

        {/* Page content */}
        {/*
          key={current?.id} forces every page component to unmount + remount
          whenever the active workspace changes, so all useEffect fetch hooks re-run.
        */}
        <ErrorBoundary key={current?.id ?? 0}>
          <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto w-full flex-1">
            {children}
          </div>
        </ErrorBoundary>
      </main>

      {/* Dev-only permission debug panel */}
      <PermissionDebugPanel />
    </div>
  );
}
