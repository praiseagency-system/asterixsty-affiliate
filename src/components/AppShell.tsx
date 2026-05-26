"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

// Routes that should render without the app shell (no sidebar)
const SHELL_LESS_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isShellLess = SHELL_LESS_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (isShellLess) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
