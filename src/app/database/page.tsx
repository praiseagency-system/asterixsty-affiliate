"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { formatNumber } from "@/lib/format";
import SearchableSelect from "@/components/SearchableSelect";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";
import { usePermission } from "@/contexts/PermissionContext";
import ConfirmModal from "@/components/ConfirmModal";
import { VISUAL_TAKE } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SampleRecord {
  id: number; produk: string; tanggalKirim: string;
  qtyProduk: number; totalVideoTarget: number; totalVideoDone: number;
  statusProgress: string; catatan: string;
}
interface AffiliateDB {
  id: number; tiktokUsername: string; namaAffiliator: string;
  status: string; followers: number; mediaPromosiFocus: string;
  visualTake: string; kategoriAffiliate: string; affiliateSpecialist: string;
  provinsi: string; kota: string; alamat: string; noWhatsapp: string;
  totalSampleDikirim: number; totalVideoDelivered: number; totalVideoPending: number;
  groups: string; createdAt: string;
}
interface Group { id: number; name: string; color: string; }

// ─── Group color palette ──────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"  },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200"   },
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"    },
  teal:    { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200"   },
  orange:  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
};
const COLOR_OPTIONS = Object.keys(GROUP_COLORS);

function groupStyle(color: string) {
  return GROUP_COLORS[color] ?? GROUP_COLORS.indigo;
}

