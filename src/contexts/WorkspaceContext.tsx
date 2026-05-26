"use client";

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WorkspaceInfo {
  id:      number;
  name:    string;
  slug:    string;
  logoUrl: string;
  role:    string; // user's role in this workspace
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
      setCurrentId(found ? found.id : (data[0]?.id ?? null));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function switchWorkspace(id: number) {
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem("workspace-id", String(id));
  }

  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0] ?? null;

  // ── Global fetch interceptor ────────────────────────────────────────────────
  // Automatically injects X-Workspace-ID on every /api/ request so all pages
  // benefit without needing individual wsFetch() calls.
  useEffect(() => {
    if (typeof window === "undefined" || !current?.id) return;
    const wsId = current.id;

    // Walk any existing patch chain to find the real native fetch
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
      if (url.startsWith("/api/")) {
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
  }, [current?.id]);

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
