"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VISUAL_TAKE } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Group { id: number; name: string; color: string; }
interface Category { id: number; nama: string; }
interface RecipientPreview {
  total: number; withWA: number;
  preview: { id: number; username: string; nama: string; wa: string; kategori: string; vt: string }[];
}
interface BroadcastJob {
  id: number; name: string; message: string; variations: string;
  targetJson: string; delayMode: string; senderNumber: string;
  totalQueued: number; totalSent: number; totalFailed: number;
  status: string; scheduledAt: string | null; sentAt: string | null; createdAt: string;
}
interface Preset { id: number; name: string; targetJson: string; }
interface CampaignSource {
  id:               number;
  nama:             string;
  joinSlug?:        string;
  status?:          string;
  startDate?:       string | null;
  endDate?:         string | null;
  rewardConfig?:    string;
  rewardDeskripsi?: string;
  picSpecialist?:   { id: number; nama: string } | null;
  campaignForm?:    { regFormPublicId: string; subFormPublicId: string } | null;
}
type RewardDisplayMode = "Auto Summary" | "Prize Pool" | "Detail Reward" | "Custom Text" | "Hide Reward";
type DurationFormat    = "Date Range" | "Total Days";
interface WaQueueItem {
  id: number; broadcastId: number | null; phone: string; message: string;
  recipientName: string; tiktokUsername: string; campaignId: number | null;
  campaignName: string; delayMode: string; status: string; attempts: number;
  errorReason: string; sentAt: string | null; createdAt: string;
  senderPhone: string; senderSessionId: number | null;
}
interface QueueSummary { pending: number; processing: number; success: number; failed: number; retry: number; }
interface AutoLogEntry {
  ts:      string;
  name:    string;
  phone:   string;
  status:  "success" | "failed" | "retry";
  waitSec: number;
}
interface ProcessResult {
  processed:    number;
  success:      number;
  failed:       number;
  remaining:    number;
  waConnected:  boolean;
  nextDelayMs:  number;
  delayMode:    string;
  error?:       string;
  lastRecipient?: { name: string; phone: string; status: "success" | "failed" | "retry" };
}
interface WorkerLog {
  ts:       string;
  type:     "info" | "success" | "failed" | "retry" | "warn" | "done";
  message:  string;
  name?:    string;
  phone?:   string;
  sessionId?: number;
  waitSec?: number;
}
interface WorkerState {
  active:       boolean;
  broadcastId:  number | null;
  currentItem:  { id: number; recipientName: string; phone: string } | null;
  nextSendAt:   string | null;
  logs:         WorkerLog[];
  stats:        { processed: number; success: number; failed: number; retry: number };
  startedAt:    string | null;
  stoppedAt:    string | null;
  error:        string | null;
}

// ─── Group color map ──────────────────────────────────────────────────────────
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
function gStyle(c: string) { return GROUP_COLORS[c] ?? GROUP_COLORS.indigo; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SMART_VARS = [
  { key: "{username}",          label: "@Username"       },
  { key: "{nama}",              label: "Nama Affiliate"  },
  { key: "{campaign_name}",     label: "Nama Campaign"   },
  { key: "{reward_section}",    label: "Reward Section"  },
  { key: "{campaign_duration}", label: "Durasi Campaign" },
  { key: "{join_link}",         label: "Link Daftar"     },
  { key: "{submission_link}",   label: "Link Submit"     },
  { key: "{pic_name}",          label: "Nama PIC"        },
];

const REWARD_MODES: { id: RewardDisplayMode; label: string }[] = [
  { id: "Auto Summary",  label: "⚡ Auto Summary"  },
  { id: "Prize Pool",    label: "💰 Prize Pool"    },
  { id: "Detail Reward", label: "🏆 Detail Reward" },
  { id: "Custom Text",   label: "✏️ Custom"        },
  { id: "Hide Reward",   label: "🚫 Sembunyikan"   },
];

const DURATION_FORMATS: { id: DurationFormat; label: string }[] = [
  { id: "Date Range", label: "📅 Date Range" },
  { id: "Total Days", label: "⏱️ Total Hari"  },
];

// ─── Reward helpers (client-side — mirrors server-side buildRewardSection) ─────
interface RewardCfg {
  leaderboard?: { rank?: number; reward?: number; label?: string }[];
  fixed?:       { rewardPerVideo?: number };
  consistency?: { rewardAmount?: number };
  total?:       number;
}

function fmtRupiah(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} juta`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}rb`;
  return n.toLocaleString("id-ID");
}

function generateRewardSection(
  mode:            RewardDisplayMode,
  rewardConfigJson = "{}",
  rewardDeskripsi  = "",
  customText       = "",
): string {
  if (mode === "Hide Reward") return "";
  if (mode === "Custom Text") return customText ? `🎁 Reward:\n${customText}` : "(tulis custom reward...)";

  let cfg: RewardCfg = {};
  try { cfg = JSON.parse(rewardConfigJson) as RewardCfg; } catch { /* empty */ }

  if (mode === "Auto Summary") {
    const parts: string[] = [];
    if (cfg.leaderboard?.length) {
      const top = Math.max(...cfg.leaderboard.map((r) => r.reward ?? 0));
      if (top > 0) parts.push(`hingga Rp${fmtRupiah(top)}`);
    }
    if (cfg.fixed?.rewardPerVideo)     parts.push(`Rp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`);
    if (cfg.consistency?.rewardAmount) parts.push(`bonus konsistensi`);
    if (parts.length) return `🎁 Reward ${parts.join(" + ")}`;
    return rewardDeskripsi ? `🎁 Reward:\n${rewardDeskripsi}` : "🎁 Reward menarik menanti!";
  }

  if (mode === "Prize Pool") {
    let total = cfg.total ?? 0;
    if (!total && cfg.leaderboard?.length)
      total = cfg.leaderboard.reduce((s, r) => s + (r.reward ?? 0), 0);
    if (!total && cfg.consistency?.rewardAmount) total += cfg.consistency.rewardAmount;
    if (!total && cfg.fixed?.rewardPerVideo)
      return `🎁 Reward:\nRp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`;
    return total > 0 ? `🎁 Total Prize Pool:\nRp${total.toLocaleString("id-ID")}` : "🎁 Reward menarik!";
  }

  if (mode === "Detail Reward") {
    const lines = ["🏆 Reward:"];
    if (cfg.leaderboard?.length) {
      cfg.leaderboard.forEach((r) => {
        lines.push(`${r.label || `Juara ${r.rank ?? "?"}`} — Rp${(r.reward ?? 0).toLocaleString("id-ID")}`);
      });
    }
    if (cfg.fixed?.rewardPerVideo)     lines.push(`Rp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`);
    if (cfg.consistency?.rewardAmount) lines.push(`+ Bonus konsistensi: Rp${fmtRupiah(cfg.consistency.rewardAmount)}`);
    if (lines.length === 1) return rewardDeskripsi ? `🏆 Reward:\n${rewardDeskripsi}` : "🏆 Reward menarik!";
    return lines.join("\n");
  }

  return rewardDeskripsi ? `🎁 Reward:\n${rewardDeskripsi}` : "🎁 Reward menarik!";
}

function generateDuration(
  format:     DurationFormat,
  startDate?: string | null,
  endDate?:   string | null,
): string {
  if (!startDate && !endDate) return "[Durasi Campaign]";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  if (format === "Total Days" && startDate && endDate) {
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    return `${days} Hari`;
  }
  if (startDate && endDate) return `${fmt(startDate)} - ${fmt(endDate)}`;
  if (endDate)              return `s/d ${fmt(endDate)}`;
  return fmt(startDate!);
}

const DELAY_MODES = [
  { id: "Fast",   label: "⚡ Fast",   desc: "10–25 detik",   cls: "text-amber-600"   },
  { id: "Normal", label: "🚀 Normal", desc: "30–60 detik",   cls: "text-indigo-600"  },
  { id: "Safe",   label: "🛡️ Safe",   desc: "60–120 detik",  cls: "text-emerald-600" },
];

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  draft:   { bg: "bg-gray-100",    text: "text-gray-600",    label: "Draft"     },
  queued:  { bg: "bg-blue-50",     text: "text-blue-700",    label: "Antrian"   },
  sending: { bg: "bg-amber-50",    text: "text-amber-700",   label: "Mengirim"  },
  paused:  { bg: "bg-orange-50",   text: "text-orange-700",  label: "Dijeda"    },
  done:    { bg: "bg-emerald-50",  text: "text-emerald-700", label: "Selesai"   },
  failed:  { bg: "bg-red-50",      text: "text-red-700",     label: "Gagal"     },
};

