"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PermissionDebugPanel } from "@/components/PermissionDebugPanel";

// Routes that should render without the app shell (no sidebar)
const SHELL_LESS_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { current } = useWorkspace();

  const isShellLess = SHELL_LESS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (isShellLess) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-[#0f1115]">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#f4f5f7] dark:bg-[#0f1115]">
        {/*
          key={current?.id} forces every page component to unmount + remount
          whenever the active workspace changes, so all useEffect(() => fetchData(), [])
          hooks re-run automatically — no manual refresh needed.
        */}
        <div key={current?.id ?? 0} className="p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>

      {/* Dev-only permission debug panel — toggle with 🔐 button (bottom-right) */}
      <PermissionDebugPanel />
    </div>
  );
}
