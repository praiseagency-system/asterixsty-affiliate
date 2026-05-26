"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member {
  id:          number;
  workspaceId: number;
  userId:      string | null;
  inviteEmail: string;
  role:        string;
  status:      string;
  createdAt:   string;
  user?: {
    id:    string;
    name:  string | null;
    email: string | null;
    image: string | null;
  };
}

const ROLES = ["OWNER", "ADMIN", "OPERATIONS", "SPECIALIST", "VIEWER"] as const;
type Role = typeof ROLES[number];

const ROLE_COLOR: Record<Role, string> = {
  OWNER:      "bg-violet-100 text-violet-700",
  ADMIN:      "bg-blue-100 text-blue-700",
  OPERATIONS: "bg-amber-100 text-amber-700",
  SPECIALIST: "bg-emerald-100 text-emerald-700",
  VIEWER:     "bg-gray-100 text-gray-600",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER:      "Full access to all workspace settings and members",
  ADMIN:      "Manage workspace data, members, and settings",
  OPERATIONS: "Manage deliveries and samples only",
  SPECIALIST: "Access assigned creators and campaigns only",
  VIEWER:     "Read-only access",
};

// ─── Icon ─────────────────────────────────────────────────────────────────────
function Icon({ d, className = "" }: { d: string | readonly string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className={`w-4 h-4 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, image, size = "md" }: { name: string; image?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} referrerPolicy="no-referrer"
      className={`${dim} rounded-full border border-gray-100 shrink-0 object-cover`} />;
  }
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0 font-semibold text-white`}>
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLOR[role as Role] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {role}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
      type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
    }`}>
      {type === "success" ? (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
      )}
      {message}
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100 transition-opacity">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Invite modal ─────────────────────────────────────────────────────────────
function InviteModal({
  currentWorkspaceId,
  onClose,
  onDone,
}: {
  currentWorkspaceId: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspaces } = useWorkspace();

  // Only show workspaces where the current user can manage members
  const manageableWs = workspaces.filter((w) => w.role === "OWNER" || w.role === "ADMIN");

  const [email,         setEmail]         = useState("");
  const [role,          setRole]          = useState<Role>("VIEWER");
  const [selectedWsIds, setSelectedWsIds] = useState<Set<number>>(new Set([currentWorkspaceId]));
  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState("");

  function toggleWs(id: number) {
    setSelectedWsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedWsIds.size === 0) { setError("Select at least one workspace."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch("/api/workspace/members", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, role, workspaceIds: [...selectedWsIds] }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; results?: { message: string }[] };
      if (!res.ok) {
        setError(data.error || "Failed to invite member");
      } else {
        const wsCount = selectedWsIds.size;
        const msg = `Invitation sent to ${email} for ${wsCount} workspace${wsCount > 1 ? "s" : ""}`;
        onDone(msg);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Invite Member</h2>
            <p className="text-xs text-gray-400 mt-0.5">They&apos;ll get access when they sign in with Google</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Email address <span className="text-red-400">*</span>
            </label>
            <input
              type="email" required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="colleague@example.com"
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white transition-colors"
            >
              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">{ROLE_DESCRIPTIONS[role]}</p>
          </div>

          {/* Workspace Access */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Workspace Access
              <span className="ml-1.5 text-gray-400 font-normal">(select one or more)</span>
            </label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {manageableWs.map((ws) => {
                const checked   = selectedWsIds.has(ws.id);
                const isCurrent = ws.id === currentWorkspaceId;
                return (
                  <label
                    key={ws.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                      checked ? "border-indigo-200 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox" checked={checked}
                      onChange={() => toggleWs(ws.id)}
                      className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-300"
                    />
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-bold bg-indigo-500">
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate block">{ws.name}</span>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] text-indigo-500 font-semibold shrink-0">Current</span>
                    )}
                  </label>
                );
              })}
              {manageableWs.length === 0 && (
                <p className="text-xs text-gray-400 py-2 text-center">No manageable workspaces available</p>
              )}
            </div>
            {selectedWsIds.size === 0 && (
              <p className="text-xs text-amber-500 mt-1.5">Select at least one workspace</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button type="submit"
              disabled={busy || selectedWsIds.size === 0 || !email.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {busy ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending…
                </span>
              ) : `Invite to ${selectedWsIds.size} workspace${selectedWsIds.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Active member row ────────────────────────────────────────────────────────
function MemberRow({ member, canEdit, onUpdated }: {
  member:    Member;
  canEdit:   boolean;
  onUpdated: () => void;
}) {
  const [editRole,   setEditRole]   = useState<Role>(member.role as Role);
  const [saving,     setSaving]     = useState(false);
  const [confirming, setConfirming] = useState(false);

  const displayName  = member.user?.name  || member.inviteEmail || "Unknown";
  const displayEmail = member.user?.email || member.inviteEmail  || "";
  const isOwner      = member.role === "OWNER";

  async function saveRole(newRole: Role) {
    setSaving(true);
    try {
      await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId, role: newRole }),
      });
      onUpdated();
    } finally { setSaving(false); }
  }

  async function removeMember() {
    setSaving(true);
    try {
      await fetch("/api/workspace/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId }),
      });
      onUpdated();
    } finally { setSaving(false); setConfirming(false); }
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Avatar name={displayName} image={member.user?.image} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
            <p className="text-xs text-gray-400 truncate">{displayEmail}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {canEdit && !isOwner ? (
          <select
            value={editRole}
            onChange={(e) => { setEditRole(e.target.value as Role); saveRole(e.target.value as Role); }}
            disabled={saving}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-60"
          >
            {ROLES.filter((r) => r !== "OWNER").map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </td>
      <td className="py-3 px-4 text-xs text-gray-400">
        {new Date(member.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
      </td>
      <td className="py-3 px-4 text-right">
        {canEdit && !isOwner && (
          confirming ? (
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => setConfirming(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                Cancel
              </button>
              <button onClick={removeMember} disabled={saving}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
                {saving ? "…" : "Remove"}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)}
              className="text-xs px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors">
              Remove
            </button>
          )
        )}
      </td>
    </tr>
  );
}

// ─── Pending invite row ───────────────────────────────────────────────────────
function InviteRow({ member, canEdit, onUpdated, onToast }: {
  member:    Member;
  canEdit:   boolean;
  onUpdated: () => void;
  onToast:   (msg: string, type: "success" | "error") => void;
}) {
  const [saving,     setSaving]     = useState(false);
  const [confirming, setConfirming] = useState(false);

  const email = member.inviteEmail || member.user?.email || "Unknown";

  async function cancelInvite() {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId }),
      });
      if (res.ok) {
        onToast("Invitation cancelled", "success");
        onUpdated();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        onToast(d.error || "Failed to cancel invite", "error");
      }
    } finally { setSaving(false); setConfirming(false); }
  }

  async function resendInvite() {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({
          email,
          role:         member.role,
          workspaceIds: [member.workspaceId],
        }),
      });
      if (res.ok) {
        onToast(`Invitation resent to ${email}`, "success");
        onUpdated();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        onToast(d.error || "Failed to resend invite", "error");
      }
    } finally { setSaving(false); }
  }

  // Days since invite was created
  const daysSince = Math.floor((Date.now() - new Date(member.createdAt).getTime()) / 86400000);

  return (
    <tr className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM20 8l-8 5-8-5"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{email}</p>
            <p className="text-xs text-amber-500">
              Invited {daysSince === 0 ? "today" : `${daysSince}d ago`} · awaiting sign-in
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <RoleBadge role={member.role} />
      </td>
      <td className="py-3 px-4 text-xs text-gray-400">
        {new Date(member.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
      </td>
      <td className="py-3 px-4 text-right">
        {canEdit && (
          confirming ? (
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => setConfirming(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                Keep
              </button>
              <button onClick={cancelInvite} disabled={saving}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
                {saving ? "…" : "Cancel invite"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={resendInvite} disabled={saving}
                className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 transition-colors">
                {saving ? "…" : "Resend"}
              </button>
              <button onClick={() => setConfirming(true)}
                className="text-xs px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors">
                Cancel
              </button>
            </div>
          )
        )}
      </td>
    </tr>
  );
}

// ─── Team Page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { current, loading: wsLoading } = useWorkspace();
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [inviting, setInviting] = useState(false);
  const [tab,      setTab]      = useState<"active" | "pending">("active");
  const [toast,    setToast]    = useState<{ message: string; type: "success" | "error" } | null>(null);

  const canEdit   = current?.role === "OWNER" || current?.role === "ADMIN";
  const toastRef  = useRef(toast);
  toastRef.current = toast;

  const loadMembers = useCallback(async () => {
    if (!current?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/members?workspaceId=${current.id}`);
      if (res.ok) {
        const data = await res.json() as Member[];
        setMembers(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [current?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  const activeMembers  = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "invited");

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg font-medium mb-2">No workspace selected</p>
        <p className="text-sm">Select or create a workspace to manage team members.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage members and roles for <span className="font-medium text-gray-700">{current.name}</span>
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setInviting(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
          >
            <Icon d="M12 5v14M5 12h14" />
            Invite Member
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Members",  value: activeMembers.length,  color: "text-indigo-600" },
          { label: "Active",         value: activeMembers.length,  color: "text-green-600"  },
          { label: "Pending Invite", value: pendingMembers.length, color: "text-amber-600"  },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Role reference ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Role Reference</h2>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {ROLES.map((r) => (
            <div key={r} className="space-y-1">
              <RoleBadge role={r} />
              <p className="text-[11px] text-gray-400 leading-tight">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Members / Invitations tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="px-5 pt-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("active")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "active"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Active Members
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === "active" ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
              }`}>{activeMembers.length}</span>
            </button>
            <button
              onClick={() => setTab("pending")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Pending Invites
              {pendingMembers.length > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === "pending" ? "bg-amber-100 text-amber-700" : "bg-amber-100 text-amber-600"
                }`}>{pendingMembers.length}</span>
              )}
            </button>
          </div>
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          )}
        </div>

        {/* Active members tab */}
        {tab === "active" && (
          loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No active members yet</p>
              {canEdit && (
                <p className="text-xs text-gray-400 mt-1">Invite someone using the button above.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.map((m) => (
                    <MemberRow key={m.id} member={m} canEdit={canEdit} onUpdated={loadMembers} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Pending invites tab */}
        {tab === "pending" && (
          loading ? (
            <div className="p-8 space-y-3">
              {[1, 2].map((n) => (
                <div key={n} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : pendingMembers.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM20 8l-8 5-8-5"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No pending invitations</p>
              <p className="text-xs text-gray-400 mt-1">All invited members have already signed in.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-amber-50/40">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invited</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {pendingMembers.map((m) => (
                    <InviteRow
                      key={m.id}
                      member={m}
                      canEdit={canEdit}
                      onUpdated={loadMembers}
                      onToast={showToast}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Invite modal ── */}
      {inviting && (
        <InviteModal
          currentWorkspaceId={current.id}
          onClose={() => setInviting(false)}
          onDone={(msg) => {
            setInviting(false);
            showToast(msg, "success");
            loadMembers();
            // Auto-switch to pending tab so user sees the new invite
            setTab("pending");
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