function insertVar(textarea: HTMLTextAreaElement | null, v: string, setter: (s: string) => void) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const val   = textarea.value;
  const next  = val.slice(0, start) + v + val.slice(end);
  setter(next);
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + v.length, start + v.length);
  }, 0);
}

interface PreviewVars {
  reward_section?:    string;
  campaign_duration?: string;
  join_link?:         string;
  submission_link?:   string;
  pic_name?:          string;
  campaign_name?:     string;
}

function resolvePreview(
  msg:             string,
  previewRecipient = { username: "creator123", nama: "Budi Santoso" },
  campaignVars?:   PreviewVars,
) {
  const cv = campaignVars ?? {};
  return msg
    .replace(/{username}/g,          previewRecipient.username)
    .replace(/{nama}/g,              previewRecipient.nama)
    .replace(/{campaign_name}/g,     cv.campaign_name     || "[Nama Campaign]")
    .replace(/{reward_section}/g,    cv.reward_section    || "[Reward Section]")
    .replace(/{campaign_duration}/g, cv.campaign_duration || "[Durasi Campaign]")
    .replace(/{join_link}/g,         cv.join_link         || "[Link Daftar]")
    .replace(/{submission_link}/g,   cv.submission_link   || "[Link Submit]")
    .replace(/{pic_name}/g,          cv.pic_name          || "[Nama PIC]")
    // backward-compat
    .replace(/{deadline}/g, cv.campaign_duration || "[Deadline]")
    .replace(/{reward}/g,   cv.reward_section    || "[Reward]")
    .replace(/{link}/g,     cv.join_link         || "[Link Join]");
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CAMPAIGN_BROADCAST_TEMPLATE = `Halo {username}! 👋

Kami mengundang kamu untuk join campaign:

🔥 {campaign_name}

{reward_section}

🗓️ Durasi Campaign:
{campaign_duration}

🔗 Join sekarang:
{join_link}

Yuk gas upload konten terbaik kamu 🚀`;

const QUEUE_STATUS_META: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  pending:    { bg: "bg-gray-100",   text: "text-gray-600",    label: "Menunggu",   dot: "bg-gray-400"    },
  processing: { bg: "bg-amber-50",   text: "text-amber-700",   label: "Proses",     dot: "bg-amber-500"   },
  success:    { bg: "bg-emerald-50", text: "text-emerald-700", label: "Terkirim",   dot: "bg-emerald-500" },
  failed:     { bg: "bg-red-50",     text: "text-red-700",     label: "Gagal",      dot: "bg-red-500"     },
  retry:      { bg: "bg-violet-50",  text: "text-violet-700",  label: "Retry",      dot: "bg-violet-500"  },
};

