"use client";

import {
  createContext, useContext, useEffect, useRef, useState, useCallback,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WorkspaceInfo {
  id:          number;
  name:        string;
  slug:        string;
  logoUrl:     string;
  role:        string; // user's role in this workspace
  accentColor?: string;
}

// Apply accent color CSS variable to document root
function applyAccent(color?: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (color) {
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-hover", color);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-hover");
  }
}

interface WorkspaceCtx {
  workspaces:       WorkspaceInfo[];
  current:          WorkspaceInfo | null;
  switchWorkspace:  (id: number) => void;
  loading:          boolean;
  refresh:          () => Promise<void>;
  /** Fetch wrapper that automatically injects X-Workspace-ID header */
  wsFetch:          (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

const WorkspaceContext = createContext<WorkspaceCtx>({
  workspaces: [], current: null,
  switchWorkspace: () => {},
  loading: true,
  refresh: async () => {},
  wsFetch: (input, init) => fetch(input, init),
});

export function useWorkspace() { return useContext(WorkspaceContext); }

// ─── Provider ─────────────────────────────────────────────────────────────────
export function WorkspaceProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId:   string | undefined;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [currentId,  setCurrentId]  = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res  = await fetch("/api/workspace");
      const data = await res.json() as WorkspaceInfo[];
      if (!Array.isArray(data)) return;
      setWorkspaces(data);

      // Restore last-used workspace from localStorage
      const stored = typeof window !== "undefined"
        ? localStorage.getItem("workspace-id")
        : null;
      const found = stored ? data.find((w) => String(w.id) === stored) : null;
      const active = found ?? data[0] ?? null;
      setCurrentId(active ? active.id : null);

      // Apply accent color for the active workspace
      applyAccent(active?.accentColor);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function switchWorkspace(id: number) {
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem("workspace-id", String(id));
    const found = workspaces.find((w) => w.id === id);
    applyAccent(found?.accentColor);
  }

  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0] ?? null;

  // ── Ref keeps the active workspace ID current without stale-closure issues ──
  // Updated synchronously during every render, so the interceptor below always
  // reads the right value even on the first fetch after a workspace switch.
  const wsIdRef = useRef<number | null>(null);
  wsIdRef.current = current?.id ?? null;

  // ── Global fetch interceptor — installed once on mount ────────────────────
  // All /api/ calls get X-Workspace-ID injected from the ref above, so every
  // page component re-fetches data for the correct workspace after a switch
  // without needing individual wsFetch() changes.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Walk any existing patch chain to reach the true native fetch
    let native: typeof window.fetch = window.fetch;
    while ((native as { __ws_native__?: typeof fetch }).__ws_native__) {
      native = (native as { __ws_native__?: typeof fetch }).__ws_native__!;
    }

    const patched = function (
      input: Parameters<typeof fetch>[0],
      init:  Parameters<typeof fetch>[1] = {},
    ) {
      const url =
        typeof input === "string" ? input :
        input instanceof URL      ? input.href :
        (input as Request).url;
      const wsId = wsIdRef.current;
      if (url.startsWith("/api/") && wsId) {
        const headers = new Headers(init?.headers);
        if (!headers.has("x-workspace-id"))
          headers.set("x-workspace-id", String(wsId));
        return native(input, { ...init, headers });
      }
      return native(input, init);
    } as typeof window.fetch;

    (patched as { __ws_native__?: typeof fetch }).__ws_native__ = native;
    window.fetch = patched;
    return () => { window.fetch = native; };
  }, []); // ← intentionally empty: install once, ref keeps value fresh

  /** Fetch wrapper that injects X-Workspace-ID so API routes can guard by workspace */
  function wsFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    const wsId = current?.id;
    if (!wsId) return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set("x-workspace-id", String(wsId));
    return fetch(input, { ...init, headers });
  }

  return (
    <WorkspaceContext.Provider value={{ workspaces, current, switchWorkspace, loading, refresh: load, wsFetch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
