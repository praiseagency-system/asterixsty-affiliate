"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CAMPAIGN_OBJECTIVES, OBJECTIVE_META, VISUAL_TAKE } from "@/lib/constants";
import { useMasterData } from "@/lib/useMasterData";
import type { Specialist, Category, Product } from "@/lib/useMasterData";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  Draft:     { label: "Draft",     bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"   },
  Ready:     { label: "Ready",     bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"   },
  Published: { label: "Published", bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500" },
  Ongoing:   { label: "Ongoing",   bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500"},
  Ended:     { label: "Ended",     bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400"    },
};

const VISIBILITY_META: Record<string, { icon: string }> = {
  "Public":          { icon: "🌍" },
  "Invite Only":     { icon: "📩" },
  "Specialist Only": { icon: "⭐" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
// Specialist / Category / Product are imported from @/lib/useMasterData

interface LeaderboardRule { id: string; rank: number; ruleType: string; label: string; reward: number; }
interface Milestone       { id: string; type: "gmv"|"views"|"upload"; target: number; reward: number; }
interface RewardConfig {
  fixed?:       { enabled: boolean; rewardPerVideo: number; rewardPerLive: number; completionBonus: number };
  leaderboard?: LeaderboardRule[];
  consistency?: { enabled: boolean; minUpload: number; rewardAmount: number };
  milestones?:  Milestone[];
}

interface Campaign {
  id:                  number;
  nama:                string;
  slug:                string;
  objectives:          string; // JSON string[]
  deskripsi:           string;
  bannerPath:          string;
  status:              string;
  visibility:          string;
  affiliateCategories: string; // JSON string[]
  visualTake:          string; // JSON string[]
  startDate:           string|null;
  endDate:             string|null;
  rewardConfig:        string; // JSON RewardConfig
  rewardDeskripsi:     string;
  maxParticipants:     number; // now used as target (KPI), not a hard cap
  picSpecialistId:     number|null;
  picSpecialist:       { id: number; nama: string }|null;
  catatan:             string;
  isTemplate:          boolean;
  createdAt:           string;
  totalParticipants:   number;
  totalVideos:         number;
  totalGmv:            number;
  totalRewardPool:     number;
  productFocus:        { product: Product }[];
}

type FilterTab = "All"|"Draft"|"Ready"|"Published"|"Ongoing"|"Ended";
const TABS: FilterTab[] = ["All","Draft","Ready","Published","Ongoing","Ended"];

const RULE_TYPES = [
  "Most Videos","Highest Views","Highest GMV",
  "Best Conversion","Most Orders","Most Consistent","Custom Rule",
] as const;

// ─── Utilities ────────────────────────────────────────────────────────────────
function parseJSON<T>(s: string, fb: T): T { try { return JSON.parse(s) as T; } catch { return fb; } }
function fmt(n: number) { return new Intl.NumberFormat("id-ID").format(Math.round(n)); }
function fmtRp(n: number) {
  if (n >= 1_000_000) return `Rp${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp${(n/1_000).toFixed(0)}rb`;
  return `Rp${fmt(n)}`;
}
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").trim();
}
function uid() { return Math.random().toString(36).slice(2,9); }
function daysLeft(e: string|null): string|null {
  if (!e) return null;
  const d = Math.ceil((new Date(e).getTime() - Date.now()) / 86_400_000);
  if (d < 0) return "Berakhir";
  if (d === 0) return "Hari ini";
  return `${d}h lagi`;
}

function getRewardSummary(cfg: RewardConfig): string[] {
  const parts: string[] = [];
  if (cfg.fixed?.enabled && cfg.fixed.rewardPerVideo > 0)
    parts.push(`🎥 ${fmtRp(cfg.fixed.rewardPerVideo)}/video`);
  if (cfg.leaderboard?.length)
    parts.push(`🏆 Top ${cfg.leaderboard.length}`);
  if (cfg.consistency?.enabled)
    parts.push(`🔥 Consistency`);
  if (cfg.milestones?.length)
    parts.push(`🎯 ${cfg.milestones.length} Milestone`);
  return parts;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: "ok"|"err"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`fixed bottom-6 right-6 z-[999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-2 duration-300 ${
      type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
    }`}>
      {type === "ok" ? "✓" : "✕"} {msg}
    </div>
  );
}

// ─── Small atoms ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.Draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function ObjectiveBadge({ label }: { label: string }) {
  const m = OBJECTIVE_META[label] ?? { bg:"bg-gray-100", text:"text-gray-600", icon:"📌" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.bg} ${m.text}`}>
      {m.icon} {label}
    </span>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string|number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${enabled ? "bg-indigo-600" : "bg-gray-200"}`}>
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? "translate-x-4" : ""}`} />
    </button>
  );
}

// ─── Searchable PIC Dropdown ──────────────────────────────────────────────────
function PicDropdown({ specialists, value, onChange, loading = false }: {
  specialists: Specialist[];
  value: number|null;
  onChange: (id: number|null) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = specialists.find((s) => s.id === value);
  const filtered = specialists.filter((s) => s.nama.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQ(""); }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm hover:border-indigo-300 transition-colors text-left"
      >
        <span className={selected ? "text-gray-800 font-medium" : "text-gray-400"}>
          {loading ? "Memuat data..." : selected ? `👤 ${selected.nama}` : "Pilih PIC..."}
        </span>
        <span className="text-gray-300 text-xs shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari specialist..."
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-3 text-sm text-gray-400 text-center">Memuat data...</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                    value === null ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-gray-300 italic">— Tidak ada PIC —</span>
                </button>
                {filtered.length === 0 && q && (
                  <p className="px-4 py-3 text-xs text-gray-400 text-center">Tidak ditemukan</p>
                )}
                {filtered.length === 0 && !q && specialists.length === 0 && (
                  <p className="px-4 py-3 text-xs text-gray-400 text-center">Belum ada specialist</p>
                )}
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                      value === s.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    👤 {s.nama}
                    {value === s.id && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────
function MultiSelect({ options, value, onChange, placeholder, metaFn, loading = false }: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  metaFn?: (opt: string) => { bg: string; text: string; icon?: string };
  loading?: boolean;
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

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  const defaultMeta = () => ({ bg: "bg-indigo-100", text: "text-indigo-700" });

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-indigo-300 transition-colors"
      >
        {loading ? (
          <span className="text-gray-400 text-sm">Memuat data...</span>
        ) : value.length === 0 ? (
          <span className="text-gray-400 text-sm">{placeholder}</span>
        ) : (
          value.map((v) => {
            const m = metaFn ? metaFn(v) : defaultMeta();
            const meta = OBJECTIVE_META[v] ?? m;
            return (
              <span key={v} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.bg} ${meta.text}`}>
                {"icon" in meta && meta.icon && `${meta.icon} `}{v}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} className="hover:opacity-70 leading-none ml-0.5">×</button>
              </span>
            );
          })
        )}
        <span className="ml-auto text-gray-300 text-xs shrink-0">▾</span>
      </div>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">Memuat data...</p>
          ) : options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">Data tidak tersedia</p>
          ) : options.map((opt) => {
            const checked = value.includes(opt);
            const meta = OBJECTIVE_META[opt] ?? { icon: undefined };
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  checked ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
                }`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 transition-all ${
                  checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300"
                }`}>{checked ? "✓" : ""}</span>
                {"icon" in meta && meta.icon && <span className="text-sm">{meta.icon}</span>}
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Product Multi Select ─────────────────────────────────────────────────────
function ProductMultiSelect({ products, value, onChange, loading = false }: {
  products: Product[];
  value: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = products.filter((p) => p.nama.toLowerCase().includes(query.toLowerCase()));
  const selected = products.filter((p) => value.includes(p.id));
  const SHOW_MAX = 3;

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 cursor-pointer flex flex-wrap gap-1.5 items-center hover:border-teal-400 transition-colors"
      >
        {loading ? (
          <span className="text-gray-400 text-sm">Memuat data...</span>
        ) : selected.length === 0 ? (
          <span className="text-gray-400 text-sm">Pilih produk...</span>
        ) : (
          <>
            {selected.slice(0, SHOW_MAX).map((p) => (
              <span key={p.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                {p.nama}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(p.id); }} className="hover:opacity-70 leading-none ml-0.5">×</button>
              </span>
            ))}
            {selected.length > SHOW_MAX && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">
                +{selected.length - SHOW_MAX}
              </span>
            )}
          </>
        )}
        <span className="ml-auto text-gray-300 text-xs shrink-0">▾</span>
      </div>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-3 text-sm text-gray-400 text-center">Memuat data...</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                {query ? "Produk tidak ditemukan" : products.length === 0 ? "Belum ada produk di Data Master" : "Produk tidak ditemukan"}
              </p>
            ) : filtered.map((p) => {
              const checked = value.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${checked ? "bg-teal-50 text-teal-700" : "text-gray-700 hover:bg-gray-50"}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 transition-all ${checked ? "bg-teal-600 border-teal-600 text-white" : "border-gray-300"}`}>{checked ? "✓" : ""}</span>
                  <span>🧴 {p.nama}</span>
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100">
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:underline">Hapus semua</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Accordion Section ────────────────────────────────────────────────────────
function AccordionSection({ title, icon, defaultOpen = false, children, badge }: {
  title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${
          open ? "bg-indigo-50/40" : "bg-white hover:bg-gray-50/60"
        }`}>
        <span className="text-base leading-none">{icon}</span>
        <span className="flex-1 font-semibold text-gray-800 text-sm">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">{badge}</span>
        )}
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Reward System Editor ─────────────────────────────────────────────────────
function RewardEditor({ value, onChange }: { value: RewardConfig; onChange: (v: RewardConfig) => void }) {
  const upd = (patch: Partial<RewardConfig>) => onChange({ ...value, ...patch });
  const fixed       = value.fixed       ?? { enabled:false, rewardPerVideo:0, rewardPerLive:0, completionBonus:0 };
  const leaderboard = value.leaderboard ?? [];
  const consistency = value.consistency ?? { enabled:false, minUpload:5, rewardAmount:0 };
  const milestones  = value.milestones  ?? [];

  const addRule = () => {
    const rank = leaderboard.length + 1;
    upd({ leaderboard: [...leaderboard, { id:uid(), rank, ruleType:"Most Videos", label:`Juara ${rank}`, reward:0 }] });
  };
  const updRule = (id: string, p: Partial<LeaderboardRule>) =>
    upd({ leaderboard: leaderboard.map((r) => r.id===id ? {...r,...p} : r) });
  const delRule = (id: string) =>
    upd({ leaderboard: leaderboard.filter((r) => r.id!==id).map((r,i) => ({...r,rank:i+1})) });

  const addMilestone = () =>
    upd({ milestones: [...milestones, { id:uid(), type:"gmv", target:0, reward:0 }] });
  const updMilestone = (id: string, p: Partial<Milestone>) =>
    upd({ milestones: milestones.map((m) => m.id===id ? {...m,...p} : m) });
  const delMilestone = (id: string) =>
    upd({ milestones: milestones.filter((m) => m.id!==id) });

  const medal = (i: number) => ["🥇","🥈","🥉"][i] ?? `#${i+1}`;
  const inp   = "px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white";

  return (
    <div className="space-y-3 mt-2">
      {/* A — Ranking Reward */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">A. Ranking Reward</p>
          <p className="text-xs text-gray-400 mt-0.5">Reward untuk posisi teratas (Juara 1, 2, 3...)</p>
        </div>
        {leaderboard.map((rule, i) => (
          <div key={rule.id} className="flex items-center gap-2 bg-white rounded-xl p-3 border border-gray-100">
            <span className="text-lg w-7 text-center shrink-0">{medal(i)}</span>
            <input type="text" value={rule.label} onChange={(e) => updRule(rule.id,{label:e.target.value})}
              placeholder={`Juara ${i+1}`} className={`flex-1 min-w-0 ${inp}`} />
            <select value={rule.ruleType} onChange={(e) => updRule(rule.id,{ruleType:e.target.value})}
              className={`flex-1 min-w-0 ${inp}`}>
              {RULE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400">Rp</span>
              <input type="number" min="0" value={rule.reward||""} onChange={(e) => updRule(rule.id,{reward:Number(e.target.value)||0})}
                placeholder="0" className={`w-24 ${inp}`} />
            </div>
            <button type="button" onClick={() => delRule(rule.id)} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={addRule}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          + Add Reward Rule
        </button>
      </div>

      {/* B — Consistency Reward */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">B. Consistency Reward</p>
            <p className="text-xs text-gray-400 mt-0.5">Bonus untuk affiliator yang upload konsisten</p>
          </div>
          <Toggle enabled={consistency.enabled} onToggle={() => upd({consistency:{...consistency,enabled:!consistency.enabled}})} />
        </div>
        {consistency.enabled && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Minimal Upload (video)</label>
              <input type="number" min="1" value={consistency.minUpload||""} placeholder="5"
                onChange={(e) => upd({consistency:{...consistency,minUpload:Number(e.target.value)||0}})}
                className={`w-full ${inp}`} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Reward (Rp)</label>
              <input type="number" min="0" value={consistency.rewardAmount||""} placeholder="0"
                onChange={(e) => upd({consistency:{...consistency,rewardAmount:Number(e.target.value)||0}})}
                className={`w-full ${inp}`} />
            </div>
          </div>
        )}
      </div>

      {/* C — Milestone Reward */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">C. Milestone Reward</p>
          <p className="text-xs text-gray-400 mt-0.5">Reward berdasarkan pencapaian (10 video → Rp200rb)</p>
        </div>
        {milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2 bg-white rounded-xl p-3 border border-gray-100">
            <select value={m.type} onChange={(e) => updMilestone(m.id,{type:e.target.value as Milestone["type"]})}
              className={`w-24 shrink-0 ${inp}`}>
              <option value="upload">Upload</option>
              <option value="gmv">GMV</option>
              <option value="views">Views</option>
            </select>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-gray-400 shrink-0">Target</span>
              <input type="number" min="0" value={m.target||""} placeholder="0"
                onChange={(e) => updMilestone(m.id,{target:Number(e.target.value)||0})}
                className={`flex-1 min-w-0 ${inp}`} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400">Rp</span>
              <input type="number" min="0" value={m.reward||""} placeholder="0"
                onChange={(e) => updMilestone(m.id,{reward:Number(e.target.value)||0})}
                className={`w-24 ${inp}`} />
            </div>
            <button type="button" onClick={() => delMilestone(m.id)} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={addMilestone}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          + Add Milestone
        </button>
      </div>

      {/* Fixed Reward */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Fixed Reward (opsional)</p>
            <p className="text-xs text-gray-400 mt-0.5">Reward tetap per video / per live / completion</p>
          </div>
          <Toggle enabled={fixed.enabled} onToggle={() => upd({fixed:{...fixed,enabled:!fixed.enabled}})} />
        </div>
        {fixed.enabled && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
            {([["Per Video (Rp)","rewardPerVideo"],["Per Live (Rp)","rewardPerLive"],["Completion (Rp)","completionBonus"]] as const).map(([lbl,key]) => (
              <div key={key}>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">{lbl}</label>
                <input type="number" min="0" value={fixed[key]||""} placeholder="0"
                  onChange={(e) => upd({fixed:{...fixed,[key]:Number(e.target.value)||0}})}
                  className={`w-full ${inp}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────
function CampaignCard({ c }: { c: Campaign }) {
  const objectives   = parseJSON<string[]>(c.objectives, []);
  const rewardCfg    = parseJSON<RewardConfig>(c.rewardConfig, {});
  const rewardChips  = getRewardSummary(rewardCfg);
  const days         = daysLeft(c.endDate);
  const vis          = VISIBILITY_META[c.visibility] ?? VISIBILITY_META["Public"];
  const rawPct       = c.maxParticipants > 0
    ? Math.round((c.totalParticipants / c.maxParticipants) * 100)
    : null;
  const pct          = rawPct !== null ? rawPct : null;
  const isOverTarget = pct !== null && pct > 100;

  return (
    <Link href={`/program/campaigns/${c.id}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Banner */}
      <div className="relative h-28 bg-gradient-to-br from-indigo-500 to-violet-600 overflow-hidden shrink-0">
        {c.bannerPath && <img src={c.bannerPath} alt="" className="w-full h-full object-cover" />}
        {!c.bannerPath && <div className="absolute inset-0 flex items-center justify-center opacity-20 text-5xl">🎯</div>}
        <div className="absolute top-2.5 right-2.5"><StatusBadge status={c.status} /></div>
        <div className="absolute top-2.5 left-2.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-black/30 text-white text-[10px] font-medium rounded-full">
            {vis.icon} {c.visibility}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-indigo-700 transition-colors line-clamp-1">
          {c.nama}
        </h3>

        {/* Objectives */}
        {objectives.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {objectives.slice(0,2).map((obj) => <ObjectiveBadge key={obj} label={obj} />)}
            {objectives.length > 2 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded-full">+{objectives.length-2}</span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1.5 py-1">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-800">{fmt(c.totalParticipants)}</p>
            <p className="text-[9px] text-gray-400 uppercase">Peserta</p>
          </div>
          <div className="text-center border-x border-gray-100">
            <p className="text-sm font-bold text-gray-800">{fmt(c.totalVideos)}</p>
            <p className="text-[9px] text-gray-400 uppercase">Video</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-emerald-700">{fmtRp(c.totalGmv)}</p>
            <p className="text-[9px] text-gray-400 uppercase">GMV</p>
          </div>
        </div>

        {pct !== null && (
          <div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isOverTarget ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-indigo-500"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[9px] text-gray-400">
                {c.totalParticipants} peserta · Target: {c.maxParticipants}
              </p>
              {isOverTarget ? (
                <span className="text-[9px] font-bold text-orange-500">🔥 {pct}%</span>
              ) : (
                <span className="text-[9px] text-gray-400">{pct}%</span>
              )}
            </div>
          </div>
        )}

        {rewardChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-gray-50">
            {rewardChips.map((chip) => <span key={chip} className="text-[10px] text-indigo-600 font-medium">{chip}</span>)}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-gray-50 mt-auto">
          <div>
            {c.picSpecialist && <p className="text-[9px] text-gray-400">PIC: {c.picSpecialist.nama}</p>}
            {c.totalRewardPool > 0 && <p className="text-xs font-bold text-amber-600">{fmtRp(c.totalRewardPool)}</p>}
          </div>
          {days && (
            <p className={`text-xs font-semibold ${
              days === "Berakhir" ? "text-red-500" : days === "Hari ini" ? "text-amber-600" : "text-gray-500"
            }`}>{days}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Banner image compress (client-side canvas, target <2 MB) ────────────────
async function compressImage(file: File, maxMB = 2): Promise<File> {
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size <= maxBytes && file.type !== "image/png") return file; // already small enough (non-PNG)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > 1600) { height = Math.round(height * 1600 / width); width = 1600; }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        const tryQuality = (q: number) => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxBytes || q <= 0.5) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              tryQuality(Math.max(q - 0.15, 0.5));
            }
          }, "image/jpeg", q);
        };
        tryQuality(0.85);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
interface CreateForm {
  nama: string; slug: string; deskripsi: string;
  status: string; visibility: string;
  objectives: string[]; affiliateCategories: string[]; visualTake: string[];
  productFocusIds: number[];
  picSpecialistId: number|null;
  startDate: string; endDate: string;
  maxParticipants: string; catatan: string; rewardDeskripsi: string;
}

const EMPTY_FORM: CreateForm = {
  nama:"", slug:"", deskripsi:"",
  status:"Draft", visibility:"Public",
  objectives:[], affiliateCategories:[], visualTake:[],
  productFocusIds:[],
  picSpecialistId: null,
  startDate:"", endDate:"",
  maxParticipants:"", catatan:"", rewardDeskripsi:"",
};

const EMPTY_REWARD: RewardConfig = {
  fixed:       { enabled:false, rewardPerVideo:0, rewardPerLive:0, completionBonus:0 },
  leaderboard: [],
  consistency: { enabled:false, minUpload:5, rewardAmount:0 },
  milestones:  [],
};

function CreateModal({ specialists, categories, products, masterLoading, onClose, onCreated }: {
  specialists:   Specialist[];
  categories:    Category[];
  products:      Product[];
  masterLoading: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm]             = useState<CreateForm>(EMPTY_FORM);
  const [rewardConfig, setReward]   = useState<RewardConfig>(EMPTY_REWARD);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  // Banner
  const [bannerFile, setBannerFile]       = useState<File|null>(null);
  const [bannerPreview, setBannerPreview] = useState<string>("");
  const [bannerDrag, setBannerDrag]       = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof CreateForm>(k: K, v: CreateForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleBannerSelect(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setError("Format banner tidak didukung. Gunakan JPG, PNG, atau WEBP."); return; }
    const compressed = await compressImage(file);
    setBannerFile(compressed);
    const reader = new FileReader();
    reader.onload = (e) => setBannerPreview(e.target?.result as string);
    reader.readAsDataURL(compressed);
  }

  function removeBanner() { setBannerFile(null); setBannerPreview(""); if (bannerInputRef.current) bannerInputRef.current.value = ""; }

  const rewardBadge = (() => {
    let n = 0;
    if (rewardConfig.leaderboard?.length) n += rewardConfig.leaderboard.length;
    if (rewardConfig.consistency?.enabled) n++;
    if (rewardConfig.milestones?.length) n += rewardConfig.milestones.length;
    if (rewardConfig.fixed?.enabled) n++;
    return n > 0 ? `${n}` : undefined;
  })();

  async function submit(asDraft = false) {
    const nama = form.nama.trim();
    if (!nama) { setError("Nama campaign wajib diisi."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        nama,
        slug:                form.slug || slugify(nama),
        deskripsi:           form.deskripsi,
        status:              asDraft ? "Draft" : form.status,
        visibility:          form.visibility,
        objectives:          JSON.stringify(form.objectives),
        affiliateCategories: JSON.stringify(form.affiliateCategories),
        visualTake:          JSON.stringify(form.visualTake),
        productFocusIds:     form.productFocusIds,
        picSpecialistId:     form.picSpecialistId,
        startDate:           form.startDate || null,
        endDate:             form.endDate   || null,
        rewardConfig:        JSON.stringify(rewardConfig),
        rewardDeskripsi:     form.rewardDeskripsi,
        maxParticipants:     Number(form.maxParticipants) || 0,
        catatan:             form.catatan,
        isTemplate:          false,
      };

      const res = await fetch("/api/campaigns", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      if (!data.id) throw new Error("Respons tidak valid dari server");

      // Upload banner if selected (non-blocking: ignore error, campaign is already created)
      if (bannerFile) {
        try {
          const fd = new FormData();
          fd.append("banner", bannerFile);
          await fetch(`/api/campaigns/${data.id}/banner`, { method: "POST", body: fd });
        } catch { /* banner upload failure doesn't block campaign creation */ }
      }

      onCreated(data.id);
      onClose();
    } catch (err) {
      console.error("[CreateCampaign]", err);
      setError(err instanceof Error ? err.message : "Gagal menyimpan campaign. Coba lagi.");
    } finally { setSaving(false); }
  }

  // Category options from DB
  const categoryOptions = categories.map((c) => c.nama) as unknown as readonly string[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Buat Campaign Baru</h2>
            <p className="text-xs text-gray-400 mt-0.5">Isi detail campaign affiliate secara lengkap</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors text-xl">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <span className="text-red-500 shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Section 1: Basic Information ── */}
          <AccordionSection title="Basic Information" icon="📋" defaultOpen>
            <div className="space-y-4 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Nama Campaign <span className="text-red-500">*</span>
                </label>
                <input type="text" value={form.nama}
                  onChange={(e) => {
                    set("nama", e.target.value);
                    if (!form.slug || form.slug === slugify(form.nama))
                      set("slug", slugify(e.target.value));
                  }}
                  placeholder="e.g. Summer Glow Challenge"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {form.slug && (
                  <p className="text-[10px] text-gray-400 mt-1 font-mono">/{form.slug}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Deskripsi</label>
                <textarea rows={3} value={form.deskripsi}
                  onChange={(e) => set("deskripsi", e.target.value)}
                  placeholder="Jelaskan campaign secara singkat dan menarik..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* ── Banner Upload ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Campaign Banner
                  <span className="ml-1.5 text-gray-400 font-normal">(opsional)</span>
                </label>
                <input ref={bannerInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBannerSelect(f); }} />

                {bannerPreview ? (
                  /* ── Preview state ── */
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group">
                    <img src={bannerPreview} alt="Banner preview"
                      className="w-full object-cover"
                      style={{ maxHeight: "160px" }} />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button type="button" onClick={() => bannerInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white text-gray-800 text-xs font-semibold rounded-lg shadow hover:bg-gray-50 transition-colors">
                        🔄 Ganti
                      </button>
                      <button type="button" onClick={removeBanner}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg shadow hover:bg-red-600 transition-colors">
                        ✕ Hapus
                      </button>
                    </div>
                    {/* File info bar */}
                    <div className="px-3 py-1.5 bg-white border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 truncate">{bannerFile?.name}</span>
                      <span className="text-[10px] text-gray-400 shrink-0 ml-2">{((bannerFile?.size || 0) / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                ) : (
                  /* ── Drop zone state ── */
                  <button type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setBannerDrag(true); }}
                    onDragLeave={() => setBannerDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault(); setBannerDrag(false);
                      const f = e.dataTransfer.files?.[0]; if (f) handleBannerSelect(f);
                    }}
                    className={`w-full rounded-xl border-2 border-dashed py-7 flex flex-col items-center gap-2 transition-colors cursor-pointer ${
                      bannerDrag
                        ? "border-indigo-400 bg-indigo-50/60"
                        : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                    }`}>
                    <span className="text-2xl">🖼️</span>
                    <span className="text-sm font-semibold text-gray-600">Upload Campaign Banner</span>
                    <span className="text-xs text-gray-400">Drag & drop atau klik untuk memilih</span>
                    <span className="text-[10px] text-gray-300 mt-0.5">JPG, PNG, WEBP • Recommended: 1600×500px</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {["Draft","Ready","Published","Ongoing"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">PIC</label>
                  <PicDropdown
                    specialists={specialists}
                    value={form.picSpecialistId}
                    onChange={(id) => set("picSpecialistId", id)}
                    loading={masterLoading}
                  />
                </div>
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Visibility</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Public","Invite Only","Specialist Only"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => set("visibility", v)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-left ${
                        form.visibility === v
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}>
                      <span className="block text-base mb-0.5">{VISIBILITY_META[v].icon}</span>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </AccordionSection>

          {/* ── Section 2: Objectives & Target ── */}
          <AccordionSection title="Objectives & Target" icon="🎯" defaultOpen
            badge={form.objectives.length + form.affiliateCategories.length + form.visualTake.length + form.productFocusIds.length > 0
              ? `${form.objectives.length + form.affiliateCategories.length + form.visualTake.length + form.productFocusIds.length} selected`
              : undefined}>
            <div className="space-y-4 mt-3">
              {/* 1. Campaign Objectives */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Campaign Objectives</label>
                <MultiSelect
                  options={CAMPAIGN_OBJECTIVES}
                  value={form.objectives}
                  onChange={(v) => set("objectives", v)}
                  placeholder="Pilih objective campaign"
                />
              </div>

              {/* 2. Affiliate Categories */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Affiliate Categories
                  <span className="ml-1 text-gray-400 font-normal">(dari Data Master)</span>
                </label>
                <MultiSelect
                  options={categoryOptions}
                  value={form.affiliateCategories}
                  onChange={(v) => set("affiliateCategories", v)}
                  placeholder="Pilih kategori affiliator"
                  loading={masterLoading}
                />
              </div>

              {/* 3. Visual Take */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Visual Take
                  <span className="ml-1 text-gray-400 font-normal">(format konten)</span>
                </label>
                <MultiSelect
                  options={VISUAL_TAKE}
                  value={form.visualTake}
                  onChange={(v) => set("visualTake", v)}
                  placeholder="Pilih jenis visual take"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Digunakan untuk filter & matching affiliator berdasarkan format konten
                </p>
              </div>

              {/* 4. Product Focus */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Product Focus
                  <span className="ml-1 text-gray-400 font-normal">(dari Data Master)</span>
                </label>
                <ProductMultiSelect
                  products={products}
                  value={form.productFocusIds}
                  onChange={(ids) => set("productFocusIds", ids)}
                  loading={masterLoading}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Produk yang menjadi fokus campaign — untuk filter affiliate, analytics GMV, dan leaderboard produk
                </p>
              </div>

              {/* 5 & 6. Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal Mulai</label>
                  <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal Berakhir</label>
                  <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>

              {/* 7. Target Peserta */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Peserta</label>
                <input type="number" min="1" value={form.maxParticipants}
                  onChange={(e) => set("maxParticipants", e.target.value)}
                  placeholder="Target jumlah peserta campaign"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <p className="text-[10px] text-gray-400 mt-1">
                  Peserta tetap dapat bergabung walaupun target sudah tercapai
                </p>
              </div>
            </div>
          </AccordionSection>

          {/* ── Section 3: Reward System ── */}
          <AccordionSection title="Reward System" icon="🏆" badge={rewardBadge}>
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-3">Rancang struktur reward yang menarik untuk affiliator</p>
              <RewardEditor value={rewardConfig} onChange={setReward} />
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catatan Reward (opsional)</label>
                <input type="text" value={form.rewardDeskripsi}
                  onChange={(e) => set("rewardDeskripsi", e.target.value)}
                  placeholder="e.g. Reward dicairkan H+7 setelah campaign berakhir"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
          </AccordionSection>

          {/* ── Section 4: Internal Notes ── */}
          <AccordionSection title="Internal Notes" icon="📝">
            <div className="mt-3">
              <textarea rows={3} value={form.catatan}
                onChange={(e) => set("catatan", e.target.value)}
                placeholder="Catatan internal (tidak ditampilkan ke affiliator)..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </AccordionSection>
        </div>

        {/* ── Sticky Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50/50 rounded-b-2xl">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors">
              Batal
            </button>
            <div className="flex items-center gap-2">
              <button type="button" disabled={saving} onClick={() => submit(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Simpan Draft
              </button>
              <button type="button" disabled={saving} onClick={() => submit(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                ) : "Buat Campaign →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch]       = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: "ok"|"err" }|null>(null);

  // ── Centralized master data (module-level cache, survives modal open/close) ──
  const {
    specialists,
    categories,
    products,
    loading: masterLoading,
    refresh: refreshMaster,
  } = useMasterData();

  // Force a fresh master fetch every time the create modal opens
  // (catches any Data Master edits done since page load)
  useEffect(() => {
    if (showCreate) {
      console.log("[CampaignsPage] modal opened — refreshing master data");
      refreshMaster();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  // Read initial tab from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab") as FilterTab;
      if (t && TABS.includes(t)) setActiveTab(t);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res  = await fetch("/api/campaigns");
      if (!res.ok) { setCampaigns([]); return; }
      const data = await res.json() as Campaign[];
      setCampaigns(data);
    } catch (err) {
      console.error("[fetchCampaigns]", err);
      setCampaigns([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  function handleCreated(id: number) {
    setToast({ msg: "✓ Campaign berhasil dibuat!", type: "ok" });
    router.push(`/program/campaigns/${id}`);
  }

  const filtered = campaigns.filter((c) => {
    const matchTab    = activeTab === "All" || c.status === activeTab;
    const matchSearch = !search ||
      c.nama.toLowerCase().includes(search.toLowerCase()) ||
      c.deskripsi.toLowerCase().includes(search.toLowerCase()) ||
      (c.picSpecialist?.nama ?? "").toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const totalRewardPool   = campaigns.reduce((s, c) => s + c.totalRewardPool, 0);
  const totalParticipants = campaigns.reduce((s, c) => s + c.totalParticipants, 0);
  const totalVideos       = campaigns.reduce((s, c) => s + c.totalVideos, 0);
  const activeCount       = campaigns.filter((c) => c.status === "Ongoing").length;
  const tabCount          = (t: FilterTab) =>
    t === "All" ? campaigns.length : campaigns.filter((c) => c.status === t).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span>Program Center</span><span>/</span>
            <span className="text-indigo-600 font-medium">Campaigns</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Center 🎯</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage affiliate campaigns, leaderboard &amp; broadcast automation</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/program/campaigns/templates"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
            📋 Templates
          </Link>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
            <span className="text-base leading-none">+</span>Buat Campaign
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <SummaryCard label="Total Campaign"    value={campaigns.length}       icon="🎯" color="bg-indigo-50"  />
        <SummaryCard label="Active"            value={activeCount}            icon="🔥" color="bg-emerald-50" />
        <SummaryCard label="Total Peserta"     value={fmt(totalParticipants)} icon="👥" color="bg-blue-50"    />
        <SummaryCard label="Total Video"       value={fmt(totalVideos)}        icon="📹" color="bg-violet-50"  />
        <SummaryCard label="Total Reward Pool" value={fmtRp(totalRewardPool)} icon="🏆" color="bg-amber-50"   />
      </div>

      {/* ── Filter + Search ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === tab ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {tab}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-500"
              }`}>{tabCount(tab)}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm">🔍</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari campaign..."
            className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-72 animate-pulse">
              <div className="h-28 bg-gray-100 rounded-t-2xl" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="font-semibold text-gray-700 mb-1">
            {search ? "Campaign tidak ditemukan" : "Belum ada campaign"}
          </h3>
          <p className="text-sm text-gray-400 mb-5">
            {search ? `Tidak ada hasil untuk "${search}"` : "Buat campaign pertama Anda sekarang"}
          </p>
          {!search && (
            <button onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
              + Buat Campaign
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <CreateModal
          specialists={specialists}
          categories={categories}
          products={products}
          masterLoading={masterLoading}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
