"use client";

/**
 * PermissionDebugPanel
 *
 * Dev-only floating panel that shows:
 *   - Active workspace
 *   - Current role
 *   - All granted permissions
 *
 * Only renders when process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === "true".
 * Toggle visibility with the 🔐 button (bottom-right corner).
 */

import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePermission } from "@/contexts/PermissionContext";
import { PERMISSION_CATEGORIES } from "@/lib/permissions";

const ENABLED = process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === "true";

const ROLE_COLOR: Record<string, string> = {
  OWNER:      "bg-violet-100 text-violet-700",
  ADMIN:      "bg-blue-100 text-blue-700",
  OPERATIONS: "bg-amber-100 text-amber-700",
  SPECIALIST: "bg-emerald-100 text-emerald-700",
  ANALYST:    "bg-cyan-100 text-cyan-700",
  VIEWER:     "bg-gray-100 text-gray-600",
  CLIENT:     "bg-pink-100 text-pink-700",
};

export function PermissionDebugPanel() {
  const [open, setOpen] = useState(false);
  const { current }                        = useWorkspace();
  const { role, permissions, memberId, loading } = usePermission();

  if (!ENABLED) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Permission Debug Panel"
        className="fixed bottom-4 right-4 z-[9998] w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center text-base shadow-lg hover:bg-gray-700 transition-colors"
      >
        🔐
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-[9999] w-80 max-h-[70vh] bg-gray-950 text-gray-100 rounded-2xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden text-[11px] font-mono">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-900">
            <span className="font-bold text-xs text-white">🔐 Permission Debug</span>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>

          <div className="overflow-y-auto p-4 space-y-4">
            {/* Workspace */}
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Workspace</p>
              <p className="text-white font-semibold">
                {current ? `[${current.id}] ${current.name}` : "—"}
              </p>
            </div>

            {/* Role */}
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Role</p>
              {role ? (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_COLOR[role] ?? "bg-gray-700 text-gray-300"}`}>
                  {role}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
              )}
              <span className="ml-2 text-gray-500">memberId={memberId ?? "—"}</span>
            </div>

            {/* Permissions by category */}
            <div>
              <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-2">
                Permissions ({loading ? "loading…" : `${permissions.size} granted`})
              </p>
              {loading ? (
                <p className="text-gray-600 italic">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {PERMISSION_CATEGORIES.map(({ label, perms }) => {
                    const granted = perms.filter((p) => permissions.has(p));
                    const denied  = perms.filter((p) => !permissions.has(p));
                    return (
                      <div key={label}>
                        <p className="text-gray-400 text-[10px] mb-1 font-bold">{label}</p>
                        <div className="space-y-0.5">
                          {granted.map((p) => (
                            <div key={p} className="flex items-center gap-1.5 text-emerald-400">
                              <span>✓</span><span>{p}</span>
                            </div>
                          ))}
                          {denied.map((p) => (
                            <div key={p} className="flex items-center gap-1.5 text-gray-600">
                              <span>✗</span><span>{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
