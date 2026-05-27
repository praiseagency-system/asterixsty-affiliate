"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace, WorkspaceInfo } from "@/contexts/WorkspaceContext";

// ─── Icon primitives ──────────────────────────────────────────────────────────
function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3 h-3 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Workspace avatar ─────────────────────────────────────────────────────────
function WsAvatar({
  ws,
  size = "sm",
  color,
}: {
  ws: WorkspaceInfo;
  size?: "sm" | "md";
  color?: string;
}) {
  const dim  = size === "md" ? "w-8 h-8" : "w-6 h-6";
  const text = size === "md" ? "text-xs" : "text-[10px]";

  if (ws.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ws.logoUrl}
        alt={ws.name}
        className={`${dim} rounded-lg object-cover border border-gray-100 shrink-0`}
      />
    );
  }

  const initials = ws.name.slice(0, 2).toUpperCase();
  const style    = color ? { background: color } : undefined;
  const gradient = !color ? "bg-gradient-to-br from-indigo-500 to-violet-600" : "";

  return (
    <div
      className={`${dim} rounded-lg flex items-center justify-center shrink-0 ${gradient}`}
      style={style}
    >
      <span className={`text-white font-bold ${text}`}>{initials}</span>
    </div>
  );
}

// ─── Preset theme colors ──────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6b7280", // gray
];

// ─── Create Workspace Modal ───────────────────────────────────────────────────
function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const { refresh, switchWorkspace } = useWorkspace();
  const router = useRouter();

  const [name,    setName]    = useState("");
  const [color,   setColor]   = useState("#6366f1");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while modal open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Workspace name is required."); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/workspace", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    trimmedName,
          logoUrl: logoUrl.trim() || "",
          theme:   JSON.stringify({ primaryColor: color }),
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to create workspace.");
        setLoading(false);
        return;
      }

      const created = await res.json() as { id: number };
      await refresh();
      switchWorkspace(created.id);
      onClose();
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  // Derived preview name
  const previewInitials = name.trim().slice(0, 2).toUpperCase() || "WS";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div className="bg-white dark:bg-[#151821] rounded-2xl shadow-2xl dark:shadow-black/60 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a2f3d]">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Create New Workspace</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-[#1d212c] transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Preview avatar */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: color }}
            >
              <span className="text-white text-xl font-bold">{previewInitials}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {name.trim() || "Workspace Name"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Preview</p>
            </div>
          </div>

          {/* Workspace name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Workspace Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="e.g. Asterixsty Perfumery"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#2a2f3d] bg-white dark:bg-[#1d212c] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 focus:border-transparent transition-all"
              autoFocus
            />
          </div>

          {/* Theme color */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
              Theme Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                    color === c ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500 scale-110" : ""
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              {/* Custom color input */}
              <label className="relative w-7 h-7 rounded-lg border-2 border-dashed border-gray-300 dark:border-[#2a2f3d] flex items-center justify-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors overflow-hidden" title="Custom color">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="text-gray-400 dark:text-gray-500 text-xs font-bold leading-none">+</span>
              </label>
            </div>
          </div>

          {/* Logo URL (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Logo URL <span className="text-gray-300 dark:text-gray-600 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#2a2f3d] bg-white dark:bg-[#1d212c] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 focus:border-transparent transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2a2f3d] text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1d212c] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: loading || !name.trim() ? "#9ca3af" : color }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </span>
              ) : (
                "Create Workspace"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── WorkspaceSwitcher ────────────────────────────────────────────────────────
export function WorkspaceSwitcher() {
  const { workspaces, current, switchWorkspace, loading } = useWorkspace();
  const [open,        setOpen]        = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openCreate = useCallback(() => {
    setOpen(false);
    setShowCreate(true);
  }, []);

  if (loading || !current) {
    return (
      <div className="px-3 py-2.5">
        <div className="h-9 rounded-xl bg-gray-100 dark:bg-[#1d212c] animate-pulse" />
      </div>
    );
  }

  const roleLabel: Record<string, string> = {
    OWNER:      "Owner",
    ADMIN:      "Admin",
    SPECIALIST: "Specialist",
    OPERATIONS: "Operations",
    VIEWER:     "Viewer",
  };

  const canCreate = workspaces.some((w) => w.role === "OWNER");

  return (
    <>
      <div ref={ref} className="relative px-3 py-2.5">
        {/* Trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-subtle border border-border bg-surface transition-colors group"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <WsAvatar ws={current} size="md" />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">{current.name}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{roleLabel[current.role] ?? current.role}</p>
          </div>
          <ChevronDown
            className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 bg-surface border border-border rounded-xl shadow-lg py-1 overflow-hidden">
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider">
              Workspaces
            </p>
            <ul role="listbox">
              {workspaces.map((ws) => (
                <li key={ws.id} role="option" aria-selected={ws.id === current.id}>
                  <button
                    onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-subtle transition-colors text-left"
                  >
                    <WsAvatar ws={ws} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate">{ws.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{roleLabel[ws.role] ?? ws.role}</p>
                    </div>
                    {ws.id === current.id && <CheckIcon className="text-indigo-500 dark:text-indigo-400" />}
                  </button>
                </li>
              ))}
            </ul>

            {/* New workspace — only for owners */}
            {canCreate && (
              <>
                <div className="h-px bg-gray-100 dark:bg-[#1e2333] mx-2 my-1" />
                <button
                  onClick={openCreate}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors font-medium"
                >
                  <PlusIcon className="text-indigo-400" />
                  New workspace
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create modal — rendered outside the switcher div so it sits above all */}
      {showCreate && (
        <CreateWorkspaceModal onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}
