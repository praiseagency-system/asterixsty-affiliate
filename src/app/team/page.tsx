"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePermission } from "@/contexts/PermissionContext";
import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ALL_ROLES,
  type Permission,
  type RoleType,
} from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserPermissionRow {
  id:                number;
  workspaceMemberId: number;
  permission:        string;
  granted:           boolean;
}
interface Member {
  id:              number;
  workspaceId:     number;
  userId:          string | null;
  inviteEmail:     string;
  role:            string;
  status:          string;
  createdAt:       string;
  userPermissions: UserPermissionRow[];
  user?: { id: string; name: string | null; email: string | null; image: string | null };
}

const ROLE_COLOR: Record<string, string> = {
  OWNER:      "bg-violet-100 text-violet-700",
  ADMIN:      "bg-blue-100 text-blue-700",
  OPERATIONS: "bg-amber-100 text-amber-700",
  SPECIALIST: "bg-emerald-100 text-emerald-700",
  ANALYST:    "bg-cyan-100 text-cyan-700",
  VIEWER:     "bg-gray-100 text-gray-600",
  CLIENT:     "bg-pink-100 text-pink-700",
};

// ─── Small components ─────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLOR[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

function Avatar({ name, image }: { name: string; image?: string | null }) {
  if (image) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={name} referrerPolicy="no-referrer"
      className="w-9 h-9 rounded-full border border-gray-100 shrink-0 object-cover" />
  );
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0 font-semibold text-white text-sm">
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function Toast({ message, type, onDismiss }: { message: string; type: "success"|"error"; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${
      type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
    }`}>
      {type === "success"
        ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
      }
      {message}
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

// ─── 4-Step Invite Modal ──────────────────────────────────────────────────────
type InviteStep = 1 | 2 | 3 | 4;

function InviteModal({
  currentWorkspaceId,
  onClose,
  onDone,
}: {
  currentWorkspaceId: number;
  onClose: () => void;
  onDone:  (msg: string) => void;
}) {
  const { workspaces }              = useWorkspace();
  const [step,          setStep]    = useState<InviteStep>(1);
  const [email,         setEmail]   = useState("");
  const [role,          setRole]    = useState<RoleType>("VIEWER");
  const [selectedWsIds, setSelWs]   = useState<Set<number>>(new Set([currentWorkspaceId]));
  // permOverrides: true = grant (even if role doesn't), false = deny (even if role does)
  const [permOverrides, setPerms]   = useState<Record<string, boolean>>({});
  const [busy,          setBusy]    = useState(false);
  const [error,         setError]   = useState("");

  const manageableWs = workspaces.filter((w) => w.role === "OWNER" || w.role === "ADMIN");

  // When role changes, reset permission overrides (start fresh from role defaults)
  useEffect(() => { setPerms({}); }, [role]);

  // Keyboard: Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // ── Step navigation ──
  function canProceed(): boolean {
    if (step === 1) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (step === 2) return role !== "OWNER";
    if (step === 3) return selectedWsIds.size > 0;
    return true;
  }

  // ── Permission helpers ──
  // Effective desired set = role defaults + overrides
  function effectiveSet(): Set<Permission> {
    const base = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
    for (const [p, g] of Object.entries(permOverrides)) {
      if (g) base.add(p as Permission);
      else   base.delete(p as Permission);
    }
    return base;
  }

  function togglePerm(p: Permission) {
    const cur = effectiveSet().has(p);
    setPerms((prev) => ({ ...prev, [p]: !cur }));
  }

  // ── Submit ──
  async function submit() {
    setBusy(true); setError("");
    const desired  = effectiveSet();
    const roleSet  = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
    // Only send permissions that differ from role defaults
    const diffs: Record<string, boolean> = {};
    for (const p of Array.from(desired)) {
      if (!roleSet.has(p)) diffs[p] = true;
    }
    for (const p of Array.from(roleSet)) {
      if (!desired.has(p)) diffs[p] = false;
    }

    try {
      const res = await fetch("/api/workspace/members", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email:               email.trim().toLowerCase(),
          role,
          workspaceIds:        [...selectedWsIds],
          permissionOverrides: Object.keys(diffs).length ? diffs : undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setError(data.error || "Failed to invite member"); }
      else {
        onDone(`Invitation sent to ${email.trim()} for ${selectedWsIds.size} workspace${selectedWsIds.size > 1 ? "s" : ""}`);
      }
    } catch { setError("Network error. Please try again."); }
    finally  { setBusy(false); }
  }

  const stepLabels = ["Email", "Role", "Workspaces", "Permissions"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header + step bar */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Invite Member</h2>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {stepLabels.map((label, i) => {
              const n      = (i + 1) as InviteStep;
              const done   = n < step;
              const active = n === step;
              return (
                <div key={n} className="flex items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shrink-0 ${
                    done   ? "bg-indigo-600 text-white" :
                    active ? "bg-indigo-600 text-white ring-2 ring-indigo-200" :
                             "bg-gray-100 text-gray-400"
                  }`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`text-[11px] font-medium hidden sm:block ${active ? "text-indigo-700" : done ? "text-gray-500" : "text-gray-300"}`}>
                    {label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <div className={`flex-1 h-px mx-1 ${done ? "bg-indigo-200" : "bg-gray-100"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── STEP 1: Email ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Enter the email address of the person you want to invite.
                They&apos;ll get access automatically when they sign in with Google.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Email address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email" autoFocus required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceed()) setStep(2); }}
                  placeholder="colleague@example.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Role ── */}
          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">
                Select a role preset. You can fine-tune individual permissions in step 4.
              </p>
              {(ALL_ROLES.filter((r) => r !== "OWNER") as RoleType[]).map((r) => (
                <label
                  key={r}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                    role === r ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio" name="role" value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="mt-0.5 w-4 h-4 text-indigo-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={r} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ROLE_DESCRIPTIONS[r]}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* ── STEP 3: Workspace selection ── */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Select which workspaces this member should have access to.
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {manageableWs.map((ws) => {
                  const checked   = selectedWsIds.has(ws.id);
                  const isCurrent = ws.id === currentWorkspaceId;
                  return (
                    <label
                      key={ws.id}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                        checked ? "border-indigo-200 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <input type="checkbox" checked={checked}
                        onChange={() => setSelWs((prev) => { const n = new Set(prev); n.has(ws.id) ? n.delete(ws.id) : n.add(ws.id); return n; })}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{ws.name}</p>
                        <p className="text-xs text-gray-400">{ws.role}</p>
                      </div>
                      {isCurrent && <span className="text-[10px] text-indigo-500 font-semibold">Current</span>}
                    </label>
                  );
                })}
              </div>
              {selectedWsIds.size === 0 && (
                <p className="text-xs text-amber-500">Select at least one workspace.</p>
              )}
            </div>
          )}

          {/* ── STEP 4: Permission overrides ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
                <p className="text-xs text-amber-700">
                  Pre-filled from the <strong>{role}</strong> role. Toggle any permission to override the default.
                  Only changes from role defaults are stored.
                </p>
              </div>

              {PERMISSION_CATEGORIES.map(({ label, perms }) => {
                const desired = effectiveSet();
                return (
                  <div key={label}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                    <div className="space-y-1">
                      {perms.map((p) => {
                        const isGranted  = desired.has(p);
                        const isOverride = Object.prototype.hasOwnProperty.call(permOverrides, p);
                        return (
                          <label
                            key={p}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                              isGranted ? "bg-emerald-50 hover:bg-emerald-100" : "bg-gray-50 hover:bg-gray-100"
                            }`}
                          >
                            <input
                              type="checkbox" checked={isGranted}
                              onChange={() => togglePerm(p)}
                              className="w-4 h-4 rounded text-emerald-600"
                            />
                            <span className={`text-xs flex-1 ${isGranted ? "text-gray-800" : "text-gray-400"}`}>
                              {PERMISSION_LABELS[p]}
                            </span>
                            {isOverride && (
                              <span className="text-[10px] text-amber-500 font-semibold shrink-0">
                                {permOverrides[p] ? "+override" : "−denied"}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          {step > 1 ? (
            <button onClick={() => setStep((s) => (s - 1) as InviteStep)} disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              ← Back
            </button>
          ) : (
            <button onClick={onClose} disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
          )}

          {step < 4 ? (
            <button onClick={() => setStep((s) => (s + 1) as InviteStep)}
              disabled={!canProceed()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next →
            </button>
          ) : (
            <button onClick={submit} disabled={busy || !canProceed()}
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
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Member permission editor (inline) ───────────────────────────────────────
function PermissionEditor({ member, onSaved, onClose }: {
  member:  Member;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // Load existing overrides from member
  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const o of (member.userPermissions ?? [])) {
      init[o.permission] = o.granted;
    }
    setOverrides(init);
  }, [member]);

  // Build effective set from role + current overrides
  function effectiveSet() {
    const base = new Set<Permission>(ROLE_PERMISSIONS[member.role] ?? []);
    for (const [p, g] of Object.entries(overrides)) {
      if (g) base.add(p as Permission); else base.delete(p as Permission);
    }
    return base;
  }

  function toggle(p: Permission) {
    const cur = effectiveSet().has(p);
    setOverrides((prev) => ({ ...prev, [p]: !cur }));
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/workspace/permissions", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          memberId:    member.id,
          workspaceId: member.workspaceId,
          overrides,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setError(data.error || "Failed to save"); }
      else { onSaved(); onClose(); }
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  const desired = effectiveSet();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Permissions</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {member.user?.name || member.inviteEmail} · <RoleBadge role={member.role} />
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
            <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
            Overrides saved per-user. Role defaults apply to non-overridden permissions.
            Only differences from role defaults are stored.
          </div>

          {PERMISSION_CATEGORIES.map(({ label, perms }) => (
            <div key={label}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
              <div className="space-y-1">
                {perms.map((p) => {
                  const isGranted  = desired.has(p);
                  const isOverride = Object.prototype.hasOwnProperty.call(overrides, p);
                  return (
                    <label key={p}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isGranted ? "bg-emerald-50 hover:bg-emerald-100" : "bg-gray-50 hover:bg-gray-100"
                      }`}>
                      <input type="checkbox" checked={isGranted} onChange={() => toggle(p)} className="w-4 h-4 rounded text-emerald-600" />
                      <span className={`text-xs flex-1 ${isGranted ? "text-gray-800" : "text-gray-400"}`}>{PERMISSION_LABELS[p]}</span>
                      {isOverride && (
                        <span className={`text-[10px] font-bold shrink-0 ${overrides[p] ? "text-emerald-500" : "text-red-400"}`}>
                          {overrides[p] ? "+grant" : "−deny"}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────
function MemberRow({ member, canEdit, canEditPerms, onUpdated, onToast }: {
  member:       Member;
  canEdit:      boolean;
  canEditPerms: boolean;
  onUpdated:    () => void;
  onToast:      (msg: string, t: "success"|"error") => void;
}) {
  const [editRole,     setEditRole]     = useState(member.role);
  const [saving,       setSaving]       = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [editingPerms, setEditingPerms] = useState(false);
  const [resending,    setResending]    = useState(false);

  const displayName  = member.user?.name  || member.inviteEmail || "Unknown";
  const displayEmail = member.user?.email || member.inviteEmail  || "";
  const isOwner      = member.role === "OWNER";
  const isPending    = member.status === "invited";

  async function saveRole(r: string) {
    setSaving(true);
    const res = await fetch("/api/workspace/members", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId, role: r }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      onToast(d.error || "Failed to update role", "error");
      setEditRole(member.role);
    } else { onUpdated(); }
    setSaving(false);
  }

  async function removeMember() {
    setSaving(true);
    const res = await fetch("/api/workspace/members", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId }),
    });
    if (res.ok) { onUpdated(); }
    else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      onToast(d.error || "Failed to remove member", "error");
    }
    setSaving(false); setConfirming(false);
  }

  async function resendInvite() {
    setResending(true);
    try {
      const res = await fetch("/api/workspace/members/resend", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ memberId: member.id, workspaceId: member.workspaceId }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { onToast(d.error || "Failed to resend invite", "error"); }
      else { onToast(`Invite resent to ${member.inviteEmail}`, "success"); }
    } catch { onToast("Network error", "error"); }
    finally  { setResending(false); }
  }

  return (
    <>
      <tr className={`border-b border-gray-50 transition-colors ${isPending ? "hover:bg-amber-50/30" : "hover:bg-gray-50/50"}`}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            {isPending ? (
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM20 8l-8 5-8-5"/>
                </svg>
              </div>
            ) : (
              <Avatar name={displayName} image={member.user?.image} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
              <p className="text-xs text-gray-400 truncate">{displayEmail}</p>
              {isPending && <span className="text-[10px] text-amber-500 font-medium">Pending invite</span>}
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {canEdit && !isOwner && !isPending ? (
            <select value={editRole}
              onChange={(e) => { setEditRole(e.target.value); saveRole(e.target.value); }}
              disabled={saving}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-60">
              {ALL_ROLES.filter((r) => r !== "OWNER").map((r) => (
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
        <td className="py-3 px-4">
          <div className="flex items-center justify-end gap-1.5">
            {canEditPerms && !isOwner && !isPending && (
              <button onClick={() => setEditingPerms(true)}
                className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
                Permissions
              </button>
            )}
            {canEdit && isPending && (
              <button
                onClick={resendInvite}
                disabled={resending}
                className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {resending ? "…" : "Resend"}
              </button>
            )}
            {canEdit && !isOwner && (
              confirming ? (
                <>
                  <button onClick={() => setConfirming(false)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Keep</button>
                  <button onClick={removeMember} disabled={saving} className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
                    {saving ? "…" : isPending ? "Cancel invite" : "Remove"}
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirming(true)} className="text-xs px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors">
                  {isPending ? "Cancel" : "Remove"}
                </button>
              )
            )}
          </div>
        </td>
      </tr>

      {editingPerms && (
        <PermissionEditor
          member={member}
          onSaved={() => { onUpdated(); onToast("Permissions saved", "success"); }}
          onClose={() => setEditingPerms(false)}
        />
      )}
    </>
  );
}

// ─── Team Page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { current, loading: wsLoading } = useWorkspace();
  const { can, canAny }                 = usePermission();
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [inviting, setInviting] = useState(false);
  const [tab,      setTab]      = useState<"active" | "pending">("active");
  const [toast,    setToast]    = useState<{ message: string; type: "success"|"error" } | null>(null);

  const canInvite   = can(PERMISSIONS.INVITE_MEMBER);
  const canRemove   = can(PERMISSIONS.REMOVE_MEMBER);
  const canEditPerms = can(PERMISSIONS.EDIT_PERMISSION);

  const loadMembers = useCallback(async () => {
    if (!current?.id) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/workspace/members?workspaceId=${current.id}`);
      const data = await res.json().catch(() => []) as Member[];
      setMembers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [current?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  function showToast(message: string, type: "success"|"error" = "success") {
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
            Manage members and permissions for <span className="font-medium text-gray-700">{current.name}</span>
          </p>
        </div>
        {canInvite && (
          <button onClick={() => setInviting(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Invite Member
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Members",  value: activeMembers.length,  color: "text-indigo-600" },
          { label: "Active",         value: activeMembers.length,  color: "text-emerald-600" },
          { label: "Pending Invite", value: pendingMembers.length, color: "text-amber-600"   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Role reference ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Role Reference</h2>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {(ALL_ROLES as readonly string[]).map((r) => (
            <div key={r} className="space-y-1">
              <RoleBadge role={r} />
              <p className="text-[10px] text-gray-400 leading-tight">{ROLE_DESCRIPTIONS[r as RoleType]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Member table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex gap-1">
            {[
              { key: "active",  label: "Active Members",  count: activeMembers.length  },
              { key: "pending", label: "Pending Invites", count: pendingMembers.length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => setTab(key as "active"|"pending")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  tab === key
                    ? key === "pending" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}>
                {label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === key
                    ? key === "pending" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-600"
                    : "bg-gray-100 text-gray-500"
                }`}>{count}</span>
              </button>
            ))}
          </div>
          {loading && <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />}
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          (() => {
            const rows = tab === "active" ? activeMembers : pendingMembers;
            if (rows.length === 0) return (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-gray-500">
                  {tab === "active" ? "No active members yet" : "No pending invitations"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {tab === "active" && canInvite ? "Invite someone using the button above." : ""}
                </p>
              </div>
            );
            return (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b border-gray-100 ${tab === "pending" ? "bg-amber-50/40" : "bg-gray-50/50"}`}>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {tab === "pending" ? "Email" : "Member"}
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {tab === "pending" ? "Invited" : "Joined"}
                      </th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        canEdit={canInvite || canRemove}
                        canEditPerms={canEditPerms}
                        onUpdated={loadMembers}
                        onToast={showToast}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        )}
      </div>

      {inviting && (
        <InviteModal
          currentWorkspaceId={current.id}
          onClose={() => setInviting(false)}
          onDone={(msg) => {
            setInviting(false);
            showToast(msg, "success");
            loadMembers();
            setTab("pending");
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