// ─── WA Sender Status Card ────────────────────────────────────────────────────
const WA_STATUS_CONFIG: Record<string, { dot: string; badge: string; text: string; label: string }> = {
  connected:    { dot: "bg-emerald-400 animate-pulse", badge: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Terhubung" },
  disconnected: { dot: "bg-red-400",                   badge: "bg-red-50 border-red-200",         text: "text-red-700",     label: "Tidak terhubung" },
  connecting:   { dot: "bg-amber-400 animate-pulse",   badge: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "Menyambungkan..." },
  qr_ready:     { dot: "bg-violet-400 animate-pulse",  badge: "bg-violet-50 border-violet-200",   text: "text-violet-700",  label: "Scan QR" },
  reconnecting: { dot: "bg-orange-400 animate-pulse",  badge: "bg-orange-50 border-orange-200",   text: "text-orange-700",  label: "Reconnecting..." },
};

function WaSenderCard({ waStatus, senderNumber, onRefresh }: {
  waStatus: { status: string; phone: string | null; connectedAt: string | null; error: string | null };
  senderNumber: string;
  onRefresh: () => void;
}) {
  const cfg = WA_STATUS_CONFIG[waStatus.status] ?? WA_STATUS_CONFIG.disconnected;
  const displayPhone = senderNumber || waStatus.phone;

  return (
    <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition-all ${cfg.badge}`}>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
          {waStatus.status === "connected" && displayPhone && (
            <span className="text-xs text-gray-600 font-mono">— {displayPhone}</span>
          )}
        </div>
        {waStatus.status === "connected" && waStatus.connectedAt && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Aktif sejak {new Date(waStatus.connectedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {waStatus.status !== "connected" && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            Hubungkan WA di <Link href="/automation" className="text-indigo-500 hover:underline">Automation Center</Link>
          </p>
        )}
        {waStatus.error && (
          <p className="text-[11px] text-red-500 mt-0.5 truncate">{waStatus.error}</p>
        )}
      </div>
      <button onClick={onRefresh}
        title="Refresh status"
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-sm leading-none">
        ↻
      </button>
    </div>
  );
}

// ─── MultiSelect Tag ──────────────────────────────────────────────────────────
function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium">
      {label}
      <button onClick={onRemove} className="opacity-60 hover:opacity-100 leading-none">✕</button>
    </span>
  );
}

// ─── Targeting Panel ──────────────────────────────────────────────────────────
interface TargetConfig {
  type: "All" | "Group" | "Category" | "VisualTake" | "Manual";
  groups: string[];
  categories: string[];
  visualTakes: string[];
  manualSearch: string;
  manualIds: number[];    // selected affiliate IDs in Manual include mode
  excludeIds: number[];   // affiliate IDs to always exclude (any mode)
}

// ─── Affiliate Picker List ────────────────────────────────────────────────────
interface AffiliatePick {
  id: number; username: string; nama: string; wa: string; kategori: string; vt: string;
}

function AffiliatePickerList({
  selectedIds, onToggle, onSelectAll, onClearAll, accent = "indigo",
}: {
  selectedIds: number[];
  onToggle:    (a: AffiliatePick) => void;
  onSelectAll: (items: AffiliatePick[]) => void;
  onClearAll:  () => void;
  accent?:     "indigo" | "red";
}) {
  const [search,   setSearch]   = useState("");
  const [list,     setList]     = useState<AffiliatePick[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ type: "All", limit: "300" });
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`/api/broadcast/recipients?${params}`);
        if (res.ok && active) {
          const d = await res.json() as { affiliates?: AffiliatePick[] };
          setList(Array.isArray(d.affiliates) ? d.affiliates : []);
        }
      } finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  const selSet   = new Set(selectedIds);
  const waCount  = list.filter((a) => selSet.has(a.id) && a.wa).length;
  const chkCls   = accent === "indigo" ? "bg-indigo-600 border-indigo-600" : "bg-red-500 border-red-500";
  const rowSelCls= accent === "indigo" ? "bg-indigo-50/60" : "bg-red-50/40";

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {selectedIds.length > 0 && (
          <p className={`text-xs font-semibold ${accent === "indigo" ? "text-indigo-600" : "text-red-600"}`}>
            {selectedIds.length} dipilih{waCount > 0 ? ` · ${waCount} punya WA ✓` : ""}
          </p>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <button onClick={() => onSelectAll(list)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
            ☑ Pilih Semua ({list.length})
          </button>
          <button onClick={onClearAll}
            className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">
            🗑 Hapus Semua
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 Cari username, nama, kategori, WA..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* List */}
      <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Memuat...</span>
          </div>
        ) : list.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Tidak ada affiliate yang ditemukan</p>
        ) : list.map((a) => {
          const checked = selSet.has(a.id);
          return (
            <button key={a.id} onClick={() => onToggle(a)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${checked ? rowSelCls : ""}`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? chkCls : "border-gray-300"}`}>
                {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-800 truncate">@{a.username || "—"}</span>
                  {a.nama && a.nama !== a.username && (
                    <span className="text-xs text-gray-400 truncate">· {a.nama}</span>
                  )}
                </div>
                {(a.kategori || a.vt) && (
                  <p className="text-[10px] text-gray-400 truncate">{[a.kategori, a.vt].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              {a.wa
                ? <span className="text-[10px] text-emerald-600 font-bold shrink-0">✓ WA</span>
                : <span className="text-[10px] text-gray-300 shrink-0">no WA</span>
              }
            </button>
          );
        })}
      </div>
      {list.length >= 300 && (
        <p className="text-[10px] text-gray-400 text-center">
          Menampilkan 300 pertama — gunakan search untuk filter lebih spesifik
        </p>
      )}
    </div>
  );
}

function TargetingPanel({ config, onChange, groups, categories, recipients, loadingRecipients }: {
  config: TargetConfig;
  onChange: (c: TargetConfig) => void;
  groups: Group[];
  categories: Category[];
  recipients: RecipientPreview | null;
  loadingRecipients: boolean;
}) {
  const [groupSearch,  setGroupSearch]  = useState("");
  const [catSearch,    setCatSearch]    = useState("");
  const [vtSearch,     setVtSearch]     = useState("");
  const [showExclude,  setShowExclude]  = useState(false);

  function setType(t: TargetConfig["type"]) { onChange({ ...config, type: t }); }
  function toggleGroup(name: string) {
    const next = config.groups.includes(name)
      ? config.groups.filter((g) => g !== name)
      : [...config.groups, name];
    onChange({ ...config, type: "Group", groups: next });
  }
  function toggleCat(name: string) {
    const next = config.categories.includes(name)
      ? config.categories.filter((c) => c !== name)
      : [...config.categories, name];
    onChange({ ...config, type: "Category", categories: next });
  }
  function toggleVt(name: string) {
    const next = config.visualTakes.includes(name)
      ? config.visualTakes.filter((v) => v !== name)
      : [...config.visualTakes, name];
    onChange({ ...config, type: "VisualTake", visualTakes: next });
  }

  const filteredGroups = groups.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()));
  const filteredCats   = categories.filter((c) => c.nama.toLowerCase().includes(catSearch.toLowerCase()));
  const filteredVts    = VISUAL_TAKE.filter((v) => v.toLowerCase().includes(vtSearch.toLowerCase()));

  const TYPE_TABS: { id: TargetConfig["type"]; label: string; emoji: string }[] = [
    { id: "All",        label: "Semua",       emoji: "👥" },
    { id: "Group",      label: "Group",       emoji: "🏷️" },
    { id: "Category",   label: "Kategori",    emoji: "📁" },
    { id: "VisualTake", label: "Visual Take", emoji: "🎬" },
    { id: "Manual",     label: "Manual",      emoji: "🔍" },
  ];

  return (
    <div className="space-y-4">
      {/* Type tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPE_TABS.map((t) => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              config.type === t.id
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Filter body */}
      {config.type === "All" && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-4 text-center">
          <p className="text-sm font-semibold text-indigo-700">📢 Broadcast ke semua affiliate aktif</p>
          <p className="text-xs text-indigo-500 mt-1">Semua affiliate dengan status Aktif akan menjadi penerima</p>
        </div>
      )}

      {config.type === "Group" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {config.groups.map((g) => {
              const grp = groups.find((x) => x.name === g);
              const s   = gStyle(grp?.color || "indigo");
              return (
                <span key={g} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${s.bg} ${s.text} ${s.border}`}>
                  {g}
                  <button onClick={() => toggleGroup(g)} className="opacity-60 hover:opacity-100">✕</button>
                </span>
              );
            })}
            {config.groups.length === 0 && <span className="text-xs text-gray-400">Pilih satu atau beberapa group</span>}
          </div>
          <input type="text" placeholder="Cari group..." value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
            {filteredGroups.length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">Belum ada group</p>
              : filteredGroups.map((g) => {
                  const s = gStyle(g.color);
                  return (
                    <button key={g.id} onClick={() => toggleGroup(g.name)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-gray-50 ${config.groups.includes(g.name) ? "bg-indigo-50/60" : ""}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${config.groups.includes(g.name) ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                        {config.groups.includes(g.name) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>{g.name}</span>
                    </button>
                  );
                })
            }
          </div>
        </div>
      )}

      {config.type === "Category" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {config.categories.map((c) => <Tag key={c} label={c} onRemove={() => toggleCat(c)} />)}
            {config.categories.length === 0 && <span className="text-xs text-gray-400">Pilih satu atau beberapa kategori</span>}
          </div>
          <input type="text" placeholder="Cari kategori..." value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
            {filteredCats.map((c) => (
              <button key={c.id} onClick={() => toggleCat(c.nama)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors ${config.categories.includes(c.nama) ? "bg-indigo-50/60" : ""}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${config.categories.includes(c.nama) ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                  {config.categories.includes(c.nama) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="text-sm text-gray-700">{c.nama}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {config.type === "VisualTake" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {config.visualTakes.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold bg-violet-50 text-violet-700 border-violet-200">
                {v}<button onClick={() => toggleVt(v)} className="opacity-60 hover:opacity-100">✕</button>
              </span>
            ))}
            {config.visualTakes.length === 0 && <span className="text-xs text-gray-400">Pilih satu atau beberapa visual take</span>}
          </div>
          <input type="text" placeholder="Cari visual take..." value={vtSearch}
            onChange={(e) => setVtSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1">
            {filteredVts.map((v) => (
              <button key={v} onClick={() => toggleVt(v)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors ${config.visualTakes.includes(v) ? "bg-violet-50/60" : ""}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${config.visualTakes.includes(v) ? "bg-violet-600 border-violet-600" : "border-gray-300"}`}>
                  {config.visualTakes.includes(v) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">{v}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {config.type === "Manual" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Pilih creator satu per satu — hanya yang dicentang yang akan menerima broadcast
          </p>
          <AffiliatePickerList
            selectedIds={config.manualIds}
            onToggle={(a) => {
              const next = config.manualIds.includes(a.id)
                ? config.manualIds.filter((id) => id !== a.id)
                : [...config.manualIds, a.id];
              onChange({ ...config, manualIds: next });
            }}
            onSelectAll={(items) => {
              const merged = Array.from(new Set([...config.manualIds, ...items.map((a) => a.id)]));
              onChange({ ...config, manualIds: merged });
            }}
            onClearAll={() => onChange({ ...config, manualIds: [] })}
            accent="indigo"
          />
          {config.manualIds.length === 0 && (
            <p className="text-xs text-amber-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠️ Centang minimal 1 creator untuk broadcast
            </p>
          )}
        </div>
      )}

      {/* Exclude section — available for all target modes */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowExclude((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
          <div className="flex items-center gap-2">
            <span>🚫</span>
            <span className="text-sm font-semibold text-gray-700">Kecualikan creator tertentu</span>
            {config.excludeIds.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                {config.excludeIds.length} dikecualikan
              </span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{showExclude ? "▲" : "▼"}</span>
        </button>
        {showExclude && (
          <div className="px-4 py-3 border-t border-gray-100 space-y-3">
            <p className="text-xs text-gray-500">
              Creator yang dicentang di sini <strong>tidak akan</strong> menerima broadcast, meskipun masuk dalam filter target di atas.
            </p>
            <AffiliatePickerList
              selectedIds={config.excludeIds}
              onToggle={(a) => {
                const next = config.excludeIds.includes(a.id)
                  ? config.excludeIds.filter((id) => id !== a.id)
                  : [...config.excludeIds, a.id];
                onChange({ ...config, excludeIds: next });
              }}
              onSelectAll={(items) => {
                const merged = Array.from(new Set([...config.excludeIds, ...items.map((a) => a.id)]));
                onChange({ ...config, excludeIds: merged });
              }}
              onClearAll={() => onChange({ ...config, excludeIds: [] })}
              accent="red"
            />
          </div>
        )}
      </div>

      {/* Live Preview */}
      <div className={`rounded-xl border p-4 transition-all ${loadingRecipients ? "border-gray-100 bg-gray-50" : recipients && recipients.total > 0 ? "border-indigo-100 bg-indigo-50" : "border-gray-100 bg-gray-50"}`}>
        {loadingRecipients ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Menghitung penerima...</span>
          </div>
        ) : recipients ? (
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-indigo-700">{recipients.total}</p>
                <p className="text-xs text-indigo-500">Total Affiliate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">{recipients.withWA}</p>
                <p className="text-xs text-emerald-500">Punya WA</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{recipients.total - recipients.withWA}</p>
                <p className="text-xs text-amber-500">Tanpa WA</p>
              </div>
            </div>
            {recipients.preview.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500">Preview penerima:</p>
                {recipients.preview.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-700">@{r.username}</span>
                    {r.wa ? <span className="text-emerald-500 font-semibold">✓ WA</span> : <span className="text-red-400">✗ No WA</span>}
                    {r.kategori && <span className="text-gray-400">· {r.kategori}</span>}
                  </div>
                ))}
                {recipients.total > 5 && <p className="text-xs text-gray-400">...dan {recipients.total - 5} lainnya</p>}
              </div>
            )}
            {config.excludeIds.length > 0 && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5">
                🚫 {config.excludeIds.length} creator dikecualikan
              </p>
            )}
            {recipients.total === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">Tidak ada affiliate yang sesuai filter</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Pilih target untuk melihat jumlah penerima</p>
        )}
      </div>
    </div>
  );
}

// ─── Template Settings ────────────────────────────────────────────────────────
function TemplateSettings({
  campaign, rewardDisplayMode, setRewardDisplayMode,
  customRewardText, setCustomRewardText, durationFormat, setDurationFormat,
}: {
  campaign:             CampaignSource;
  rewardDisplayMode:    RewardDisplayMode;
  setRewardDisplayMode: (m: RewardDisplayMode) => void;
  customRewardText:     string;
  setCustomRewardText:  (s: string) => void;
  durationFormat:       DurationFormat;
  setDurationFormat:    (f: DurationFormat) => void;
}) {
  const rewardPreview   = generateRewardSection(rewardDisplayMode, campaign.rewardConfig, campaign.rewardDeskripsi, customRewardText);
  const durationPreview = generateDuration(durationFormat, campaign.startDate, campaign.endDate);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="font-bold text-gray-900">⚙️ Template Settings</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Konfigurasi variabel <code className="bg-gray-100 px-1 rounded text-[11px]">{"{reward_section}"}</code>{" "}
          dan <code className="bg-gray-100 px-1 rounded text-[11px]">{"{campaign_duration}"}</code>
        </p>
      </div>

      {/* Reward Display Mode */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reward Display Mode</p>
        <div className="flex flex-wrap gap-2">
          {REWARD_MODES.map((m) => (
            <button key={m.id} onClick={() => setRewardDisplayMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                rewardDisplayMode === m.id
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {rewardDisplayMode === "Custom Text" && (
          <textarea
            value={customRewardText}
            onChange={(e) => setCustomRewardText(e.target.value)}
            rows={3}
            placeholder="Contoh: Paid collaboration + free sample untuk creator terbaik"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}

        {/* Reward preview box */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5">
            Preview <code className="bg-white px-1 rounded border border-gray-200">{"{reward_section}"}</code>
          </p>
          {rewardPreview ? (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{rewardPreview}</pre>
          ) : (
            <p className="text-xs text-gray-400 italic">(disembunyikan — tidak ditampilkan di pesan)</p>
          )}
        </div>
      </div>

      {/* Duration Format */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration Format</p>
        <div className="flex gap-2">
          {DURATION_FORMATS.map((f) => (
            <button key={f.id} onClick={() => setDurationFormat(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                durationFormat === f.id
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Duration preview box */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5">
            Preview <code className="bg-white px-1 rounded border border-gray-200">{"{campaign_duration}"}</code>
          </p>
          <p className="text-xs text-gray-700 font-medium">{durationPreview}</p>
        </div>
      </div>

      {/* Campaign info chips */}
      <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-50">
        {campaign.picSpecialist?.nama && (
          <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-1 rounded-full">
            👤 PIC: {campaign.picSpecialist.nama}
          </span>
        )}
        {campaign.startDate && (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2.5 py-1 rounded-full">
            📅 Mulai: {new Date(campaign.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
        {campaign.endDate && (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2.5 py-1 rounded-full">
            🏁 Selesai: {new Date(campaign.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Message Composer ─────────────────────────────────────────────────────────
function MessageComposer({ message, setMessage, variations, setVariations, campaignVars }: {
  message: string; setMessage: (s: string) => void;
  variations: string[]; setVariations: (v: string[]) => void;
  campaignVars?: PreviewVars;
}) {
  const [activeVar, setActiveVar]     = useState(0); // 0 = main, 1+ = variation index
  const [showPreview, setShowPreview] = useState(false);
  const mainRef = useRef<HTMLTextAreaElement>(null);
  const varRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const currentMsg = activeVar === 0 ? message : (variations[activeVar - 1] || "");
  const setCurrentMsg = (s: string) => {
    if (activeVar === 0) setMessage(s);
    else {
      const next = [...variations];
      next[activeVar - 1] = s;
      setVariations(next);
    }
  };
  const activeRef = activeVar === 0 ? mainRef : { current: varRefs.current[activeVar - 1] };

  function addVariation() {
    setVariations([...variations, ""]);
    setActiveVar(variations.length + 1);
  }
  function removeVariation(i: number) {
    const next = variations.filter((_, idx) => idx !== i);
    setVariations(next);
    setActiveVar(0);
  }

  return (
    <div className="space-y-4">
      {/* Smart variable chips */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Variabel Pintar</p>
        <div className="flex gap-1.5 flex-wrap">
          {SMART_VARS.map((v) => (
            <button key={v.key} onClick={() => insertVar(activeRef.current, v.key, setCurrentMsg)}
              className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-medium hover:bg-indigo-100 transition-colors">
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs: Main + Variations */}
      <div>
        <div className="flex items-center gap-1 mb-2 border-b border-gray-100 pb-2">
          <button onClick={() => setActiveVar(0)}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors ${activeVar === 0 ? "bg-white text-indigo-700 border border-b-white border-gray-200 -mb-[1px]" : "text-gray-400 hover:text-gray-600"}`}>
            Pesan Utama
          </button>
          {variations.map((_, i) => (
            <div key={i} className="flex items-center">
              <button onClick={() => setActiveVar(i + 1)}
                className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors ${activeVar === i + 1 ? "bg-white text-violet-700 border border-b-white border-gray-200 -mb-[1px]" : "text-gray-400 hover:text-gray-600"}`}>
                Variasi {i + 1}
              </button>
              <button onClick={() => removeVariation(i)} className="text-gray-300 hover:text-red-400 ml-0.5 text-xs">✕</button>
            </div>
          ))}
          <button onClick={addVariation}
            className="ml-1 px-2 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 border border-dashed border-gray-200 hover:border-indigo-200 transition-colors">
            + Variasi
          </button>
        </div>

        {activeVar === 0 ? (
          <textarea ref={mainRef} value={message} onChange={(e) => setMessage(e.target.value)} rows={7}
            placeholder="Tulis pesan broadcast kamu di sini...

Contoh:
Halo {username}! 👋

Kami mengundang kamu bergabung di campaign terbaru kami.

{reward_section}

🗓️ Durasi Campaign:
{campaign_duration}

🔗 Join sekarang:
{join_link}

Yuk gas upload konten terbaik kamu 🚀"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed" />
        ) : (
          <textarea
            ref={(el) => { varRefs.current[activeVar - 1] = el; }}
            value={variations[activeVar - 1] || ""}
            onChange={(e) => setCurrentMsg(e.target.value)} rows={7}
            placeholder={`Variasi ${activeVar} — pesan alternatif (dipilih secara acak saat mengirim)`}
            className="w-full border border-violet-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono leading-relaxed bg-violet-50/30" />
        )}

        {variations.length > 0 && (
          <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            💡 {variations.length + 1} variasi pesan — sistem akan memilih secara acak per penerima untuk mengurangi pesan identik
          </p>
        )}
      </div>

      {/* Preview toggle */}
      <button onClick={() => setShowPreview((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
        <span>{showPreview ? "🔼" : "🔽"}</span>
        {showPreview ? "Sembunyikan preview" : "👁️ Preview pesan"}
      </button>

      {showPreview && message && (
        <div className="space-y-3">
          <div className="bg-[#ECE5DD] rounded-2xl p-4 space-y-2">
            <p className="text-xs text-gray-500 font-semibold">WhatsApp Preview — creator123</p>
            <div className="bg-white rounded-xl rounded-tl-sm px-4 py-3 shadow-sm max-w-xs">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {resolvePreview(message, { username: "creator123", nama: "Budi Santoso" }, campaignVars)}
              </p>
              <p className="text-[10px] text-gray-400 mt-2 text-right">12:00 ✓✓</p>
            </div>
          </div>
          {campaignVars && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 space-y-0.5">
              <p className="font-semibold text-gray-500 mb-1">Variable Preview</p>
              {campaignVars.reward_section    && <p><span className="font-mono text-indigo-500">{"{reward_section}"}</span> → {campaignVars.reward_section.split("\n")[0]}{campaignVars.reward_section.includes("\n") ? "…" : ""}</p>}
              {campaignVars.campaign_duration && <p><span className="font-mono text-indigo-500">{"{campaign_duration}"}</span> → {campaignVars.campaign_duration}</p>}
              {campaignVars.join_link         && <p><span className="font-mono text-indigo-500">{"{join_link}"}</span> → <span className="break-all">{campaignVars.join_link}</span></p>}
              {campaignVars.submission_link   && <p><span className="font-mono text-indigo-500">{"{submission_link}"}</span> → <span className="break-all">{campaignVars.submission_link}</span></p>}
              {!campaignVars.join_link        && <p className="text-amber-500 text-[10px]">⚠️ Registration Form belum dibuat untuk campaign ini</p>}
              {campaignVars.pic_name          && <p><span className="font-mono text-indigo-500">{"{pic_name}"}</span> → {campaignVars.pic_name}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History Table ────────────────────────────────────────────────────────────
function BroadcastHistory({ jobs, onDelete, onUpdateStatus, onMonitor }: {
  jobs: BroadcastJob[];
  onDelete: (id: number) => void;
  onUpdateStatus: (id: number, status: string, sent: number, failed: number) => void;
  onMonitor: (id: number) => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-semibold text-gray-700">Belum ada broadcast dikirim</p>
        <p className="text-sm text-gray-400 mt-1">Buat broadcast pertama kamu di atas</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900">Riwayat Broadcast</h3>
        <p className="text-xs text-gray-400 mt-0.5">{jobs.length} broadcast</p>
      </div>
      <div className="divide-y divide-gray-50">
        {jobs.map((job) => {
          const meta   = STATUS_META[job.status] ?? STATUS_META.draft;
          const target = (() => { try { return JSON.parse(job.targetJson) as { type?: string }; } catch { return {}; } })();
          const vars   = (() => { try { return JSON.parse(job.variations) as string[]; } catch { return []; } })();

          return (
            <div key={job.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
                    <span className="text-xs text-gray-400">{formatDate(job.createdAt)}</span>
                    {job.name && <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{job.name}</span>}
                    {vars.length > 0 && <span className="text-xs text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">{vars.length + 1} variasi</span>}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2 font-mono leading-relaxed">{job.message}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>🎯 {(target as { type?: string }).type || "—"}</span>
                    <span>📦 {job.totalQueued} antrean</span>
                    <span className="text-emerald-600">✓ {job.totalSent} terkirim</span>
                    {job.totalFailed > 0 && <span className="text-red-500">✗ {job.totalFailed} gagal</span>}
                    <span>⏱️ {job.delayMode}</span>
                    {job.senderNumber && <span>📱 {job.senderNumber}</span>}
                  </div>
                  {/* Quick status update */}
                  {["queued","sending","paused"].includes(job.status) && (
                    <div className="flex items-center gap-2 mt-3">
                      {job.status === "queued" && (
                        <button onClick={() => onUpdateStatus(job.id, "sending", job.totalSent, job.totalFailed)}
                          className="px-3 py-1 bg-amber-500 text-white text-xs rounded-lg font-semibold hover:bg-amber-600">▶ Mulai Kirim</button>
                      )}
                      {job.status === "sending" && (
                        <>
                          <button onClick={() => onUpdateStatus(job.id, "paused", job.totalSent, job.totalFailed)}
                            className="px-3 py-1 bg-orange-100 text-orange-700 text-xs rounded-lg font-semibold hover:bg-orange-200">⏸ Jeda</button>
                          <button onClick={() => onUpdateStatus(job.id, "done", job.totalQueued, 0)}
                            className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-lg font-semibold hover:bg-emerald-200">✓ Tandai Selesai</button>
                        </>
                      )}
                      {job.status === "paused" && (
                        <button onClick={() => onUpdateStatus(job.id, "sending", job.totalSent, job.totalFailed)}
                          className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-lg font-semibold hover:bg-indigo-200">▶ Lanjutkan</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Progress ring */}
                  {job.totalQueued > 0 && (
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-50 border border-gray-100">
                        <span className="text-xs font-bold text-gray-700">
                          {Math.round((job.totalSent / job.totalQueued) * 100)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{job.totalSent}/{job.totalQueued}</p>
                    </div>
                  )}
                  <button onClick={() => onMonitor(job.id)}
                    title="Lihat queue monitor"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors text-sm">📡</button>
                  <button onClick={() => onDelete(job.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">🗑️</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Save Preset Modal ────────────────────────────────────────────────────────
function SavePresetModal({ onSave, onClose }: {
  onSave: (name: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900">Simpan Preset Target</h3>
        <input type="text" placeholder="Nama preset..." value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus />
        <p className="text-xs text-gray-400">Contoh: "VIP Creator Beauty", "Inframe Aktif"</p>
        <div className="flex gap-3">
          <button onClick={() => { if (name.trim()) onSave(name.trim()); }}
            disabled={!name.trim()}
            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">Simpan</button>
          <button onClick={onClose} className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Batal</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function BroadcastPageInner() {
  const searchParams = useSearchParams();

  const [groups, setGroups]           = useState<Group[]>([]);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [presets, setPresets]         = useState<Preset[]>([]);
  const [jobs, setJobs]               = useState<BroadcastJob[]>([]);

  const [targetConfig, setTargetConfig] = useState<TargetConfig>({
    type: "All", groups: [], categories: [], visualTakes: [],
    manualSearch: "", manualIds: [], excludeIds: [],
  });
  const [recipients, setRecipients]       = useState<RecipientPreview | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [message, setMessage]         = useState("");
  const [variations, setVariations]   = useState<string[]>([]);
  const [broadcastName, setBroadcastName] = useState("");
  const [delayMode, setDelayMode]         = useState("Normal");
  const [senderNumber, setSenderNumber]   = useState("");
  const [scheduledAt, setScheduledAt]     = useState("");

  // Multi-session sender
  type SenderMode = "Single" | "Rotation" | "Batch";
  interface SessionSummary { id: number; name: string; phone: string; status: string; sentToday: number; dailyLimit: number; healthScore: number; }
  const [senderMode, setSenderMode]           = useState<SenderMode>("Single");
  const [senderSessionIds, setSenderSessionIds] = useState<number[]>([]);
  const [availSessions, setAvailSessions]     = useState<SessionSummary[]>([]);

  // Campaign context (from ?campaign_id=xx)
  const [campaignSource, setCampaignSource] = useState<CampaignSource | null>(null);
  const [campaignId, setCampaignId]         = useState<number | null>(null);
  const [campaignName, setCampaignName]     = useState("");

  // Template settings (reward + duration mode — campaign-context only)
  const [rewardDisplayMode, setRewardDisplayMode] = useState<RewardDisplayMode>("Auto Summary");
  const [customRewardText,  setCustomRewardText]  = useState("");
  const [durationFormat,    setDurationFormat]    = useState<DurationFormat>("Date Range");

  // Queue monitor
  const [queueItems, setQueueItems]       = useState<WaQueueItem[]>([]);
  const [queueSummary, setQueueSummary]   = useState<QueueSummary>({ pending: 0, processing: 0, success: 0, failed: 0, retry: 0 });
  const [monitorBroadcastId, setMonitorBroadcastId] = useState<number | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [showMonitor, setShowMonitor]     = useState(false);

  // Background worker state (replaces client-side auto-send loop)
  const [workerStatus, setWorkerStatus]   = useState<WorkerState | null>(null);
  const [countdown, setCountdown]         = useState(0);
  const [startingWorker, setStartingWorker] = useState(false); // prevent double-click on Start Auto
  const nextSendAtRef                     = useRef<string | null>(null);
  const workerPollRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  // WA session status (from Automation Center)
  const [waStatus, setWaStatus] = useState<{
    status: string; phone: string | null; connectedAt: string | null; error: string | null;
  }>({ status: "disconnected", phone: null, connectedAt: null, error: null });

  const [sending, setSending]         = useState(false);
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [showPresetsPanel, setShowPresetsPanel] = useState(false);
  const [toast, setToast]             = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  // Fetch WA status and auto-fill sender
  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status");
      if (res.ok) {
        const d = await res.json() as { status: string; phone: string | null; connectedAt: string | null; error: string | null };
        setWaStatus(d);
        // Auto-fill sender from connected phone
        if (d.status === "connected" && d.phone) {
          setSenderNumber(d.phone);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch available WA sessions for sender picker
  const fetchAvailSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/wa-sessions");
      if (res.ok) {
        const data = await res.json() as SessionSummary[];
        setAvailSessions(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  // Load groups, categories, presets, jobs
  const loadAll = useCallback(async () => {
    const [gRes, cRes, pRes, jRes] = await Promise.allSettled([
      fetch("/api/groups"),
      fetch("/api/master"),
      fetch("/api/broadcast/presets"),
      fetch("/api/broadcast"),
    ]);
    if (gRes.status === "fulfilled" && gRes.value.ok) {
      const d = await gRes.value.json() as Group[];
      setGroups(Array.isArray(d) ? d : []);
    }
    if (cRes.status === "fulfilled" && cRes.value.ok) {
      const d = await cRes.value.json() as { categories?: Category[] };
      setCategories(d.categories ?? []);
    }
    if (pRes.status === "fulfilled" && pRes.value.ok) {
      const d = await pRes.value.json() as Preset[];
      setPresets(Array.isArray(d) ? d : []);
    }
    if (jRes.status === "fulfilled" && jRes.value.ok) {
      const d = await jRes.value.json() as BroadcastJob[];
      setJobs(Array.isArray(d) ? d : []);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    void fetchWaStatus();
    void fetchAvailSessions();
    // Poll WA status every 15s to catch connect/disconnect changes
    const poll = setInterval(() => { void fetchWaStatus(); void fetchAvailSessions(); }, 15_000);
    return () => clearInterval(poll);
  }, [loadAll, fetchWaStatus, fetchAvailSessions]);

  // Handle campaign_id from URL
  useEffect(() => {
    const cid = searchParams.get("campaign_id");
    if (!cid) return;
    fetch(`/api/campaigns/${cid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CampaignSource | null) => {
        if (!data) return;
        setCampaignId(data.id);
        setCampaignName(data.nama);
        setCampaignSource(data);
        setMessage(CAMPAIGN_BROADCAST_TEMPLATE);
        setBroadcastName(`Recruitment — ${data.nama}`);
      })
      .catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve recipients when target config changes (debounced 600ms)
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingRecipients(true);
      try {
        const params = new URLSearchParams({ type: targetConfig.type });
        if (targetConfig.groups.length)      params.set("groups",      targetConfig.groups.join(","));
        if (targetConfig.categories.length)  params.set("categories",  targetConfig.categories.join(","));
        if (targetConfig.visualTakes.length) params.set("visualTakes", targetConfig.visualTakes.join(","));
        if (targetConfig.manualIds.length)   params.set("manualIds",   targetConfig.manualIds.join(","));
        if (targetConfig.excludeIds.length)  params.set("excludeIds",  targetConfig.excludeIds.join(","));
        if (targetConfig.manualSearch)       params.set("search",      targetConfig.manualSearch);
        const res = await fetch(`/api/broadcast/recipients?${params}`);
        if (res.ok) { const d = await res.json() as RecipientPreview; setRecipients(d); }
      } finally { setLoadingRecipients(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [targetConfig]);

  // Load queue for a specific broadcast
  const loadQueue = useCallback(async (bid: number) => {
    const res = await fetch(`/api/wa-queue?broadcastId=${bid}&limit=200`);
    if (res.ok) {
      const d = await res.json() as { items: WaQueueItem[]; summary: QueueSummary };
      setQueueItems(d.items ?? []);
      setQueueSummary(d.summary ?? { pending: 0, processing: 0, success: 0, failed: 0, retry: 0 });
    }
  }, []);

  // Build target JSON for API
  function buildTargetJson() {
    return JSON.stringify({
      type:         targetConfig.type,
      groups:       targetConfig.groups,
      categories:   targetConfig.categories,
      visualTakes:  targetConfig.visualTakes,
      manualSearch: targetConfig.manualSearch,
      manualIds:    targetConfig.manualIds,
      excludeIds:   targetConfig.excludeIds,
    });
  }

  async function handleSend() {
    if (!message.trim()) { showToast("⚠️ Pesan tidak boleh kosong"); return; }
    if (!recipients || recipients.withWA === 0) { showToast("⚠️ Tidak ada penerima dengan nomor WA"); return; }
    if (!availSessions.some((s) => s.status === "CONNECTED")) {
      showToast("⚠️ WhatsApp belum terhubung. Hubungkan minimal satu akun di Automation Center.");
      return;
    }

    setSending(true);
    try {
      const r = await fetch("/api/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:              broadcastName,
          message,
          variations,
          targetJson:        buildTargetJson(),
          delayMode,
          senderNumber,
          senderMode,
          senderSessionIds: senderMode !== "Single" ? senderSessionIds : [],
          totalQueued:       recipients.withWA,
          status:            "queued",
          scheduledAt:       scheduledAt || null,
          campaignId:        campaignId ?? undefined,
          campaignName:      campaignName || undefined,
          // Template engine settings (campaign context only)
          ...(campaignSource ? {
            rewardDisplayMode,
            customRewardText: rewardDisplayMode === "Custom Text" ? customRewardText : undefined,
            durationFormat,
          } : {}),
        }),
      });
      if (r.ok) {
        const created = await r.json() as { id: number };
        showToast("✅ Broadcast berhasil dibuat dan masuk antrian WA!");
        setMessage(""); setVariations([]); setBroadcastName(""); setScheduledAt("");
        if (!campaignSource) { setCampaignId(null); setCampaignName(""); }
        await loadAll();
        // Auto-open monitor for newly created broadcast
        if (created?.id) {
          setMonitorBroadcastId(created.id);
          setShowMonitor(true);
          await loadQueue(created.id);
        }
      } else {
        const d = await r.json() as { error?: string };
        showToast(`❌ ${d.error || "Gagal membuat broadcast"}`);
      }
    } finally { setSending(false); }
  }

  async function savePreset(name: string) {
    const r = await fetch("/api/broadcast/presets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetJson: buildTargetJson() }),
    });
    if (r.ok) { showToast("✅ Preset disimpan!"); setShowPresetSave(false); await loadAll(); }
  }

  async function loadPreset(p: Preset) {
    try {
      const t = JSON.parse(p.targetJson) as Partial<TargetConfig>;
      setTargetConfig({
        type:         (t.type as TargetConfig["type"]) || "All",
        groups:       t.groups      || [],
        categories:   t.categories  || [],
        visualTakes:  t.visualTakes || [],
        manualSearch: t.manualSearch || "",
        manualIds:    t.manualIds   || [],
        excludeIds:   t.excludeIds  || [],
      });
      showToast(`✅ Preset "${p.name}" dimuat`);
      setShowPresetsPanel(false);
    } catch { showToast("❌ Gagal memuat preset"); }
  }

  async function deletePreset(id: number) {
    await fetch(`/api/broadcast/presets/${id}`, { method: "DELETE" });
    await loadAll();
  }

  async function deleteJob(id: number) {
    await fetch(`/api/broadcast/${id}`, { method: "DELETE" });
    await loadAll();
  }

  async function updateJobStatus(id: number, status: string, sent: number, failed: number) {
    await fetch(`/api/broadcast/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, totalSent: sent, totalFailed: failed, ...(status === "done" ? { sentAt: new Date().toISOString() } : {}) }),
    });
    await loadAll();
  }

  // ── Countdown tick (1s) ────────────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const nsa = nextSendAtRef.current;
      if (!nsa) { setCountdown(0); return; }
      const remaining = Math.max(0, Math.ceil((Date.parse(nsa) - Date.now()) / 1000));
      setCountdown(remaining);
    }, 1_000);
    return () => clearInterval(tick);
  }, []);

  // ── Worker poll (2s when monitor open) ────────────────────────────────────
  useEffect(() => {
    if (!showMonitor) {
      if (workerPollRef.current) { clearInterval(workerPollRef.current); workerPollRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/wa-queue/worker");
        if (!res.ok) return;
        const data = await res.json() as WorkerState;
        setWorkerStatus(data);
        nextSendAtRef.current = data.nextSendAt;

        // Refresh queue items while worker is active
        if (data.active && monitorBroadcastId) {
          void loadQueue(monitorBroadcastId);
        }
        // Worker just finished — reload job list
        if (!data.active && data.stoppedAt) {
          void loadAll();
          if (monitorBroadcastId) void loadQueue(monitorBroadcastId);
        }
      } catch { /* ignore */ }
    };
    void poll();
    workerPollRef.current = setInterval(poll, 2_000);
    return () => { if (workerPollRef.current) { clearInterval(workerPollRef.current); workerPollRef.current = null; } };
  }, [showMonitor, monitorBroadcastId, loadQueue, loadAll]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (workerPollRef.current) clearInterval(workerPollRef.current);
    };
  }, []);

  function stopAutoRun() {
    void fetch("/api/wa-queue/worker", { method: "DELETE" });
  }

  async function startAutoRun() {
    if (!monitorBroadcastId || startingWorker || isAutoRunning) return;
    setStartingWorker(true);
    try {
      const res = await fetch("/api/wa-queue/worker", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broadcastId: monitorBroadcastId }),
      });
      if (res.ok) {
        const d = await res.json() as { ok: boolean; error?: string };
        if (!d.ok && d.error) showToast(`❌ ${d.error}`);
      }
    } catch { /* ignore */ } finally {
      setStartingWorker(false);
    }
  }

  async function handleProcessQueue() {
    if (!monitorBroadcastId) return;
    setProcessingQueue(true);
    try {
      const r = await fetch(`/api/wa-queue/process?limit=1&broadcastId=${monitorBroadcastId}`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string; workerActive?: boolean };
        if (d.workerActive) {
          showToast("ℹ️ Background worker sedang aktif — gunakan tombol Stop/Start di atas");
        } else {
          showToast(`❌ ${d.error || "Gagal memproses antrian"}`);
        }
        return;
      }
      const d = await r.json() as ProcessResult;
      if (!d.waConnected) { showToast("⚠️ WA tidak terhubung. Hubungkan dulu di Automation Center."); }
      else if (d.error) { showToast(`❌ ${d.error}`); }
      else { showToast(`✅ Diproses: ${d.processed} pesan (${d.success} sukses, ${d.failed} gagal)`); }
      await loadQueue(monitorBroadcastId);
      await loadAll();
    } finally { setProcessingQueue(false); }
  }

  async function openMonitor(broadcastId: number) {
    // Stop worker if it's running for a different broadcast
    if (workerStatus?.active && workerStatus?.broadcastId !== broadcastId) {
      stopAutoRun();
    }
    setMonitorBroadcastId(broadcastId);
    setShowMonitor(true);
    await loadQueue(broadcastId);
  }

  const waConnected  = availSessions.some((s) => s.status === "CONNECTED") || waStatus.status === "connected";
  const canSend = message.trim() && recipients && recipients.withWA > 0 && waConnected;

  // ── Derived worker state ──────────────────────────────────────────────────
  const isAutoRunning =
    workerStatus?.active === true &&
    (workerStatus?.broadcastId === monitorBroadcastId || !monitorBroadcastId);

  const autoLog: AutoLogEntry[] = (workerStatus?.logs ?? [])
    .filter((l) => l.type === "success" || l.type === "failed" || l.type === "retry")
    .map((l) => ({
      ts:      new Date(l.ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      name:    l.name || l.message,
      phone:   l.phone || "",
      status:  l.type as AutoLogEntry["status"],
      waitSec: l.waitSec || 0,
    }));

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}
      {showPresetSave && <SavePresetModal onSave={savePreset} onClose={() => setShowPresetSave(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Broadcast Engine</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recruitment & Reminder — Sumber: Database Affiliate</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPresetsPanel((v) => !v)}
            className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            📋 Preset {presets.length > 0 && <span className="ml-1 text-xs bg-gray-100 px-1.5 rounded-full">{presets.length}</span>}
          </button>
          <Link href="/program/campaigns"
            className="border border-gray-200 text-gray-500 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            ← Campaign Center
          </Link>
        </div>
      </div>

      {/* Campaign Source Banner */}
      {campaignSource && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <span className="text-lg">🎯</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide">Campaign Source</p>
            <p className="text-sm font-bold text-indigo-700 truncate">{campaignSource.nama}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/program/campaigns/${campaignSource.id}`}
              className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors">
              Lihat Campaign
            </Link>
            <button onClick={() => { setCampaignSource(null); setCampaignId(null); setCampaignName(""); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-indigo-300 hover:text-red-400 hover:bg-red-50 transition-colors text-xs">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Presets Panel */}
      {showPresetsPanel && presets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-3">Saved Presets</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {presets.map((p) => {
              const t = (() => { try { return JSON.parse(p.targetJson) as { type?: string }; } catch { return {}; } })();
              return (
                <div key={p.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                  <button onClick={() => loadPreset(p)} className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(t as { type?: string }).type || "All"}</p>
                  </button>
                  <button onClick={() => deletePreset(p.id)} className="text-gray-300 hover:text-red-400 text-xs">🗑️</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Targeting */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">🎯 Target Audience</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pilih siapa yang akan menerima pesan</p>
            </div>
            <button onClick={() => setShowPresetSave(true)}
              className="text-xs text-indigo-600 border border-indigo-100 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
              💾 Simpan Preset
            </button>
          </div>
          <TargetingPanel
            config={targetConfig}
            onChange={setTargetConfig}
            groups={groups}
            categories={categories}
            recipients={recipients}
            loadingRecipients={loadingRecipients}
          />
        </div>

        {/* Right — Message */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-bold text-gray-900">✉️ Pesan</h2>
            <p className="text-xs text-gray-400 mt-0.5">Tulis pesan dengan variabel pintar & spinning</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nama Broadcast (opsional)</label>
            <input type="text" placeholder="Mis. Recruitment Ramadan 2025..." value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <MessageComposer
            message={message}
            setMessage={setMessage}
            variations={variations}
            setVariations={setVariations}
            campaignVars={campaignSource ? (() => {
              const GFORM    = "https://docs.google.com/forms/d/e";
              const regId    = campaignSource.campaignForm?.regFormPublicId?.trim();
              const subId    = campaignSource.campaignForm?.subFormPublicId?.trim();
              const origin   = typeof window !== "undefined" ? window.location.origin : "";
              const joinLink = regId
                ? `${GFORM}/${regId}/viewform`
                : campaignSource.joinSlug ? `${origin}/join/${campaignSource.joinSlug}` : "";
              return {
                campaign_name:     campaignSource.nama,
                reward_section:    generateRewardSection(rewardDisplayMode, campaignSource.rewardConfig, campaignSource.rewardDeskripsi, customRewardText),
                campaign_duration: generateDuration(durationFormat, campaignSource.startDate, campaignSource.endDate),
                join_link:         joinLink,
                submission_link:   subId ? `${GFORM}/${subId}/viewform` : "",
                pic_name:          campaignSource.picSpecialist?.nama || "",
              };
            })() : undefined}
          />
        </div>
      </div>

      {/* Template Settings — only shown when campaign context is active */}
      {campaignSource && (
        <TemplateSettings
          campaign={campaignSource}
          rewardDisplayMode={rewardDisplayMode}
          setRewardDisplayMode={setRewardDisplayMode}
          customRewardText={customRewardText}
          setCustomRewardText={setCustomRewardText}
          durationFormat={durationFormat}
          setDurationFormat={setDurationFormat}
        />
      )}

      {/* Delivery Settings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-4">⚙️ Pengiriman</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Delay mode */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Delay Mode</p>
            <div className="space-y-2">
              {DELAY_MODES.map((m) => (
                <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${delayMode === m.id ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input type="radio" name="delay" value={m.id} checked={delayMode === m.id}
                    onChange={(e) => setDelayMode(e.target.value)} className="text-indigo-600" />
                  <div>
                    <p className={`text-sm font-semibold ${m.cls}`}>{m.label}</p>
                    <p className="text-xs text-gray-400">{m.desc} per pesan</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">⚠️ Gunakan Safe Mode untuk jumlah penerima besar (&gt;100)</p>
          </div>

          {/* Sender & Schedule */}
          <div className="space-y-4 md:col-span-2">

            {/* WhatsApp Sender Status Card */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">WhatsApp Pengirim</p>
              <WaSenderCard
                waStatus={waStatus}
                senderNumber={senderNumber}
                onRefresh={fetchWaStatus}
              />
            </div>

            {/* ── Multi-Sender Mode ────────────────────────────────────────── */}
            {availSessions.length > 1 && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sender Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["Single", "Rotation", "Batch"] as SenderMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSenderMode(m)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-center ${senderMode === m ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {m === "Single" ? "☝️ Single" : m === "Rotation" ? "🔄 Rotasi" : "📦 Batch"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  {senderMode === "Single" && "Semua pesan dikirim dari 1 akun (default primary)."}
                  {senderMode === "Rotation" && "Akun bergantian per pesan — distribusi merata."}
                  {senderMode === "Batch" && "Pembagian merata: setiap akun dapat blok penerima sendiri."}
                </p>

                {/* Session picker (shown for Rotation & Batch) */}
                {senderMode !== "Single" && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">Pilih Akun Sender:</p>
                    {availSessions.map((sess) => {
                      const connected = sess.status === "CONNECTED";
                      const pct       = sess.dailyLimit > 0 ? Math.min(100, Math.round((sess.sentToday / sess.dailyLimit) * 100)) : 0;
                      const sel       = senderSessionIds.includes(sess.id);
                      return (
                        <label
                          key={sess.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${sel ? "border-indigo-300 bg-indigo-50" : connected ? "border-gray-200 hover:border-gray-300" : "border-gray-100 opacity-50 cursor-not-allowed"}`}
                        >
                          <input
                            type="checkbox"
                            disabled={!connected}
                            checked={sel}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSenderSessionIds((prev) => [...prev, sess.id]);
                              } else {
                                setSenderSessionIds((prev) => prev.filter((id) => id !== sess.id));
                              }
                            }}
                            className="text-indigo-600 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? "bg-emerald-400" : "bg-gray-300"}`}/>
                              <span className="text-xs font-medium text-gray-800 truncate">{sess.name}</span>
                              {sess.phone && <span className="text-xs text-gray-400">+{sess.phone}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                                <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }}/>
                              </div>
                              <span className="text-xs text-gray-400 whitespace-nowrap">{sess.sentToday}/{sess.dailyLimit}</span>
                            </div>
                          </div>
                          <span className={`text-xs shrink-0 ${sess.healthScore >= 90 ? "text-emerald-600" : sess.healthScore >= 60 ? "text-amber-600" : "text-red-500"}`}>
                            {sess.healthScore.toFixed(0)}%
                          </span>
                        </label>
                      );
                    })}
                    {senderSessionIds.length === 0 && (
                      <p className="text-xs text-amber-500">⚠️ Pilih minimal 1 akun sender</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Jadwalkan Pengiriman (opsional)</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-400 mt-1.5">Kosongkan jika ingin segera mulai</p>
            </div>

            {/* Summary card */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ringkasan Broadcast</p>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-gray-400">Target</span>
                <span className="font-medium text-gray-800">
                  {targetConfig.type === "Manual"
                    ? `${targetConfig.manualIds.length} creator dipilih`
                    : targetConfig.type === "All" ? "Semua affiliate" : targetConfig.type}
                  {targetConfig.excludeIds.length > 0 && (
                    <span className="ml-1 text-red-500 text-xs">(-{targetConfig.excludeIds.length})</span>
                  )}
                </span>
                <span className="text-gray-400">Penerima WA</span>
                <span className={`font-bold ${recipients && recipients.withWA > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                  {recipients ? recipients.withWA : "—"}
                </span>
                <span className="text-gray-400">Variasi pesan</span>
                <span className="font-medium text-gray-800">{variations.length + 1} variasi</span>
                <span className="text-gray-400">Delay mode</span>
                <span className="font-medium text-gray-800">{delayMode}</span>
                <span className="text-gray-400">Sender mode</span>
                <span className="font-medium text-gray-800">
                  {senderMode === "Single" ? "Single" : senderMode === "Rotation" ? `Rotasi (${senderSessionIds.length} akun)` : `Batch (${senderSessionIds.length} akun)`}
                </span>
                <span className="text-gray-400">WA Pengirim</span>
                <span className={`font-medium ${waConnected ? "text-emerald-600" : "text-red-500"}`}>
                  {waConnected ? senderNumber || waStatus.phone || "—" : "Belum terhubung"}
                </span>
                {scheduledAt && <>
                  <span className="text-gray-400">Dijadwalkan</span>
                  <span className="font-medium text-gray-800">{new Date(scheduledAt).toLocaleString("id-ID")}</span>
                </>}
              </div>

              <button onClick={handleSend} disabled={!canSend || sending}
                className={`w-full mt-4 py-3 rounded-xl text-sm font-bold transition-all ${canSend && !sending ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {sending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Membuat broadcast...
                  </span>
                ) : scheduledAt ? (
                  `📅 Jadwalkan ke ${recipients?.withWA || 0} penerima`
                ) : (
                  `📢 Buat Broadcast ke ${recipients?.withWA || 0} penerima`
                )}
              </button>

              {!waConnected && (
                <p className="text-xs text-red-400 text-center mt-2 flex items-center justify-center gap-1">
                  🔴 WhatsApp belum terhubung —{" "}
                  <Link href="/automation" className="underline hover:text-red-600">Buka Automation Center</Link>
                </p>
              )}
              {waConnected && !message.trim() && (
                <p className="text-xs text-amber-500 text-center mt-2">⚠️ Tulis pesan terlebih dahulu</p>
              )}
              {waConnected && message.trim() && recipients && recipients.withWA === 0 && (
                <p className="text-xs text-amber-500 text-center mt-2">⚠️ Tidak ada penerima dengan nomor WhatsApp</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <BroadcastHistory jobs={jobs} onDelete={deleteJob} onUpdateStatus={updateJobStatus} onMonitor={openMonitor} />

      {/* Queue Monitor */}
      {showMonitor && monitorBroadcastId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Monitor header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-900">📡 Queue Monitor</h3>
              <p className="text-xs text-gray-400 mt-0.5">Broadcast #{monitorBroadcastId} — delivery log real-time</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => void loadQueue(monitorBroadcastId!)}
                className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                🔄 Refresh
              </button>

              {/* Countdown pill (shown when auto-running and waiting) */}
              {isAutoRunning && countdown > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-mono font-semibold">
                  ⏱ {countdown}s
                </span>
              )}

              {/* Start Auto / Stop toggle */}
              {!isAutoRunning ? (
                <button
                  onClick={() => void startAutoRun()}
                  disabled={startingWorker || (queueSummary.pending === 0 && queueSummary.retry === 0)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    startingWorker || (queueSummary.pending === 0 && queueSummary.retry === 0)
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                  }`}>
                  {startingWorker ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                      Memulai...
                    </span>
                  ) : "▶ Start Auto"}
                </button>
              ) : (
                <button onClick={stopAutoRun}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all">
                  ⏸ Stop
                </button>
              )}

              <button onClick={() => { stopAutoRun(); setShowMonitor(false); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 transition-colors text-sm">✕</button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-4 flex-wrap">
            {(["pending","processing","success","failed","retry"] as const).map((s) => {
              const m = QUEUE_STATUS_META[s];
              const count = queueSummary[s] || 0;
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${m.dot}`} />
                  <span className="text-xs text-gray-500">{m.label}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${m.bg} ${m.text}`}>{count}</span>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 ml-auto">
              Total: {Object.values(queueSummary).reduce((a, b) => a + b, 0)} pesan
            </p>
          </div>

          {/* Live auto-send log */}
          {(isAutoRunning || autoLog.length > 0) && (
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Log</p>
                {isAutoRunning ? (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Auto-send aktif
                      {countdown > 0 && (
                        <span className="text-gray-400">
                          — berikutnya{" "}
                          <span className="font-mono font-bold text-amber-600">{countdown}s</span>
                        </span>
                      )}
                    </span>
                    {workerStatus?.stats && (
                      <span className="text-xs text-gray-400 font-mono">
                        ✓{workerStatus.stats.success} ✗{workerStatus.stats.failed} ↺{workerStatus.stats.retry}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {workerStatus?.stats && workerStatus.stats.processed > 0 && (
                      <span className="text-xs text-gray-400 font-mono">
                        ✓{workerStatus.stats.success} ✗{workerStatus.stats.failed} ↺{workerStatus.stats.retry}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">Selesai</span>
                  </div>
                )}
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {autoLog.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Menunggu kiriman pertama...</p>
                ) : autoLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                    <span className="text-gray-400 font-mono shrink-0">{entry.ts}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.status === "success" ? "bg-emerald-400" :
                      entry.status === "failed"  ? "bg-red-400"     : "bg-violet-400"
                    }`} />
                    <span className="font-medium text-gray-700 truncate min-w-0">{entry.name}</span>
                    <span className="text-gray-400 font-mono shrink-0">{entry.phone}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      entry.status === "success" ? "bg-emerald-50 text-emerald-700" :
                      entry.status === "failed"  ? "bg-red-50 text-red-700"         : "bg-violet-50 text-violet-700"
                    }`}>
                      {entry.status === "success" ? "✓ Terkirim" : entry.status === "failed" ? "✗ Gagal" : "↺ Retry"}
                    </span>
                    {entry.waitSec > 0 && (
                      <span className="text-gray-300 text-[10px] shrink-0">→ {entry.waitSec}s</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queue table */}
          {queueItems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-gray-500">Belum ada item di antrian</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Penerima</th>
                    <th className="text-left px-3 py-3">Nomor WA</th>
                    <th className="text-left px-3 py-3">Sender</th>
                    <th className="text-left px-3 py-3">Status</th>
                    <th className="text-left px-3 py-3">Waktu Kirim</th>
                    <th className="text-left px-3 py-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {queueItems.map((item) => {
                    const m = QUEUE_STATUS_META[item.status] ?? QUEUE_STATUS_META.pending;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-800">@{item.tiktokUsername || item.recipientName}</p>
                          {item.campaignName && <p className="text-xs text-gray-400">📣 {item.campaignName}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-gray-600">{item.phone}</span>
                        </td>
                        <td className="px-3 py-3">
                          {item.senderPhone || item.senderSessionId ? (
                            <div className="text-xs">
                              {(() => {
                                const sess = availSessions.find((s) => s.id === item.senderSessionId);
                                return sess ? (
                                  <span className="text-gray-700 font-medium">{sess.name}</span>
                                ) : item.senderPhone ? (
                                  <span className="font-mono text-gray-500">+{item.senderPhone}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                );
                              })()}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                            {m.label}
                          </span>
                          {item.attempts > 0 && <span className="ml-1.5 text-xs text-gray-400">{item.attempts}x</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          {item.sentAt ? formatDate(item.sentAt) : "—"}
                        </td>
                        <td className="px-3 py-3 max-w-[200px]">
                          {item.errorReason ? (
                            <span className="text-xs text-red-500 truncate block">{item.errorReason}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {queueItems.length >= 200 && (
                <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50">
                  Menampilkan 200 pertama — {Object.values(queueSummary).reduce((a, b) => a + b, 0)} total
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper with Suspense (required for useSearchParams in Next.js 15) ──
export default function BroadcastPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BroadcastPageInner />
    </Suspense>
  );
}
