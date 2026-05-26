"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace, WorkspaceInfo } from "@/contexts/WorkspaceContext";

// ─── Chevron icon ─────────────────────────────────────────────────────────────
function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ─── Workspace avatar ─────────────────────────────────────────────────────────
function WsAvatar({ ws, size = "sm" }: { ws: WorkspaceInfo; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-8 h-8" : "w-6 h-6";
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
  return (
    <div
      className={`${dim} rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0`}
    >
      <span className={`text-white font-bold ${text}`}>{initials}</span>
    </div>
  );
}

// ─── WorkspaceSwitcher ────────────────────────────────────────────────────────
export function WorkspaceSwitcher() {
  const { workspaces, current, switchWorkspace, loading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading || !current) {
    return (
      <div className="px-3 py-2.5">
        <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const roleLabel: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    SPECIALIST: "Specialist",
    OPERATIONS: "Operations",
    VIEWER: "Viewer",
  };

  return (
    <div ref={ref} className="relative px-3 py-2.5">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-50 border border-gray-200 bg-white transition-colors group"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <WsAvatar ws={current} size="md" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{current.name}</p>
          <p className="text-[10px] text-gray-400 leading-tight">{roleLabel[current.role] ?? current.role}</p>
        </div>
        <ChevronDown
          className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden">
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Workspaces
          </p>
          <ul role="listbox">
            {workspaces.map((ws) => (
              <li key={ws.id} role="option" aria-selected={ws.id === current.id}>
                <button
                  onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                >
                  <WsAvatar ws={ws} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-700 truncate">{ws.name}</p>
                    <p className="text-[10px] text-gray-400">{roleLabel[ws.role] ?? ws.role}</p>
                  </div>
                  {ws.id === current.id && <CheckIcon className="text-indigo-500" />}
                </button>
              </li>
            ))}
          </ul>

          {/* New workspace — only shown for owners */}
          {workspaces.some((w) => w.role === "OWNER") && (
            <>
              <div className="h-px bg-gray-100 mx-2 my-1" />
              <button
                onClick={() => { setOpen(false); window.location.href = "/workspace/new"; }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <PlusIcon className="text-gray-400" />
                New workspace
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
