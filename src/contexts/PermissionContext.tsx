"use client";

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PermissionCtx {
  permissions: Set<string>;
  role:        string;
  memberId:    number | null;
  loading:     boolean;
  /** Returns true if the user has ALL listed permissions */
  can:         (...perms: string[]) => boolean;
  /** Returns true if the user has AT LEAST ONE of the listed permissions */
  canAny:      (...perms: string[]) => boolean;
  refresh:     () => Promise<void>;
}

const defaultCtx: PermissionCtx = {
  permissions: new Set(),
  role:        "",
  memberId:    null,
  loading:     true,
  can:         () => false,
  canAny:      () => false,
  refresh:     async () => {},
};

const PermissionContext = createContext<PermissionCtx>(defaultCtx);

export function usePermission() { return useContext(PermissionContext); }

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PermissionProvider({ children }: { children: ReactNode }) {
  const { current, setCanHelpers } = useWorkspace();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [role,        setRole]        = useState("");
  const [memberId,    setMemberId]    = useState<number | null>(null);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    if (!current?.id) {
      setLoading(false);
      setPermissions(new Set());
      setRole("");
      setMemberId(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/permissions?workspaceId=${current.id}`);
      if (res.ok) {
        const data = await res.json() as {
          role:        string;
          memberId:    number | null;
          permissions: string[];
        };
        setPermissions(new Set(data.permissions ?? []));
        setRole(data.role ?? "");
        setMemberId(data.memberId ?? null);
      }
    } catch {
      // Non-fatal — keep previous permission set
    } finally {
      setLoading(false);
    }
  }, [current?.id]);

  // Re-fetch whenever active workspace changes
  useEffect(() => { void load(); }, [load]);

  function can(...perms: string[]): boolean {
    // OWNER always has full access (belt-and-suspenders for UI)
    if (role === "OWNER") return true;
    return perms.every((p) => permissions.has(p));
  }

  function canAny(...perms: string[]): boolean {
    if (role === "OWNER") return true;
    return perms.some((p) => permissions.has(p));
  }

  // Keep WorkspaceContext helpers in sync so pages that pull from
  // useWorkspace() can also call can() / canAny() directly.
  useEffect(() => {
    setCanHelpers(can, canAny);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, role]);

  return (
    <PermissionContext.Provider
      value={{ permissions, role, memberId, loading, can, canAny, refresh: load }}
    >
      {children}
    </PermissionContext.Provider>
  );
}