function GroupTag({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  const s = groupStyle(color);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
      {name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100 text-[10px] leading-none">✕</button>
      )}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { dot: string; badge: string }> = {
  Aktif:       { dot: "bg-green-500",  badge: "bg-green-100 text-green-700" },
  Hold:        { dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-700" },
  "Non-Aktif": { dot: "bg-red-400",    badge: "bg-red-100 text-red-600" },
};
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 mt-1">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  );
}

// ─── Groups Management Panel ──────────────────────────────────────────────────
function GroupsPanel({ onClose }: { onClose: () => void }) {
  const [groups, setGroups]   = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("indigo");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId]   = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDel, setConfirmDel] = useState<Group | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/groups");
      const d = await r.json() as Group[];
      setGroups(Array.isArray(d) ? d : []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await fetch("/api/groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (r.ok) { setNewName(""); await load(); }
    else { const d = await r.json() as { error?: string }; alert(d.error || "Gagal"); }
    setCreating(false);
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    const r = await fetch(`/api/groups/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (r.ok) { setEditId(null); await load(); }
  }

  async function deleteGroup(id: number) {
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    setConfirmDel(null);
    await load();
  }

  return (
    <>
      {confirmDel && (
        <ConfirmModal
          title={`Hapus Group "${confirmDel.name}"`}
          message="Group akan dihapus dari semua affiliate yang memilikinya. Lanjutkan?"
          confirmLabel="Hapus Group"
          onConfirm={() => deleteGroup(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-white shadow-2xl z-40 flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Database Affiliate</p>
            <h2 className="text-lg font-bold text-gray-900">Kelola Groups</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Buat Group Baru</p>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Nama group..." value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Warna</p>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => {
                  const s = groupStyle(c);
                  return (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${s.bg} ${s.text} ${s.border} ${newColor === c ? "ring-2 ring-offset-1 ring-indigo-400 scale-105" : ""}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={create} disabled={creating || !newName.trim()}
              className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {creating ? "Membuat..." : "+ Buat Group"}
            </button>
          </div>

          {/* List */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Groups ({groups.length})
            </p>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Belum ada group</p>
            ) : groups.map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                <GroupTag name={g.name} color={g.color} />
                {editId === g.id ? (
                  <div className="flex-1 flex gap-2">
                    <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                      value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(g.id); if (e.key === "Escape") setEditId(null); }}
                      autoFocus />
                    <button onClick={() => saveEdit(g.id)} className="text-xs font-medium text-green-600 hover:text-green-700">✓</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400">✕</button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700 font-medium">{g.name}</span>
                    <button onClick={() => { setEditId(g.id); setEditName(g.name); }}
                      className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50">✏️</button>
                    <button onClick={() => setConfirmDel(g)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Group Assign Picker ──────────────────────────────────────────────────────
function GroupPicker({ selected, groups, onChange }: {
  selected: string[]; groups: Group[]; onChange: (g: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((g) => g !== name) : [...selected, name]);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:border-gray-300 transition-colors">
        <span>🏷️</span>
        <span className="font-medium">
          {selected.length === 0 ? "Assign Group" : `${selected.length} group dipilih`}
        </span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path d="M19 9l-7 7-7-7" strokeWidth={2} />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
          {groups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">Belum ada group</p>
          ) : groups.map((g) => {
            const s = groupStyle(g.color);
            const checked = selected.includes(g.name);
            return (
              <button key={g.id} onClick={() => toggle(g.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${checked ? "bg-indigo-50/50" : ""}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>{g.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sample History ───────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  "Selesai":     { bg: "bg-green-100", text: "text-green-700"  },
  "On Progress": { bg: "bg-blue-100",  text: "text-blue-700"   },
  "Belum Mulai": { bg: "bg-gray-100",  text: "text-gray-500"   },
};

function SampleHistorySection({ username }: { username: string }) {
  const [samples, setSamples]     = useState<SampleRecord[]>([]);
  const [loadingSD, setLoadingSD] = useState(true);
  const [errorSD, setErrorSD]     = useState<string | null>(null);
  const [expanded, setExpanded]   = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingSD(true); setErrorSD(null);
    fetch(`/api/sample-delivery?username=${encodeURIComponent(username)}&limit=50&subs=0`, { signal: ctrl.signal })
      .then(async (r) => {
        let j: { items?: SampleRecord[] } = {};
        try { const t = await r.text(); j = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
        setSamples(j.items || []);
      })
      .catch((err) => { if (err?.name !== "AbortError") setErrorSD("Gagal memuat history"); })
      .finally(() => setLoadingSD(false));
    return () => ctrl.abort();
  }, [username]);

  const active = useMemo(() => samples.filter((s) => s.statusProgress !== "Selesai").length, [samples]);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">Sample History</span>
          {samples.length > 0 && <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-semibold">{samples.length}</span>}
          {active > 0 && <span className="text-xs bg-orange-100 text-orange-600 rounded-full px-2 py-0.5 font-semibold">{active} aktif</span>}
        </div>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-50">
          {loadingSD ? (
            <div className="space-y-2 p-3">{[1,2].map(i => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}</div>
          ) : errorSD ? (
            <div className="px-4 py-4 text-xs text-red-500 text-center">{errorSD}</div>
          ) : samples.length === 0 ? (
            <div className="px-4 py-5 text-center"><p className="text-sm text-gray-400">Belum ada sample dikirim</p></div>
          ) : samples.map((s) => {
            const badge = STATUS_BADGE[s.statusProgress] ?? STATUS_BADGE["Belum Mulai"];
            const pct   = s.totalVideoTarget > 0 ? (s.totalVideoDone / s.totalVideoTarget) * 100 : 0;
            const tgl   = new Date(s.tanggalKirim).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
            return (
              <div key={s.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{s.produk || "—"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{tgl} · {s.qtyProduk} pcs</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${badge.bg} ${badge.text}`}>{s.statusProgress}</span>
                </div>
                {s.totalVideoTarget > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Video</span>
                      <span className="font-semibold">{s.totalVideoDone}/{s.totalVideoTarget} selesai</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-indigo-500" : "bg-gray-300"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                )}
                {s.catatan && <p className="text-xs text-gray-400 italic">"{s.catatan}"</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ affiliate, groups, onClose, onUpdated, onDeleted }: {
  affiliate: AffiliateDB; groups: Group[];
  onClose: () => void; onUpdated: () => void; onDeleted: (id: number) => void;
}) {
  const [editing, setEditing]           = useState(false);
  const [form, setForm]                 = useState({ ...affiliate });
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [affiliateGroups, setAffiliateGroups] = useState<string[]>(() => {
    try { return JSON.parse(affiliate.groups || "[]") as string[]; } catch { return []; }
  });
  const [savingGroups, setSavingGroups] = useState(false);

  function set(k: string, v: string | number) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    await fetch("/api/database", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: affiliate.id }),
    });
    setSaving(false); setEditing(false); onUpdated();
  }

  async function saveGroups(newGroups: string[]) {
    setAffiliateGroups(newGroups);
    setSavingGroups(true);
    await fetch("/api/database", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: affiliate.id, groups: newGroups }),
    });
    setSavingGroups(false);
  }

  async function handleDelete() {
    await fetch(`/api/database/${affiliate.id}`, { method: "DELETE" });
    setConfirmDelete(false); onDeleted(affiliate.id); onClose();
  }

  const wa = affiliate.noWhatsapp;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[420px] max-w-full bg-white shadow-2xl z-40 flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Creator Profile</p>
            <h2 className="text-lg font-bold text-gray-900">@{affiliate.tiktokUsername}</h2>
            {affiliate.namaAffiliator && <p className="text-sm text-gray-500 mt-0.5">{affiliate.namaAffiliator}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(!editing)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${editing ? "border-gray-300 text-gray-600 hover:bg-gray-50" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}>
              {editing ? "Batal" : "✏️ Edit"}
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">🗑️</button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stats */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: "Sample Dikirim", val: affiliate.totalSampleDikirim,  color: "text-indigo-600" },
              { label: "Video Selesai",  val: affiliate.totalVideoDelivered, color: "text-green-600"  },
              { label: "Video Pending",  val: affiliate.totalVideoPending,   color: "text-orange-500" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="px-6 py-4 space-y-5">
            {/* Groups section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Groups</span>
                {savingGroups && <span className="text-xs text-gray-400">Menyimpan...</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                {affiliateGroups.length === 0
                  ? <span className="text-xs text-gray-400">Belum ada group</span>
                  : affiliateGroups.map((g) => {
                      const grp = groups.find((x) => x.name === g);
                      return (
                        <GroupTag key={g} name={g} color={grp?.color || "indigo"}
                          onRemove={() => saveGroups(affiliateGroups.filter((x) => x !== g))} />
                      );
                    })
                }
              </div>
              <GroupPicker selected={affiliateGroups} groups={groups}
                onChange={(newGs) => saveGroups(newGs)} />
            </div>

            {/* Status + followers */}
            <div className="flex items-center gap-3 flex-wrap">
              {editing ? (
                <select value={form.status} onChange={(e) => set("status", e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm bg-white">
                  {["Aktif","Hold","Non-Aktif"].map((s) => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_CFG[affiliate.status]?.badge ?? "bg-gray-100 text-gray-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[affiliate.status]?.dot ?? "bg-gray-400"}`} />
                  {affiliate.status}
                </span>
              )}
              <span className="text-sm text-gray-500">{formatNumber(affiliate.followers)} followers</span>
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline font-medium">💬 Chat WA</a>
              )}
            </div>

            {/* Edit form */}
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nama Affiliator">
                    <input className={inputCls} value={form.namaAffiliator} onChange={(e) => set("namaAffiliator", e.target.value)} />
                  </Field>
                  <Field label="Followers">
                    <input type="number" className={inputCls} value={form.followers} onChange={(e) => set("followers", Number(e.target.value))} />
                  </Field>
                  <Field label="No WhatsApp">
                    <input className={inputCls} placeholder="628xxxxxxxxxx" value={form.noWhatsapp} onChange={(e) => set("noWhatsapp", e.target.value)} />
                  </Field>
                  <Field label="Media Focus">
                    <select className={inputCls} value={form.mediaPromosiFocus} onChange={(e) => set("mediaPromosiFocus", e.target.value)}>
                      {["Vidio","Live","Live & Vidio"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Visual Take">
                    <SearchableSelect value={form.visualTake ?? ""} onChange={(v) => set("visualTake", v)} suggestionsUrl="/api/master/suggestions?type=visualTake" placeholder="Cari visual take..." />
                  </Field>
                  <Field label="Kategori">
                    <SearchableSelect value={form.kategoriAffiliate} onChange={(v) => set("kategoriAffiliate", v)} suggestionsUrl="/api/master/suggestions?type=kategori" placeholder="Cari kategori..." />
                  </Field>
                  <Field label="PIC Specialist">
                    <SearchableSelect value={form.affiliateSpecialist} onChange={(v) => set("affiliateSpecialist", v)} suggestionsUrl="/api/master/suggestions?type=specialist" placeholder="Cari specialist..." />
                  </Field>
                  <Field label="Kota">
                    <SearchableSelect value={form.kota} onChange={(v) => set("kota", v)} suggestionsUrl="/api/master/suggestions?type=kota" placeholder="Cari kota..." />
                  </Field>
                  <Field label="Provinsi">
                    <SearchableSelect value={form.provinsi} onChange={(v) => set("provinsi", v)} suggestionsUrl="/api/master/suggestions?type=provinsi" placeholder="Cari provinsi..." />
                  </Field>
                </div>
                <Field label="Alamat Lengkap">
                  <textarea className={`${inputCls} resize-none`} rows={2} value={form.alamat} onChange={(e) => set("alamat", e.target.value)} />
                </Field>
                <button onClick={save} disabled={saving}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Media Focus", val: affiliate.mediaPromosiFocus },
                  { label: "Visual Take", val: affiliate.visualTake },
                  { label: "Kategori",    val: affiliate.kategoriAffiliate },
                  { label: "PIC",         val: affiliate.affiliateSpecialist },
                  { label: "Kota",        val: affiliate.kota },
                  { label: "Provinsi",    val: affiliate.provinsi },
                  { label: "Alamat",      val: affiliate.alamat },
                  { label: "WhatsApp",    val: affiliate.noWhatsapp },
                ].map(({ label, val }) => val ? (
                  <div key={label} className="flex gap-3">
                    <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
                    {label === "Visual Take" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-100">{val}</span>
                    ) : <span className="text-sm text-gray-700 break-all">{val}</span>}
                  </div>
                ) : null)}
              </div>
            )}

            {!editing && <SampleHistorySection username={affiliate.tiktokUsername} />}
          </div>
        </div>
      </aside>

      {confirmDelete && (
        <ConfirmModal
          title="Hapus Affiliate"
          message={`Hapus data @${affiliate.tiktokUsername} dari database?`}
          confirmLabel="Hapus Affiliate"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

// ─── Add Affiliate Form ───────────────────────────────────────────────────────
function AddForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    tiktokUsername: "", namaAffiliator: "", status: "Aktif", followers: "",
    mediaPromosiFocus: "Vidio", visualTake: "", kategoriAffiliate: "", affiliateSpecialist: "",
    alamat: "", kota: "", provinsi: "", noWhatsapp: "",
  });
  const [saving, setSaving] = useState(false);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/database", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, followers: Number(form.followers) || 0 }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-indigo-50 to-white">
        <div>
          <h2 className="font-bold text-gray-900">Tambah Affiliate</h2>
          <p className="text-xs text-gray-400 mt-0.5">Isi data master affiliate baru</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
      </div>
      <form onSubmit={submit} className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SectionDivider label="Identitas" />
          <Field label="Username TikTok" required>
            <input required className={inputCls} placeholder="username (tanpa @)"
              value={form.tiktokUsername} onChange={(e) => set("tiktokUsername", e.target.value.replace(/^@/, ""))} />
          </Field>
          <Field label="Nama Affiliator">
            <input className={inputCls} value={form.namaAffiliator} onChange={(e) => set("namaAffiliator", e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {["Aktif","Hold","Non-Aktif"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Followers">
            <input type="number" min={0} className={inputCls} value={form.followers} onChange={(e) => set("followers", e.target.value)} />
          </Field>
          <SectionDivider label="Management" />
          <Field label="Media Focus">
            <select className={inputCls} value={form.mediaPromosiFocus} onChange={(e) => set("mediaPromosiFocus", e.target.value)}>
              {["Vidio","Live","Live & Vidio"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Visual Take">
            <SearchableSelect value={form.visualTake} onChange={(v) => set("visualTake", v)} suggestionsUrl="/api/master/suggestions?type=visualTake" placeholder="Cari visual take..." />
          </Field>
          <Field label="Kategori Affiliate">
            <SearchableSelect value={form.kategoriAffiliate} onChange={(v) => set("kategoriAffiliate", v)} suggestionsUrl="/api/master/suggestions?type=kategori" placeholder="Cari kategori..." />
          </Field>
          <Field label="Affiliate Specialist (PIC)">
            <SearchableSelect value={form.affiliateSpecialist} onChange={(v) => set("affiliateSpecialist", v)} suggestionsUrl="/api/master/suggestions?type=specialist" placeholder="Cari PIC..." />
          </Field>
          <SectionDivider label="Kontak & Lokasi" />
          <Field label="No WhatsApp">
            <input className={inputCls} placeholder="628xxxxxxxxxx" value={form.noWhatsapp} onChange={(e) => set("noWhatsapp", e.target.value)} />
          </Field>
          <Field label="Kota">
            <SearchableSelect value={form.kota} onChange={(v) => set("kota", v)} suggestionsUrl="/api/master/suggestions?type=kota" placeholder="Cari kota..." />
          </Field>
          <Field label="Provinsi">
            <SearchableSelect value={form.provinsi} onChange={(v) => set("provinsi", v)} suggestionsUrl="/api/master/suggestions?type=provinsi" placeholder="Cari provinsi..." />
          </Field>
          <div className="col-span-full">
            <Field label="Alamat Lengkap">
              <textarea className={`${inputCls} resize-none`} rows={2} value={form.alamat} onChange={(e) => set("alamat", e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="submit" disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Menyimpan..." : "Simpan Affiliate"}
          </button>
          <button type="button" onClick={onCancel}
            className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">Batal</button>
        </div>
      </form>
    </div>
  );
}

// ─── Import Result Modal ──────────────────────────────────────────────────────
interface ImportResult { created: number; updated: number; failed: number; errors: { row: number; message: string }[]; }

function ImportResultModal({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  function downloadErrorLog() {
    const lines = [`Row,Error`, ...result.errors.map((e) => `${e.row},"${e.message}"`)];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "import_errors.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  const total = result.created + result.updated + result.failed;
  const allOk = result.failed === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md">
        <div className={`px-6 py-4 border-b rounded-t-2xl ${allOk ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{allOk ? "✅" : "⚠️"}</span>
            <div>
              <h3 className="font-bold text-gray-900">Hasil Import</h3>
              <p className="text-xs text-gray-500 mt-0.5">{total} baris diproses</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Berhasil",   val: result.created, color: "text-green-600", bg: "bg-green-50",  border: "border-green-100" },
              { label: "Diperbarui", val: result.updated, color: "text-blue-600",  bg: "bg-blue-50",   border: "border-blue-100"  },
              { label: "Gagal",      val: result.failed,  color: "text-red-600",   bg: "bg-red-50",    border: "border-red-100"   },
            ].map(({ label, val, color, bg, border }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl px-3 py-3 text-center`}>
                <p className={`text-2xl font-bold ${color}`}>{val}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">Detail Error</p>
                <button onClick={downloadErrorLog} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Error Log
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-red-100 bg-red-50">
                {result.errors.slice(0, 20).map((e, i) => (
                  <div key={i} className={`px-3 py-2 text-xs text-red-700 ${i > 0 ? "border-t border-red-100" : ""}`}>
                    <span className="font-semibold">Row {e.row}:</span> {e.message}
                  </div>
                ))}
                {result.errors.length > 20 && (
                  <div className="px-3 py-2 text-xs text-red-500 border-t border-red-100 italic">+ {result.errors.length - 20} error lainnya</div>
                )}
              </div>
            </div>
          )}
          <button onClick={onClose} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Panel ─────────────────────────────────────────────────────────────
function ImportPanel({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [importFile, setImportFile]     = useState<File | null>(null);
  const [importMode, setImportMode]     = useState<"add" | "upsert">("upsert");
  const [importing, setImporting]       = useState(false);
  const [rowCount, setRowCount]         = useState<number | null>(null);
  const [formatError, setFormatError]   = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const vals: string[] = []; let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      vals.push(cur.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
    });
  }

  async function handleFileChange(file: File | null) {
    setImportFile(file); setRowCount(null); setFormatError(null);
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      setRowCount(rows.length);
      if (rows.length === 0) setFormatError("File kosong atau tidak ada data");
    } catch { setFormatError("Gagal membaca file"); }
  }

  async function doImport() {
    if (!importFile) return;
    setImporting(true); setImportResult(null);
    try {
      const text = await importFile.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setFormatError("Tidak ada data valid di file."); setImporting(false); return; }
      const res  = await fetch("/api/database/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: importMode }),
      });
      const json = await res.json();
      if (res.ok) { setImportResult(json); onSuccess(); }
      else { setFormatError((json as { error?: string }).error || "Import gagal"); }
    } catch (e) { setFormatError(`Terjadi error: ${e}`); }
    setImporting(false);
  }

  const DownloadIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );

  return (
    <>
      {importResult && <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-indigo-50 to-white">
          <div>
            <h3 className="font-bold text-gray-900">Import Database Affiliate</h3>
            <p className="text-xs text-gray-400 mt-0.5">Upload CSV sesuai format template untuk import massal</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-sm">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Download Template</p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-3">
              <p className="text-xs text-blue-700">Gunakan template agar format import sesuai sistem.</p>
              <div className="flex gap-2 flex-wrap">
                <a href="/api/database/template?format=csv" download="template_import_affiliate.csv"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 text-xs font-semibold hover:bg-blue-50">
                  <DownloadIcon /> Download Template CSV
                </a>
                <a href="/api/database/template?format=xlsx" download="template_import_affiliate.xlsx"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 text-xs font-semibold hover:bg-blue-50">
                  <DownloadIcon /> Download Template XLSX
                </a>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">2. Upload File & Import</p>
            <div className="space-y-3">
              <div>
                <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
                <button onClick={() => importRef.current?.click()}
                  className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 text-sm transition-colors ${importFile ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  📎 {importFile ? importFile.name : "Pilih File CSV"}
                </button>
                {rowCount !== null && !formatError && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-full">
                    ✓ {rowCount} baris terdeteksi
                  </div>
                )}
                {formatError && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 text-red-600 px-2.5 py-1.5 rounded-lg">⚠️ {formatError}</div>
                )}
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mode Import</label>
                  <select value={importMode} onChange={(e) => setImportMode(e.target.value as "add" | "upsert")}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="upsert">Perbarui jika ada</option>
                    <option value="add">Tambah semua (duplikat mungkin terjadi)</option>
                  </select>
                </div>
                <button onClick={doImport} disabled={!importFile || importing || !!formatError}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors mb-5">
                  {importing ? "Mengimpor..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Group Assign Modal ───────────────────────────────────────────────────────
function GroupAssignModal({ mode, selectedIds, allItems, groups, onDone, onClose }: {
  mode: "add" | "remove";
  selectedIds: Set<number>;
  allItems: AffiliateDB[];
  groups: Group[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked]   = useState<string[]>([]);
  const [query, setQuery]     = useState("");
  const [saving, setSaving]   = useState(false);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));

  function toggle(name: string) {
    setPicked((prev) => prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]);
  }

  async function apply() {
    if (picked.length === 0) return;
    setSaving(true);
    const selected = allItems.filter((a) => selectedIds.has(a.id));
    await Promise.all(selected.map(async (a) => {
      let cur: string[] = [];
      try { cur = JSON.parse(a.groups || "[]") as string[]; } catch { cur = []; }
      const next = mode === "add"
        ? Array.from(new Set([...cur, ...picked]))
        : cur.filter((g) => !picked.includes(g));
      await fetch("/api/database", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, groups: next }),
      });
    }));
    setSaving(false);
    onDone();
  }

  const isAdd = mode === "add";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isAdd ? "bg-indigo-50 border-indigo-100" : "bg-red-50 border-red-100"}`}>
          <div>
            <p className={`font-bold text-sm ${isAdd ? "text-indigo-800" : "text-red-800"}`}>
              {isAdd ? "🏷️ Tambah ke Group" : "🗑️ Hapus dari Group"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{selectedIds.size} affiliate dipilih</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2">
          <input
            type="text"
            placeholder="Cari group..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
        </div>

        {/* Group list */}
        <div className="overflow-y-auto max-h-64 px-4 pb-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Tidak ada group ditemukan</p>
          ) : filtered.map((g) => {
            const s = groupStyle(g.color);
            const checked = picked.includes(g.name);
            return (
              <button
                key={g.id}
                onClick={() => toggle(g.name)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${checked ? "bg-indigo-50" : "hover:bg-gray-50"}`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                  {checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${s.bg} ${s.text} ${s.border}`}>{g.name}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button
            onClick={apply}
            disabled={saving || picked.length === 0}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 ${isAdd ? "bg-indigo-600 hover:bg-indigo-700" : "bg-red-500 hover:bg-red-600"}`}
          >
            {saving ? "Menyimpan..." : isAdd ? `Tambah ke ${picked.length} Group` : `Hapus dari ${picked.length} Group`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkActionBar({ selectedIds, allItems, groups, onDone, onClear }: {
  selectedIds: Set<number>; allItems: AffiliateDB[]; groups: Group[];
  onDone: () => void; onClear: () => void;
}) {
  const [modalMode, setModalMode] = useState<"add" | "remove" | null>(null);

  function openModal(mode: "add" | "remove") { setModalMode(mode); }
  function closeModal() { setModalMode(null); }
  function handleDone() { closeModal(); onDone(); }

  return (
    <>
      {/* Modal (rendered at z-50, above everything) */}
      {modalMode && (
        <GroupAssignModal
          mode={modalMode}
          selectedIds={selectedIds}
          allItems={allItems}
          groups={groups}
          onDone={handleDone}
          onClose={closeModal}
        />
      )}

      {/* Fixed floating action bar */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex justify-center px-4 pointer-events-none w-full max-w-2xl">
        <div className="pointer-events-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap w-full">
          {/* Selection count */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold leading-none">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium whitespace-nowrap">{selectedIds.size} dipilih</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <button
              onClick={() => openModal("add")}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
              🏷️ Tambah ke Group
            </button>
            <button
              onClick={() => openModal("remove")}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
              🗑️ Hapus dari Group
            </button>
          </div>

          {/* Clear */}
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-white shrink-0 px-2 py-1 rounded hover:bg-gray-700 transition-colors whitespace-nowrap">
            ✕ Batal
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function DatabasePage() {
  const { can } = usePermission();
  const [items, setItems]                       = useState<AffiliateDB[]>([]);
  const [total, setTotal]                       = useState(0);
  const [page, setPage]                         = useState(1);
  const [searchInput, setSearchInput]           = useState("");
  const [search, setSearch]                     = useState("");
  const [statusFilter, setStatusFilter]         = useState("");
  const [visualTakeFilter, setVisualTakeFilter] = useState("");
  const [groupFilter, setGroupFilter]           = useState("");
  const [loading, setLoading]                   = useState(true);
  const [fetchError, setFetchError]             = useState<string | null>(null);
  const [showForm, setShowForm]                 = useState(false);
  const [showImport, setShowImport]             = useState(false);
  const [showGroups, setShowGroups]             = useState(false);
  const [selected, setSelected]                 = useState<AffiliateDB | null>(null);
  const [groups, setGroups]                     = useState<Group[]>([]);
  const [selectedIds, setSelectedIds]           = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchGroups = useCallback(async () => {
    const r = await fetch("/api/groups");
    if (r.ok) { const d = await r.json() as Group[]; setGroups(Array.isArray(d) ? d : []); }
  }, []);

  useEffect(() => { void fetchGroups(); }, [fetchGroups]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setFetchError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search)          params.set("search", search);
      if (statusFilter)    params.set("status", statusFilter);
      if (visualTakeFilter) params.set("visualTake", visualTakeFilter);
      if (groupFilter)     params.set("group", groupFilter);
      const res = await fetch(`/api/database?${params}`, { signal });
      let json: { items?: AffiliateDB[]; total?: number } = {};
      try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
      setItems(json.items || []);
      setTotal(json.total || 0);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setFetchError("Gagal memuat data affiliate. Coba lagi.");
        console.error("[Database] fetchData error:", err);
      }
    } finally { setLoading(false); }
  }, [page, search, statusFilter, visualTakeFilter, groupFilter]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchData(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchData]);

  const pageSize  = 50;
  const totalPages = Math.ceil(total / pageSize);
  const activeCount = items.filter((i) => i.status === "Aktif").length;

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  const groupMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of groups) m[g.name] = g.color;
    return m;
  }, [groups]);

  function parseGroups(s: string): string[] {
    try { return JSON.parse(s || "[]") as string[]; } catch { return []; }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Affiliate</h1>
          <p className="text-sm text-gray-500 mt-0.5">Master data creator aktif — Affiliate CRM</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowGroups(true)}
            className="border border-violet-200 text-violet-700 bg-violet-50 px-3 py-2 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors">
            🏷️ Groups {groups.length > 0 && <span className="ml-1 text-xs bg-violet-200 text-violet-800 rounded-full px-1.5 py-0.5">{groups.length}</span>}
          </button>
          <button onClick={() => window.open("/api/database/export", "_blank")}
            className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">⬇️ Export</button>
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); }}
            className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">⬆️ Import</button>
          {can(PERMISSIONS.CREATE_AFFILIATE) && (
            <button onClick={() => { setShowForm(true); setShowImport(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
              + Tambah Affiliate
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Affiliate", val: total,        icon: "👥", cls: "text-gray-900"   },
          { label: "Aktif",           val: activeCount,  icon: "🟢", cls: "text-green-600"  },
          { label: "Halaman ini",     val: items.length, icon: "📋", cls: "text-indigo-600" },
          { label: "Groups",          val: groups.length, icon: "🏷️", cls: "text-violet-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-lg font-bold ${s.cls}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {showImport && <ImportPanel onSuccess={() => { void fetchData(); }} onClose={() => setShowImport(false)} />}
      {showForm   && <AddForm onSuccess={() => { setShowForm(false); void fetchData(); }} onCancel={() => setShowForm(false)} />}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input type="text" placeholder="Cari username, nama, atau kota..."
          value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-64" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Status</option>
          <option value="Aktif">Aktif</option>
          <option value="Hold">Hold</option>
          <option value="Non-Aktif">Non-Aktif</option>
        </select>
        <select value={visualTakeFilter} onChange={(e) => { setVisualTakeFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Visual Take</option>
          {VISUAL_TAKE.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Group</option>
          {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
        </select>
        {(searchInput || statusFilter || visualTakeFilter || groupFilter) && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setStatusFilter(""); setVisualTakeFilter(""); setGroupFilter(""); setPage(1); }}
            className="text-xs text-red-500 hover:underline px-2">Reset</button>
        )}
        {selectedIds.size > 0 && (
          <span className="ml-auto text-xs text-indigo-600 font-semibold bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
            {selectedIds.size} dipilih — lihat action bar di bawah
          </span>
        )}
        {selectedIds.size === 0 && <span className="text-sm text-gray-400 ml-auto">{total} affiliate</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600" />
                </th>
                {["No","Creator","Status","Followers","Visual Take","Kategori","Groups","PIC","Kota","Sample","Video","WA"].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 13 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : fetchError ? (
                <tr><td colSpan={13} className="px-4 py-12 text-center">
                  <div className="text-3xl mb-2">⚠️</div>
                  <p className="font-semibold text-gray-700">{fetchError}</p>
                  <button onClick={() => fetchData()} className="mt-3 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Coba Lagi</button>
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-16 text-center">
                  <div className="text-5xl mb-3">🗂️</div>
                  <p className="font-semibold text-gray-700">Belum ada affiliate terdaftar</p>
                  <p className="text-sm text-gray-400 mt-1">Klik <strong>+ Tambah Affiliate</strong> untuk mulai</p>
                </td></tr>
              ) : items.map((item, i) => {
                const gs = parseGroups(item.groups);
                const isChecked = selectedIds.has(item.id);
                return (
                  <tr key={item.id} className={`hover:bg-indigo-50/20 cursor-pointer transition-colors ${isChecked ? "bg-indigo-50/40" : ""}`}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(item.id)}
                        className="rounded border-gray-300 text-indigo-600" />
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs" onClick={() => setSelected(item)}>{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      <div className="font-semibold text-gray-900 whitespace-nowrap">@{item.tiktokUsername}</div>
                      {item.namaAffiliator && <div className="text-xs text-gray-400 mt-0.5">{item.namaAffiliator}</div>}
                    </td>
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CFG[item.status]?.badge ?? "bg-gray-100 text-gray-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[item.status]?.dot ?? "bg-gray-400"}`} />
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs" onClick={() => setSelected(item)}>{formatNumber(item.followers)}</td>
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      {item.visualTake
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100 whitespace-nowrap">{item.visualTake}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap" onClick={() => setSelected(item)}>{item.kategoriAffiliate || "—"}</td>
                    {/* Groups column */}
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      {gs.length === 0
                        ? <span className="text-gray-300 text-xs">—</span>
                        : (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {gs.slice(0, 2).map((g) => <GroupTag key={g} name={g} color={groupMap[g] || "indigo"} />)}
                            {gs.length > 2 && <span className="text-xs text-gray-400 font-medium">+{gs.length - 2}</span>}
                          </div>
                        )
                      }
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap" onClick={() => setSelected(item)}>{item.affiliateSpecialist || "—"}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap" onClick={() => setSelected(item)}>{item.kota || "—"}</td>
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      <span className="text-xs font-semibold text-indigo-600">{item.totalSampleDikirim}</span>
                      <span className="text-xs text-gray-400"> kirim</span>
                    </td>
                    <td className="px-3 py-3" onClick={() => setSelected(item)}>
                      <div className="flex items-center gap-1.5 min-w-[80px]">
                        <span className="text-xs text-green-600 font-semibold">{item.totalVideoDelivered}</span>
                        <span className="text-gray-300 text-xs">/</span>
                        <span className="text-xs text-orange-500">{item.totalVideoPending}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {item.noWhatsapp
                        ? <a href={`https://wa.me/${item.noWhatsapp}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline font-medium whitespace-nowrap">💬 WA</a>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{total} affiliate{(statusFilter || search || visualTakeFilter || groupFilter) ? " (difilter)" : ""}</span>
          {totalPages > 1 && (
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <span className="text-xs">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}
                className="px-3 py-1 rounded-lg border text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          affiliate={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onUpdated={() => { void fetchData(); setSelected(null); }}
          onDeleted={() => { void fetchData(); setSelected(null); }}
        />
      )}

      {/* Groups Panel */}
      {showGroups && (
        <GroupsPanel onClose={() => { setShowGroups(false); void fetchGroups(); }} />
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          allItems={items}
          groups={groups}
          onDone={() => { setSelectedIds(new Set()); void fetchData(); }}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}

export default function DatabasePageGate() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_AFFILIATE}>
      <DatabasePage />
    </PermissionGate>
  );
}
