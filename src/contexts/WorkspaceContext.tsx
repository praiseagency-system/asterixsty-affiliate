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
