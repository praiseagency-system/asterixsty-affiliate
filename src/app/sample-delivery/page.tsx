"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import ConfirmModal from "@/components/ConfirmModal";
import { useBranding } from "@/contexts/BrandingContext";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DeadlineConfig {
  durasiPengiriman: number;
  durasiVideo1: number;
  durasiVideo2: number;
  durasiVideo3: number;
  finalWarningDelay: number;
  reminderOverdue: boolean;
}

const DEFAULT_DEADLINE_CONFIG: DeadlineConfig = {
  durasiPengiriman: 5,
  durasiVideo1: 3,
  durasiVideo2: 3,
  durasiVideo3: 4,
  finalWarningDelay: 5,
  reminderOverdue: true,
};

interface CheckItem { label: string; done: boolean }
interface VideoSubmission {
  id: number;
  sampleDeliveryId: number;
  affiliateUsername: string;
  videoNumber: number;
  tiktokLink: string;
  sparkCode: string;
  notes: string;
  submittedAt: string;
}
const SAMPLE_CATEGORIES = [
  "First Collaboration",
  "Campaign Support",
  "Repeat / Restock",
  "Paid Collaboration",
  "Custom Request",
] as const;
type SampleCategory = typeof SAMPLE_CATEGORIES[number];

const CATEGORY_META: Record<SampleCategory, { icon: string; color: string }> = {
  "First Collaboration": { icon: "🌟", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "Campaign Support":    { icon: "📣", color: "bg-violet-50 text-violet-700 border-violet-200" },
  "Repeat / Restock":    { icon: "🔄", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Paid Collaboration":  { icon: "💰", color: "bg-amber-50 text-amber-700 border-amber-200" },
  "Custom Request":      { icon: "🎯", color: "bg-rose-50 text-rose-700 border-rose-200" },
};

interface Delivery {
  id: number;
  affiliateUsername: string;
  tanggalKirim: string;
  produk: string;
  qtyProduk: number;
  totalVideoTarget: number;
  totalVideoDone: number;
  statusProgress: string;
  catatan: string;
  videoCeklisParsed: CheckItem[];
  noWhatsapp: string;
  pic: string;         // runtime from affiliate.affiliateSpecialist (for WA button fallback)
  updatedAt: string;
  googleFormLink?: string;            // Personalized prefilled Google Form link
  videoSubmissions?: VideoSubmission[]; // undefined = not yet lazy-loaded
  // Category system
  sampleCategory?: string;
  relatedCampaignId?: number | null;
  deliveryReason?: string;
  isRepeatCreator?: boolean;
  // PIC system
  picId?: number | null;
  picName?: string;
}
interface ReminderTemplate {
  id: number;
  nama: string;
  tipeReminder: string;
  isiPesan: string;
  aktif: boolean;
}

// ─── Deadline helpers ─────────────────────────────────────────────────────────
const MS_DAY = 86_400_000;

/** Cumulative days-from-send for each stage, driven by config. stageIdx: 0=send, 1=produk, 2=V1, 3=V2, 4=V3, 5+=extra */
function deadlineDays(stageIdx: number, cfg: DeadlineConfig): number {
  if (stageIdx === 0) return 0;
  if (stageIdx === 1) return cfg.durasiPengiriman;
  const afterV1 = cfg.durasiPengiriman + cfg.durasiVideo1;
  if (stageIdx === 2) return afterV1;
  const afterV2 = afterV1 + cfg.durasiVideo2;
  if (stageIdx === 3) return afterV2;
  const afterV3 = afterV2 + cfg.durasiVideo3;
  // V4+ each gets durasiVideo3 more days
  return afterV3 + (stageIdx - 4) * cfg.durasiVideo3;
}

type StageStatus = "selesai" | "on-track" | "mendekati" | "terlambat";

function computeStageStatus(
  done: boolean,
  daysFromSend: number,
  sendDate: Date,
): { status: StageStatus; daysLeft: number; daysOverdue: number } {
  if (done) return { status: "selesai", daysLeft: 0, daysOverdue: 0 };
  const now = new Date();
  const deadline = new Date(sendDate.getTime() + daysFromSend * MS_DAY);
  const diff = (deadline.getTime() - now.getTime()) / MS_DAY;
  if (diff < 0) return { status: "terlambat", daysLeft: 0, daysOverdue: Math.ceil(-diff) };
  if (diff <= 2) return { status: "mendekati", daysLeft: Math.ceil(diff), daysOverdue: 0 };
  return { status: "on-track", daysLeft: Math.ceil(diff), daysOverdue: 0 };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// ─── WA Template helpers ──────────────────────────────────────────────────────
function pickTemplateInfo(
  d: Delivery,
  cfg: DeadlineConfig,
): { type: string; videoKe: number; hariTerlambat: number; deadlineDaysN: number } {
  if (d.statusProgress === "Selesai") return { type: "", videoKe: 0, hariTerlambat: 0, deadlineDaysN: 0 };
  const now = new Date();
  const send = new Date(d.tanggalKirim);
  const daysSinceSend = (now.getTime() - send.getTime()) / MS_DAY;
  const ceklis = d.videoCeklisParsed;

  for (let i = 0; i < d.totalVideoTarget; i++) {
    if (!ceklis[i]?.done) {
      const videoStageIdx = i + 2; // stage 2=V1, 3=V2, 4=V3
      const dd = deadlineDays(videoStageIdx, cfg);
      const overdue = daysSinceSend - dd;
      const hariTerlambat = Math.max(0, Math.ceil(overdue));

      // Still in delivery phase (product not yet arrived)
      if (i === 0 && daysSinceSend <= cfg.durasiPengiriman) {
        return { type: "Reminder Pengiriman", videoKe: 0, hariTerlambat: 0, deadlineDaysN: cfg.durasiPengiriman };
      }
      // Video overdue beyond finalWarningDelay → Final Warning
      if (overdue > cfg.finalWarningDelay) return { type: "Final Warning", videoKe: i + 1, hariTerlambat, deadlineDaysN: dd };
      // Overdue → Reminder Terlambat
      if (overdue > 0) return { type: "Reminder Terlambat", videoKe: i + 1, hariTerlambat, deadlineDaysN: dd };
      // On time → Reminder Video N (cap at 3)
      const vN = Math.min(i + 1, 3);
      return { type: `Reminder Video ${vN}`, videoKe: i + 1, hariTerlambat: 0, deadlineDaysN: dd };
    }
  }
  return { type: "", videoKe: 0, hariTerlambat: 0, deadlineDaysN: 0 };
}

function fillTemplate(tpl: string, vars: {
  username: string; produk: string; deadline: string;
  video_ke: number; pic: string; hari_terlambat: number;
  submission_form_link?: string;
  footer_branding?: string;
  brand_name?: string;
}) {
  return tpl
    .replace(/{username}/g, vars.username)
    .replace(/{produk}/g, vars.produk)
    .replace(/{deadline}/g, vars.deadline)
    .replace(/{video_ke}/g, String(vars.video_ke))
    .replace(/{pic}/g, vars.pic || "Tim Asterixsty")
    .replace(/{hari_terlambat}/g, String(vars.hari_terlambat))
    .replace(/{submission_form_link}/g, vars.submission_form_link || "")
    .replace(/{submission_link}/g, vars.submission_form_link || "")
    .replace(/{footer_branding}/g, vars.footer_branding || "")
    .replace(/{footer}/g, vars.footer_branding || "")
    .replace(/{brand_name}/g, vars.brand_name || "");
}

// ─── Per-delivery stats helpers ───────────────────────────────────────────────
function isDeliveryOverdue(d: Delivery, cfg: DeadlineConfig): boolean {
  if (d.statusProgress === "Selesai") return false;
  const now = new Date();
  const send = new Date(d.tanggalKirim);
  const daysSinceSend = (now.getTime() - send.getTime()) / MS_DAY;
  const ceklis = d.videoCeklisParsed;
  // Produk overdue
  if (daysSinceSend > cfg.durasiPengiriman && !ceklis.some(c => c.done)) return true;
  // Any video overdue
  for (let i = 0; i < d.totalVideoTarget; i++) {
    const dd = deadlineDays(i + 2, cfg);
    if (!ceklis[i]?.done && daysSinceSend > dd) return true;
  }
  return false;
}

// ─── Progress/status styling ──────────────────────────────────────────────────
const PROGRESS_CFG: Record<string, { cls: string; dot: string }> = {
  "Belum Mulai": { cls: "bg-gray-100 text-gray-500",   dot: "bg-gray-400" },
  "On Progress": { cls: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  "Selesai":     { cls: "bg-green-100 text-green-700", dot: "bg-green-500" },
};
const STAGE_STATUS_CFG: Record<StageStatus, { icon: string; cls: string; badge: string }> = {
  "selesai":   { icon: "✓", cls: "bg-green-500 text-white border-green-500",   badge: "text-green-600 bg-green-50 border-green-200" },
  "on-track":  { icon: "○", cls: "bg-white text-gray-400 border-gray-200",     badge: "text-blue-600 bg-blue-50 border-blue-200" },
  "mendekati": { icon: "!", cls: "bg-orange-500 text-white border-orange-500", badge: "text-orange-600 bg-orange-50 border-orange-200" },
  "terlambat": { icon: "✕", cls: "bg-red-500 text-white border-red-500",       badge: "text-red-600 bg-red-50 border-red-200" },
};

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

// ─── Skeleton Card ────────────────────────────────────────────────────────────
function DeliveryCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-200 rounded w-36" />
            <div className="h-5 bg-gray-100 rounded-full w-20" />
          </div>
          <div className="flex gap-3">
            <div className="h-3 bg-gray-100 rounded w-28" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full" />
            <div className="h-3 bg-gray-100 rounded w-14" />
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 mt-1">
          <div className="h-7 w-20 bg-gray-100 rounded-lg" />
          <div className="h-7 w-20 bg-gray-100 rounded-lg" />
          <div className="h-7 w-24 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ done, target }: { done: number; target: number }) {
  const pct = target > 0 ? Math.round((done / target) * 100) : 0;
  const color = pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-gray-200";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
        {done}/{target} ({pct}%)
      </span>
    </div>
  );
}

// ─── Deadline Timeline ────────────────────────────────────────────────────────
function DeadlineTimeline({ delivery, cfg }: { delivery: Delivery; cfg: DeadlineConfig }) {
  const send = new Date(delivery.tanggalKirim);
  const ceklis = delivery.videoCeklisParsed;
  const anyDone = ceklis.some(c => c.done);

  const stages: { label: string; daysN: number; done: boolean }[] = [
    { label: "Produk Dikirim", daysN: 0, done: true },
    { label: "Produk Sampai",  daysN: cfg.durasiPengiriman, done: anyDone },
    ...Array.from({ length: delivery.totalVideoTarget }, (_, i) => ({
      label: `Video ${i + 1}`,
      daysN: deadlineDays(i + 2, cfg),
      done: ceklis[i]?.done ?? false,
    })),
  ];

  return (
    <div className="space-y-1.5">
      {stages.map((stage, i) => {
        if (stage.daysN === 0) {
          // Always selesai
          const deadline = new Date(send.getTime());
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 bg-green-500 text-white border-green-500">✓</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">{stage.label}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(deadline)}</span>
                </div>
                <div className="text-xs text-green-600 font-medium">Selesai</div>
              </div>
            </div>
          );
        }

        const deadline = new Date(send.getTime() + stage.daysN * MS_DAY);
        const { status, daysLeft, daysOverdue } = computeStageStatus(stage.done, stage.daysN, send);
        const cfg = STAGE_STATUS_CFG[status];
        const isLast = i === stages.length - 1;

        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${cfg.cls}`}>
                {cfg.icon}
              </div>
              {!isLast && <div className="w-px h-3 bg-gray-200 mt-0.5" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-700">{stage.label}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(deadline)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {status === "selesai" && <span className="text-xs text-green-600 font-medium">✓ Selesai</span>}
                {status === "on-track" && <span className="text-xs text-blue-600">On Track · {daysLeft} hari lagi</span>}
                {status === "mendekati" && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                    ⚡ Mendekati Deadline · {daysLeft} hari lagi
                  </span>
                )}
                {status === "terlambat" && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                    ⚠ Terlambat {daysOverdue} hari
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── WA Button ────────────────────────────────────────────────────────────────
function WaButton({ delivery, templates, cfg }: { delivery: Delivery; templates: ReminderTemplate[]; cfg: DeadlineConfig }) {
  const { type, videoKe, hariTerlambat, deadlineDaysN } = pickTemplateInfo(delivery, cfg);
  if (!cfg.reminderOverdue && hariTerlambat > 0) return null;
  if (!type) return null;

  const template = templates.find(t => t.tipeReminder === type && t.aktif);
  const hasPhone = delivery.noWhatsapp.trim().length > 0;

  function handleClick() {
    if (!template) {
      alert(`Template "${type}" tidak ditemukan atau tidak aktif di Data Master → Template Reminder`);
      return;
    }
    const send = new Date(delivery.tanggalKirim);
    const deadlineDate = new Date(send.getTime() + deadlineDaysN * MS_DAY);
    const msg = fillTemplate(template.isiPesan, {
      username: `@${delivery.affiliateUsername}`,
      produk: delivery.produk,
      deadline: fmtDate(deadlineDate),
      video_ke: videoKe,
      pic: delivery.picName || delivery.pic,
      hari_terlambat: hariTerlambat,
    });

    if (!hasPhone) {
      alert(`Nomor WhatsApp @${delivery.affiliateUsername} tidak ditemukan di Database Affiliate.\n\nPesan yang akan dikirim:\n\n${msg}`);
      return;
    }

    const phone = delivery.noWhatsapp.replace(/[^0-9]/g, "").replace(/^0/, "62");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const isOverdue = hariTerlambat > 0;

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
        isOverdue
          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
      }`}
      title={`Kirim ${type}`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      Kirim Reminder WA
      {isOverdue && <span className="bg-red-200 text-red-700 rounded px-1">{hariTerlambat}h</span>}
    </button>
  );
}

// ─── Video Checklist Panel ────────────────────────────────────────────────────
function ChecklistPanel({ delivery, onUpdated }: { delivery: Delivery; onUpdated: (d: Delivery) => void }) {
  const [updating, setUpdating] = useState<number | null>(null);

  async function toggle(idx: number, current: boolean) {
    setUpdating(idx);
    const res = await fetch(`/api/sample-delivery/${delivery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIdx: idx, done: !current }),
    });
    let json: Partial<Delivery> = {};
    try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
    onUpdated({ ...delivery, ...(json as Delivery), videoCeklisParsed: (json as Delivery).videoCeklisParsed ?? delivery.videoCeklisParsed });
    setUpdating(null);
  }

  return (
    <div className="space-y-1.5">
      {delivery.videoCeklisParsed.map((item, idx) => (
        <label key={idx}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${item.done ? "bg-green-50" : "bg-gray-50 hover:bg-gray-100"}`}>
          <input type="checkbox" checked={item.done} disabled={updating === idx}
            onChange={() => toggle(idx, item.done)}
            className="w-4 h-4 accent-green-500 cursor-pointer" />
          <span className={`text-sm ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>{item.label}</span>
          {item.done && <span className="ml-auto text-green-500 text-xs font-medium">Done</span>}
        </label>
      ))}
      {delivery.videoCeklisParsed.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">Tidak ada target video</p>
      )}
    </div>
  );
}

// ─── Submission Detail Panel ──────────────────────────────────────────────────
function SubmissionDetailPanel({ delivery, submissions, cfg }: { delivery: Delivery; submissions: VideoSubmission[]; cfg: DeadlineConfig }) {
  const [copied, setCopied] = useState<number | null>(null);

  function copyText(text: string, id: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const now = new Date();
  const send = new Date(delivery.tanggalKirim);

  return (
    <div className="space-y-2">
      {Array.from({ length: delivery.totalVideoTarget }, (_, i) => {
        const n = i + 1;
        const sub = submissions.find((s) => s.videoNumber === n);
        const videoDeadline = deadlineDays(n + 1, cfg);
        const deadlineDate = new Date(send.getTime() + videoDeadline * MS_DAY);
        const isOverdue = !sub && now > deadlineDate;

        return (
          <div
            key={n}
            className={`rounded-xl border p-3 space-y-2 ${
              sub
                ? "bg-green-50 border-green-100"
                : isOverdue
                ? "bg-red-50 border-red-100"
                : "bg-gray-50 border-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  sub
                    ? "bg-green-500 text-white"
                    : isOverdue
                    ? "bg-red-400 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {sub ? "✓" : isOverdue ? "!" : n}
              </div>
              <span className="text-sm font-semibold text-gray-700">Video {n}</span>
              <span
                className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                  sub
                    ? "bg-green-100 text-green-700"
                    : isOverdue
                    ? "bg-red-100 text-red-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {sub ? "✅ Submitted" : isOverdue ? "⚠ Terlambat" : "⏳ Belum Submit"}
              </span>
            </div>

            {sub ? (
              <div className="space-y-1.5 pl-8 text-xs">
                <div className="text-gray-400">
                  📅 {new Date(sub.submittedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-gray-500 font-medium">🔗 Link:</span>
                  <a
                    href={sub.tiktokLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-[180px]"
                  >
                    {sub.tiktokLink}
                  </a>
                  <a
                    href={sub.tiktokLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-2 py-0.5 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
                  >
                    Buka Video
                  </a>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 font-medium">⚡ Spark:</span>
                  <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">{sub.sparkCode}</span>
                  <button
                    onClick={() => copyText(sub.sparkCode, sub.id)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="Copy spark code"
                  >
                    {copied === sub.id ? "✓" : "📋"}
                  </button>
                </div>
                {sub.notes && (
                  <div className="text-gray-500 italic">💬 {sub.notes}</div>
                )}
              </div>
            ) : (
              <div className="pl-8 text-xs text-gray-400">
                Deadline: {deadlineDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </div>
            )}
          </div>
        );
      })}
      {delivery.totalVideoTarget === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">Tidak ada target video</p>
      )}
    </div>
  );
}

// ─── Delivery Card ────────────────────────────────────────────────────────────
const DeliveryCard = memo(function DeliveryCard({ delivery, templates, cfg, onUpdated, onDelete, waFooter }: {
  delivery: Delivery;
  templates: ReminderTemplate[];
  cfg: DeadlineConfig;
  onUpdated: (d: Delivery) => void;
  onDelete: (id: number) => void;
  waFooter?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editNote, setEditNote] = useState(false);
  const [note, setNote]         = useState(delivery.catatan);
  const [saving, setSaving]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedLink, setCopiedLink]   = useState(false);
  const [sendingForm, setSendingForm] = useState(false);
  const [sendFormResult, setSendFormResult] = useState<"sent" | "fallback" | null>(null);

  // ── Lazy-load video submissions on first expand ────────────────────────────
  const [submissions, setSubmissions] = useState<VideoSubmission[] | undefined>(delivery.videoSubmissions);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const fetchedSubs = useRef(false);

  // sync if parent already has subs (e.g. after a reload)
  useEffect(() => {
    if (delivery.videoSubmissions !== undefined) setSubmissions(delivery.videoSubmissions);
  }, [delivery.videoSubmissions]);

  useEffect(() => {
    if (!expanded || submissions !== undefined || fetchedSubs.current) return;
    fetchedSubs.current = true;
    setLoadingSubs(true);
    fetch(`/api/sample-delivery/${delivery.id}`)
      .then(async (res) => {
        let json: Partial<Delivery> = {};
        try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
        const subs = (json as Delivery).videoSubmissions ?? [];
        setSubmissions(subs);
        onUpdated({ ...delivery, videoSubmissions: subs });
      })
      .catch(() => setSubmissions([]))
      .finally(() => setLoadingSubs(false));
  }, [expanded, submissions, delivery, onUpdated]);

  // Prefer Google Form link (personalized prefilled); fall back to internal page
  const googleFormLink = delivery.googleFormLink || "";
  const internalLink   = typeof window !== "undefined"
    ? `${window.location.origin}/submit-video/${delivery.id}`
    : `/submit-video/${delivery.id}`;
  const submissionLink = googleFormLink || internalLink;

  function copySubmissionLink() {
    navigator.clipboard.writeText(submissionLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  async function handleResendFormLink(e: React.MouseEvent) {
    e.stopPropagation();
    setSendingForm(true);
    setSendFormResult(null);
    try {
      const res = await fetch(`/api/sample-delivery/${delivery.id}/send-form`, { method: "POST" });
      let json: { waStatus?: string } = {};
      try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
      if (json.waStatus === "sent") {
        setSendFormResult("sent");
        setTimeout(() => setSendFormResult(null), 3000);
        setSendingForm(false);
        return;
      }
    } catch { /* ignore */ }
    // WA not connected or failed → open wa.me as fallback
    setSendFormResult("fallback");
    setTimeout(() => setSendFormResult(null), 3000);
    const footer = waFooter ? `\n\n${waFooter}` : "";
    const msg = `Halo kak @${delivery.affiliateUsername} 🙌\n\nBerikut form submit video untuk sample *${delivery.produk}*\n\nMohon isi setiap selesai upload video ya ✨\n\n${submissionLink}${footer}`;
    if (delivery.noWhatsapp) {
      const phone = delivery.noWhatsapp.replace(/[^0-9]/g, "").replace(/^0/, "62");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    } else {
      alert(`Nomor WA tidak tersedia.\n\nSalin link form:\n\n${submissionLink}`);
    }
    setSendingForm(false);
  }

  const overdue = isDeliveryOverdue(delivery, cfg);
  const progressCfg = PROGRESS_CFG[delivery.statusProgress] ?? PROGRESS_CFG["Belum Mulai"];
  const date = new Date(delivery.tanggalKirim).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

  async function saveNote() {
    setSaving(true);
    const res = await fetch(`/api/sample-delivery/${delivery.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catatan: note }),
    });
    let json: Partial<Delivery> = {};
    try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
    onUpdated({ ...delivery, ...(json as Delivery), videoCeklisParsed: (json as Delivery).videoCeklisParsed ?? delivery.videoCeklisParsed });
    setSaving(false);
    setEditNote(false);
  }

  async function del() {
    await fetch(`/api/sample-delivery/${delivery.id}`, { method: "DELETE" });
    onDelete(delivery.id);
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      overdue ? "border-red-200" : expanded ? "border-indigo-200" : "border-gray-100"
    }`}>
      {/* Overdue banner */}
      {overdue && (
        <div className="bg-red-50 border-b border-red-100 px-5 py-1.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-red-600">⚠ Ada tahapan yang terlambat</span>
        </div>
      )}

      {/* Card header */}
      <div className="flex items-start gap-4 px-5 py-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">@{delivery.affiliateUsername}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${progressCfg.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${progressCfg.dot}`} />
              {delivery.statusProgress}
            </span>
            {delivery.sampleCategory && delivery.sampleCategory !== "First Collaboration" && (() => {
              const m = CATEGORY_META[delivery.sampleCategory as SampleCategory];
              return m ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.color}`}>
                  {m.icon} {delivery.sampleCategory}
                </span>
              ) : null;
            })()}
            {(delivery.picName || delivery.pic) && (
              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                👤 {delivery.picName || delivery.pic}
              </span>
            )}
          </div>
          <div className="flex gap-3 mt-1 flex-wrap text-xs text-gray-500">
            <span>📦 {delivery.produk} × {delivery.qtyProduk}</span>
            <span>📅 Kirim {date}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            <ProgressBar done={delivery.totalVideoDone} target={delivery.totalVideoTarget} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
          {/* Google Form badge (if linked) or internal form indicator */}
          {googleFormLink ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 border border-blue-200 text-blue-600">
              <svg width="10" height="10" viewBox="0 0 24 24" className="shrink-0">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Form
            </span>
          ) : null}
          {/* Copy Form Link button */}
          <button
            onClick={copySubmissionLink}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors"
            title="Copy form submission link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {copiedLink ? "✓ Copied!" : "Form Link"}
          </button>
          {/* Open Form in new tab */}
          <a
            href={submissionLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
            title="Buka form submission"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Buka
          </a>
          {/* Kirim Ulang Form Link via WA (API-first, fallback to wa.me) */}
          <button
            onClick={handleResendFormLink}
            disabled={sendingForm}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
              sendFormResult === "sent"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            }`}
            title="Kirim form link via WhatsApp (auto-send jika WA terhubung)"
          >
            {sendingForm ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            )}
            {sendingForm ? "Mengirim…" : sendFormResult === "sent" ? "✓ Terkirim!" : "Kirim Ulang"}
          </button>
          <WaButton delivery={delivery} templates={templates} cfg={cfg} />
          <button className={`text-gray-400 text-sm mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}>▾</button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Left: Timeline */}
            <div className="px-5 py-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Deadline Timeline</h4>
              <DeadlineTimeline delivery={delivery} cfg={cfg} />
            </div>

            {/* Right: Submission Detail + Checklist + Notes */}
            <div className="px-5 py-4 space-y-4">
              {/* Video Submission Detail — lazy loaded on first expand */}
              {delivery.totalVideoTarget > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Video Submission Detail</h4>
                    <a
                      href={`/submit-video/${delivery.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-600 hover:underline"
                    >
                      Buka Form ↗
                    </a>
                  </div>
                  {loadingSubs ? (
                    <div className="space-y-2">
                      {Array.from({ length: delivery.totalVideoTarget }).map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <SubmissionDetailPanel delivery={delivery} submissions={submissions ?? []} cfg={cfg} />
                  )}
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Checklist Manual</h4>
                <ChecklistPanel delivery={delivery} onUpdated={onUpdated} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Catatan</h4>
                  <button onClick={() => setEditNote(!editNote)} className="text-xs text-indigo-500 hover:underline">
                    {editNote ? "Batal" : "Edit"}
                  </button>
                </div>
                {editNote ? (
                  <div className="space-y-2">
                    <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} />
                    <button onClick={saveNote} disabled={saving}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    {delivery.catatan || <span className="text-gray-400 italic">Belum ada catatan</span>}
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Hapus</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Hapus Pengiriman"
          message={`Hapus pengiriman sample untuk @${delivery.affiliateUsername}? Data akan dihapus dari tampilan.`}
          confirmLabel="Hapus"
          onConfirm={() => { setConfirmDelete(false); del(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
});

// ─── Add Delivery Form ────────────────────────────────────────────────────────
interface AffiliateLookup {
  tiktokUsername: string; namaAffiliator: string;
  kota: string; noWhatsapp: string;
  affiliateSpecialist: string; kategoriAffiliate: string;
}

type WaSendStatus = "sent" | "failed" | "no_phone" | "no_wa";

interface CampaignOption { id: number; nama: string; status: string; }
interface PrevDeliveryOption { id: number; affiliateUsername: string; tanggalKirim: string; produk: string; }
interface SpecialistOption { id: number; nama: string; }

function AddDeliveryForm({ onSuccess, onCancel, cfg, prefill }: {
  onSuccess: () => void; onCancel: () => void; cfg: DeadlineConfig;
  prefill?: Partial<{
    affiliateUsername: string; sampleCategory: SampleCategory;
    relatedCampaignId: number; relatedCampaignName: string;
    picId: number; picName: string;
  }>;
}) {
  const [form, setForm] = useState({
    affiliateUsername: prefill?.affiliateUsername || "",
    produk: "", qtyProduk: "1",
    totalVideoTarget: "3", tanggalKirim: new Date().toISOString().slice(0, 10), catatan: "",
    sampleCategory:    prefill?.sampleCategory || "First Collaboration" as SampleCategory,
    relatedCampaignId: prefill?.relatedCampaignId ? String(prefill.relatedCampaignId) : "",
    deliveryReason: "",
    previousDeliveryId: "",
    picId: prefill?.picId ? String(prefill.picId) : "",
  });
  const [affiliate, setAffiliate] = useState<AffiliateLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving]   = useState(false);
  // Campaign search state
  const [campaignQuery, setCampaignQuery] = useState(prefill?.relatedCampaignName || "");
  const [campaigns, setCampaigns]         = useState<CampaignOption[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  // Previous delivery search state
  const [prevDeliveries, setPrevDeliveries] = useState<PrevDeliveryOption[]>([]);
  const [loadingPrev, setLoadingPrev] = useState(false);
  // Specialist list (for PIC select)
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);

  // ── Result state shown after successful save ─────────────────────────────
  const [savedResult, setSavedResult] = useState<{
    deliveryId:        number;
    submissionLink:    string;
    googleFormLink:    string;
    waStatus:          WaSendStatus;
    affiliateUsername: string;
    produk:            string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function lookupAffiliate(username: string) {
    if (!username) { setAffiliate(null); return; }
    setLooking(true);
    const res = await fetch(`/api/database?search=${encodeURIComponent(username)}&limit=1`);
    let json: { items?: AffiliateLookup[] } = {};
    try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { json = {}; }
    const found = json.items?.[0];
    setAffiliate(found
      ? { tiktokUsername: found.tiktokUsername, namaAffiliator: found.namaAffiliator,
          kota: found.kota, noWhatsapp: found.noWhatsapp,
          affiliateSpecialist: found.affiliateSpecialist, kategoriAffiliate: found.kategoriAffiliate }
      : null);
    setLooking(false);
  }

  useEffect(() => {
    const t = setTimeout(() => lookupAffiliate(form.affiliateUsername), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.affiliateUsername]);

  // Fetch campaigns when "Campaign Support" is selected (fetched once, filtered client-side)
  const allCampaignsRef = useRef<CampaignOption[]>([]);
  useEffect(() => {
    if (form.sampleCategory !== "Campaign Support") return;
    if (allCampaignsRef.current.length > 0) {
      // Already fetched — just filter
      const q = campaignQuery.trim().toLowerCase();
      setCampaigns(q ? allCampaignsRef.current.filter(c => c.nama.toLowerCase().includes(q)) : allCampaignsRef.current);
      return;
    }
    let active = true;
    setLoadingCampaigns(true);
    fetch("/api/campaigns")
      .then(r => r.json())
      .then((d: CampaignOption[] | unknown) => {
        if (!active) return;
        const list: CampaignOption[] = Array.isArray(d) ? (d as CampaignOption[]) : [];
        allCampaignsRef.current = list;
        const q = campaignQuery.trim().toLowerCase();
        setCampaigns(q ? list.filter(c => c.nama.toLowerCase().includes(q)) : list);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoadingCampaigns(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sampleCategory, campaignQuery]);

  // Fetch previous deliveries when "Repeat / Restock" is selected & username is set
  useEffect(() => {
    if (form.sampleCategory !== "Repeat / Restock" || !form.affiliateUsername) {
      setPrevDeliveries([]); return;
    }
    let active = true;
    const fetch_ = async () => {
      setLoadingPrev(true);
      try {
        const res = await fetch(`/api/sample-delivery?username=${encodeURIComponent(form.affiliateUsername)}&limit=20&subs=0`);
        if (res.ok && active) {
          const d = await res.json() as { items?: PrevDeliveryOption[] };
          setPrevDeliveries(d.items ?? []);
        }
      } catch { /* ignore */ } finally { if (active) setLoadingPrev(false); }
    };
    fetch_();
    return () => { active = false; };
  }, [form.sampleCategory, form.affiliateUsername]);

  // Load specialists once on mount
  useEffect(() => {
    fetch("/api/master")
      .then(r => r.json())
      .then((d: { specialists?: SpecialistOption[] } | unknown) => {
        const list = (d as { specialists?: SpecialistOption[] })?.specialists ?? [];
        setSpecialists(list);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/sample-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliateUsername:  form.affiliateUsername,
        produk:             form.produk,
        qtyProduk:          Number(form.qtyProduk) || 1,
        totalVideoTarget:   Number(form.totalVideoTarget) || 0,
        tanggalKirim:       form.tanggalKirim,
        catatan:            form.catatan,
        sampleCategory:     form.sampleCategory,
        relatedCampaignId:  form.relatedCampaignId ? Number(form.relatedCampaignId) : null,
        previousDeliveryId: form.previousDeliveryId ? Number(form.previousDeliveryId) : null,
        deliveryReason:     form.deliveryReason,
        isRepeatCreator:    form.previousDeliveryId ? true : false,
        picId:              form.picId ? Number(form.picId) : null,
      }),
    });
    let json: { id?: number; submissionLink?: string; googleFormLink?: string; waStatus?: WaSendStatus } = {};
    try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
    setSaving(false);

    // Prefer Google Form link; fall back to internal submission link
    const bestLink = json.googleFormLink || json.submissionLink || "";

    // Show result panel instead of immediately closing
    setSavedResult({
      deliveryId:        json.id ?? 0,
      submissionLink:    bestLink,
      googleFormLink:    json.googleFormLink ?? "",
      waStatus:          json.waStatus ?? "no_wa",
      affiliateUsername: form.affiliateUsername,
      produk:            form.produk,
    });
  }

  // Deadline preview (config-driven)
  const sendDate = form.tanggalKirim ? new Date(form.tanggalKirim) : null;
  const totalDays = cfg.durasiPengiriman + cfg.durasiVideo1 + cfg.durasiVideo2 + cfg.durasiVideo3;
  const previewDeadlines = sendDate ? [
    { label: "Produk Sampai", date: new Date(sendDate.getTime() + deadlineDays(1, cfg) * MS_DAY) },
    { label: "Video 1",       date: new Date(sendDate.getTime() + deadlineDays(2, cfg) * MS_DAY) },
    { label: "Video 2",       date: new Date(sendDate.getTime() + deadlineDays(3, cfg) * MS_DAY) },
    { label: "Video 3",       date: new Date(sendDate.getTime() + deadlineDays(4, cfg) * MS_DAY) },
  ] : [];

  // ── Result panel after save ────────────────────────────────────────────────
  if (savedResult) {
    const waMessages: Record<WaSendStatus, { icon: string; cls: string; text: string }> = {
      sent:     { icon: "✅", cls: "bg-green-50 border-green-200 text-green-700", text: "WhatsApp berhasil dikirim ke affiliator!" },
      failed:   { icon: "⚠️", cls: "bg-red-50 border-red-200 text-red-700",     text: "Gagal kirim WA otomatis — kirim manual dari card." },
      no_phone: { icon: "⚠️", cls: "bg-amber-50 border-amber-200 text-amber-700", text: "Nomor WA tidak ada di database — kirim manual." },
      no_wa:    { icon: "⚠️", cls: "bg-amber-50 border-amber-200 text-amber-700", text: "WhatsApp belum terhubung — kirim manual dari card." },
    };
    const wm = waMessages[savedResult.waStatus];

    function copyLink() {
      navigator.clipboard.writeText(savedResult!.submissionLink).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      });
    }

    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-50 bg-gradient-to-r from-green-50 to-white flex items-center gap-3">
          <span className="text-3xl">🎉</span>
          <div>
            <h2 className="font-bold text-gray-900">Sample Berhasil Dibuat!</h2>
            <p className="text-xs text-gray-500 mt-0.5">@{savedResult.affiliateUsername} · {savedResult.produk}</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {/* WA status */}
          <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${wm.cls}`}>
            <span className="text-base flex-shrink-0">{wm.icon}</span>
            <span className="font-medium">{wm.text}</span>
          </div>

          {/* Form link */}
          {savedResult.submissionLink && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Form Link Pengumpulan Video</p>
                {savedResult.googleFormLink ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 border border-blue-200 text-blue-600">
                    <svg width="9" height="9" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Prefilled Google Form
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-50 border border-gray-200 text-gray-500">Internal Form</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-xs text-gray-700 truncate">
                  {savedResult.submissionLink}
                </div>
                <button
                  onClick={copyLink}
                  className="flex-shrink-0 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copiedLink ? "✓ Copied!" : "📋 Copy"}
                </button>
                <a
                  href={savedResult.submissionLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  ↗ Buka
                </a>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onSuccess}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              ✓ Selesai & Lihat Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-indigo-50 to-white">
        <div>
          <h2 className="font-bold text-gray-900">Kirim Sample Baru</h2>
          <p className="text-xs text-gray-400 mt-0.5">Deadline {totalDays} hari otomatis dihitung dari tanggal kirim</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
      </div>

      <form onSubmit={submit} className="p-6 space-y-5">
        {/* Affiliate lookup */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Affiliate</label>
          <input className={inputCls} placeholder="Ketik username TikTok..."
            value={form.affiliateUsername}
            onChange={e => set("affiliateUsername", e.target.value.replace(/^@/, ""))} />
          {looking && <span className="text-xs text-gray-400">Mencari...</span>}
          {affiliate && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">Data Auto-Fetch</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {[
                  ["Nama", affiliate.namaAffiliator], ["Kota", affiliate.kota],
                  ["PIC", affiliate.affiliateSpecialist], ["WA", affiliate.noWhatsapp],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <span className="text-indigo-400">{label}: </span>
                    <span className="font-semibold text-indigo-700">{val}</span>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
          {form.affiliateUsername && !affiliate && !looking && (
            <p className="text-xs text-orange-500">⚠️ Username tidak ditemukan. Reminder WA tidak akan bisa dikirim.</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Kategori Pengiriman</label>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CATEGORIES.map(cat => {
              const m = CATEGORY_META[cat];
              const active = form.sampleCategory === cat;
              return (
                <button key={cat} type="button"
                  onClick={() => setForm(f => ({ ...f, sampleCategory: cat, relatedCampaignId: "", previousDeliveryId: "" }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    active ? `${m.color} ring-1 ring-offset-1` : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {m.icon} {cat}
                </button>
              );
            })}
          </div>

          {/* Campaign picker — only when Campaign Support */}
          {form.sampleCategory === "Campaign Support" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500">Campaign Terkait</label>
              <input
                className={inputCls} placeholder="Cari nama campaign..."
                value={campaignQuery}
                onChange={e => { setCampaignQuery(e.target.value); setForm(f => ({ ...f, relatedCampaignId: "" })); }}
              />
              {loadingCampaigns && <span className="text-xs text-gray-400">Mencari campaign...</span>}
              {campaigns.length > 0 && !form.relatedCampaignId && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-44 overflow-y-auto">
                  {campaigns.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, relatedCampaignId: String(c.id) })); setCampaignQuery(c.nama); }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left hover:bg-indigo-50 transition-colors"
                    >
                      <span className="font-medium text-gray-800 truncate">{c.nama}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        c.status === "Ongoing" ? "bg-emerald-50 text-emerald-700" :
                        c.status === "Published" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-500"
                      }`}>{c.status}</span>
                    </button>
                  ))}
                </div>
              )}
              {form.relatedCampaignId && (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold text-violet-700 flex-1 truncate">📣 {campaignQuery}</span>
                  <button type="button" onClick={() => { setForm(f => ({ ...f, relatedCampaignId: "" })); setCampaignQuery(""); }}
                    className="text-violet-400 hover:text-violet-600 text-xs">✕</button>
                </div>
              )}
            </div>
          )}

          {/* Previous delivery picker — only when Repeat / Restock */}
          {form.sampleCategory === "Repeat / Restock" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500">Pengiriman Sebelumnya (opsional)</label>
              {loadingPrev ? (
                <span className="text-xs text-gray-400">Memuat riwayat...</span>
              ) : prevDeliveries.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Belum ada riwayat pengiriman untuk creator ini.</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-36 overflow-y-auto">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, previousDeliveryId: "" }))}
                    className={`w-full flex items-center px-4 py-2 text-xs text-left hover:bg-gray-50 ${!form.previousDeliveryId ? "bg-gray-50 font-semibold text-gray-700" : "text-gray-400"}`}
                  >
                    — Tidak ada referensi
                  </button>
                  {prevDeliveries.map(d => (
                    <button key={d.id} type="button"
                      onClick={() => setForm(f => ({ ...f, previousDeliveryId: String(d.id) }))}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-xs text-left hover:bg-emerald-50 transition-colors ${form.previousDeliveryId === String(d.id) ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-gray-700"}`}
                    >
                      <span>{d.produk || "(produk kosong)"}</span>
                      <span className="text-gray-400 shrink-0">{new Date(d.tanggalKirim).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Alasan Restock</label>
                <input className={inputCls} placeholder="Misal: Produk habis, minta restock..." value={form.deliveryReason} onChange={e => setForm(f => ({ ...f, deliveryReason: e.target.value }))} />
              </div>
            </div>
          )}
        </div>

        {/* Delivery details */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tanggal Kirim</label>
            <input type="date" className={inputCls} value={form.tanggalKirim} onChange={e => set("tanggalKirim", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Produk Dikirim</label>
            <SearchableSelect value={form.produk} onChange={v => set("produk", v)}
              suggestionsUrl="/api/master/suggestions?type=produk" placeholder="Cari produk..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Qty Produk</label>
            <input type="number" min={1} className={inputCls} value={form.qtyProduk} onChange={e => set("qtyProduk", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Target Video</label>
            <input type="number" min={0} max={20} className={inputCls} value={form.totalVideoTarget}
              onChange={e => set("totalVideoTarget", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">PIC / Specialist</label>
            <select
              className={inputCls}
              value={form.picId}
              onChange={e => set("picId", e.target.value)}
            >
              <option value="">— Auto dari affiliate —</option>
              {specialists.map(s => (
                <option key={s.id} value={String(s.id)}>{s.nama}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Deadline preview */}
        {sendDate && (
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">Auto Deadline ({totalDays} Hari Timeline)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {previewDeadlines.slice(0, Number(form.totalVideoTarget) + 1).map(s => (
                <div key={s.label} className="bg-white rounded-lg px-3 py-2 border border-indigo-100">
                  <p className="text-xs text-indigo-400 font-medium">{s.label}</p>
                  <p className="text-xs font-bold text-indigo-700 mt-0.5">{fmtDate(s.date)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Catatan (opsional)</label>
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Catatan pengiriman..."
            value={form.catatan} onChange={e => set("catatan", e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving || !form.affiliateUsername}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Menyimpan..." : "📦 Kirim Sample"}
          </button>
          <button type="button" onClick={onCancel}
            className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SampleDeliveryPage() {
  const { brand }                 = useBranding();
  const [items, setItems]         = useState<Delivery[]>([]);
  const [total, setTotal]         = useState(0);
  const [searchInput, setSearchInput] = useState(""); // raw input
  const [search, setSearch]       = useState("");     // debounced
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [formPrefill, setFormPrefill] = useState<Parameters<typeof AddDeliveryForm>[0]["prefill"]>(undefined);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [deadlineCfg, setDeadlineCfg] = useState<DeadlineConfig>(DEFAULT_DEADLINE_CONFIG);
  const [submissionFilter, setSubmissionFilter] = useState("");
  const [categoryFilter, setCategoryFilter]     = useState("");
  const [picFilter, setPicFilter]               = useState("");
  const [fetchError, setFetchError]             = useState<string | null>(null);
  const [specialists, setSpecialists]           = useState<SpecialistOption[]>([]);

  // Auto-sync state
  const [lastSyncAt, setLastSyncAt]   = useState<string | null>(null);
  const [isSyncing,  setIsSyncing]    = useState(false);
  const [syncedCount, setSyncedCount] = useState(0); // new submissions from last cycle

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFetchError(null);
    try {
      // subs=0 → skip heavy videoSubmissions join on initial list; each card lazy-loads on expand
      const params = new URLSearchParams({ page: String(page), limit: "10", subs: "0" });
      if (search)         params.set("username", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (picFilter)      params.set("picId", picFilter);
      const res = await fetch(`/api/sample-delivery?${params}`, { signal });
      let json: { items?: Delivery[]; total?: number } = {};
      try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
      let data: Delivery[] = (json.items || []).map(d => ({ ...d, videoSubmissions: undefined }));
      // Status filter (server already handles username filter; progress filter is local)
      if (statusFilter) data = data.filter(d => d.statusProgress === statusFilter);
      // Submission filter only works if subs are loaded; skip silently if not
      if (submissionFilter && submissionFilter !== "terlambat") {
        data = data.filter((d) => {
          const subs = d.videoSubmissions ?? [];
          const total = d.totalVideoTarget;
          const submitted = subs.length;
          if (submissionFilter === "belum")    return submitted === 0;
          if (submissionFilter === "partial")  return submitted > 0 && submitted < total;
          if (submissionFilter === "complete") return submitted >= total && total > 0;
          return true;
        });
      }
      if (submissionFilter === "terlambat") {
        data = data.filter((d) => {
          const subs = d.videoSubmissions ?? [];
          const total = d.totalVideoTarget;
          const now = new Date();
          const send = new Date(d.tanggalKirim);
          return Array.from({ length: total }, (_, i) => i + 1).some((n) => {
            const sub = subs.find((s) => s.videoNumber === n);
            if (sub) return false;
            const dd = deadlineDays(n + 1, deadlineCfg);
            return now > new Date(send.getTime() + dd * MS_DAY);
          });
        });
      }
      setItems(data);
      setTotal(json.total || 0);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setFetchError("Gagal memuat data pengiriman. Coba lagi.");
        console.error("[SampleDelivery] fetchData error:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, submissionFilter, categoryFilter, picFilter, deadlineCfg]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchData]);

  useEffect(() => {
    const safeJson = async (url: string) => {
      try { const r = await fetch(url); const t = await r.text(); return t ? JSON.parse(t) : {}; }
      catch { return {}; }
    };
    safeJson("/api/reminder-template").then((d) => { if (Array.isArray(d)) setTemplates(d); });
    safeJson("/api/admin/config").then((d) => { if (d?.deadlineConfig) setDeadlineCfg(d.deadlineConfig); });
    safeJson("/api/master").then((d: { specialists?: SpecialistOption[] } | unknown) => {
      const list = (d as { specialists?: SpecialistOption[] })?.specialists ?? [];
      setSpecialists(list);
    });
  }, []);

  // ── Silent refetch: updates item list without loading spinner ─────────────
  // Called after auto-sync detects new submissions — preserves expanded cards.
  const silentRefetch = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10", subs: "0" });
      if (search) params.set("username", search);
      const res = await fetch(`/api/sample-delivery?${params}`);
      let json: { items?: Delivery[]; total?: number } = {};
      try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }
      const newData: Delivery[] = (json.items || []).map(d => ({ ...d, videoSubmissions: undefined }));
      setItems(prev => newData.map(fresh => {
        const existing = prev.find(o => o.id === fresh.id);
        // Preserve loaded submissions so already-expanded cards keep their data
        return { ...fresh, videoSubmissions: existing?.videoSubmissions };
      }));
      setTotal(json.total || 0);
    } catch { /* non-critical */ }
  }, [page, search]);

  // Keep a ref to the latest silentRefetch so the polling closure stays fresh
  const silentRefetchRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { silentRefetchRef.current = silentRefetch; }, [silentRefetch]);

  // ── Background auto-sync polling (every 2 minutes) ────────────────────────
  // Calls /api/google/auto-sync which decides server-side if sync is needed.
  // If new submissions were synced, silently refreshes the delivery list.
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      if (!mounted) return;
      setIsSyncing(true);
      try {
        const res = await fetch("/api/google/auto-sync");
        if (!mounted) return;
        let json: {
          ok?: boolean; fresh?: boolean;
          synced?: number; skipped?: number;
          lastSyncAt?: string; reason?: string;
        } = {};
        try { const t = await res.text(); json = t ? JSON.parse(t) : {}; } catch { /* ignore */ }

        if (json.lastSyncAt) setLastSyncAt(json.lastSyncAt);
        const newlySynced = json.synced ?? 0;
        if (newlySynced > 0) {
          setSyncedCount(newlySynced);
          setTimeout(() => setSyncedCount(0), 5000); // clear badge after 5s
          await silentRefetchRef.current();
        }
      } catch { /* network errors are non-critical */ }
      finally { if (mounted) setIsSyncing(false); }
    };

    poll(); // immediate check on page load
    const id = setInterval(poll, 2 * 60 * 1000); // every 2 minutes
    return () => { mounted = false; clearInterval(id); };
  }, []); // runs once; uses ref to always have latest silentRefetch

  function handleUpdated(updated: Delivery) {
    setItems(prev => prev.map(d => d.id === updated.id ? {
      ...d, ...updated,
      // Preserve submissions: use updated ones if provided, else keep existing
      videoSubmissions: updated.videoSubmissions ?? d.videoSubmissions,
    } : d));
  }
  function handleDelete(id: number) {
    setItems(prev => prev.filter(d => d.id !== id));
    setTotal(t => t - 1);
  }

  // Stats (computed from current page items)
  const selesai    = items.filter(d => d.statusProgress === "Selesai").length;
  const onProgress = items.filter(d => d.statusProgress === "On Progress").length;
  const belum      = items.filter(d => d.statusProgress === "Belum Mulai").length;
  const overdue    = items.filter(d => isDeliveryOverdue(d, deadlineCfg)).length;
  const onTime     = items.length - overdue;
  const totalDone  = items.reduce((s, d) => s + d.totalVideoDone, 0);
  const totalTarget = items.reduce((s, d) => s + d.totalVideoTarget, 0);
  const completionRate = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  // Avg completion time for "Selesai" items
  const completedItems = items.filter(d => d.statusProgress === "Selesai");
  const avgDays = completedItems.length > 0
    ? Math.round(completedItems.reduce((s, d) => {
        const send    = new Date(d.tanggalKirim).getTime();
        const updated = new Date(d.updatedAt).getTime();
        return s + (updated - send) / MS_DAY;
      }, 0) / completedItems.length)
    : null;

  // PIC analytics (computed from current page items, keyed by picName || pic)
  const picStatsMap: Record<string, { total: number; selesai: number; overdue: number; done: number; target: number }> = {};
  for (const d of items) {
    const key = d.picName || d.pic || "—";
    if (!picStatsMap[key]) picStatsMap[key] = { total: 0, selesai: 0, overdue: 0, done: 0, target: 0 };
    picStatsMap[key].total++;
    if (d.statusProgress === "Selesai") picStatsMap[key].selesai++;
    if (isDeliveryOverdue(d, deadlineCfg)) picStatsMap[key].overdue++;
    picStatsMap[key].done   += d.totalVideoDone;
    picStatsMap[key].target += d.totalVideoTarget;
  }
  const picStats = Object.entries(picStatsMap)
    .map(([name, s]) => ({ name, ...s, rate: s.target > 0 ? Math.round((s.done / s.target) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5); // top 5 PICs

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kirim Sample</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-gray-500">Auto deadline {deadlineCfg.durasiPengiriman + deadlineCfg.durasiVideo1 + deadlineCfg.durasiVideo2 + deadlineCfg.durasiVideo3} hari · Reminder WA otomatis</p>
            {/* Google Form auto-sync status badge */}
            {(lastSyncAt || isSyncing) && (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                isSyncing
                  ? "bg-indigo-50 text-indigo-600"
                  : syncedCount > 0
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-50 text-gray-400"
              }`}>
                {isSyncing ? (
                  <><span className="w-2.5 h-2.5 border border-indigo-500 border-t-transparent rounded-full animate-spin" />Syncing…</>
                ) : syncedCount > 0 ? (
                  <>✓ {syncedCount} submission baru</>
                ) : (
                  <>🔄 Sync {lastSyncAt ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(lastSyncAt)) : ""}</>
                )}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
          + Kirim Sample Baru
        </button>
      </div>

      {/* Stats row 1: delivery status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Pengiriman", val: total,       icon: "📦", cls: "text-gray-900" },
          { label: "Selesai",          val: selesai,     icon: "✅", cls: "text-green-600" },
          { label: "On Progress",      val: onProgress,  icon: "🔄", cls: "text-blue-600" },
          { label: "Belum Mulai",      val: belum,       icon: "⏳", cls: "text-gray-500" },
          { label: "Terlambat",        val: overdue,     icon: "🚨", cls: overdue > 0 ? "text-red-600" : "text-gray-400" },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 ${
            s.label === "Terlambat" && overdue > 0 ? "border-red-200" : "border-gray-100"
          }`}>
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-lg font-bold ${s.cls}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stats row 2: performance metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "On Time", val: `${onTime}`, sub: `dari ${items.length} pengiriman`, icon: "🟢" },
          { label: "Completion Rate", val: `${completionRate}%`, sub: `${totalDone}/${totalTarget} video`, icon: "📊" },
          { label: "Avg Selesai", val: avgDays !== null ? `${avgDays} hari` : "—", sub: "dari tanggal kirim", icon: "⏱" },
          { label: "Video Done", val: `${totalDone}/${totalTarget}`, sub: "target keseluruhan", icon: "🎬" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{s.icon}</span>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
            <p className="text-lg font-bold text-gray-900">{s.val}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* PIC Analytics */}
      {picStats.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">📊 Statistik Per PIC (halaman ini)</p>
          <div className="space-y-2">
            {picStats.map(s => (
              <div key={s.name} className="flex items-center gap-3 text-xs">
                <span className="w-28 truncate text-gray-700 font-medium shrink-0">{s.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${s.rate >= 100 ? "bg-green-500" : s.rate > 0 ? "bg-blue-500" : "bg-gray-300"}`} style={{ width: `${s.rate}%` }} />
                </div>
                <span className="text-gray-500 w-10 text-right shrink-0">{s.rate}%</span>
                <span className="text-gray-400 w-16 text-right shrink-0">{s.done}/{s.target} vid</span>
                <span className={`w-14 text-right shrink-0 ${s.overdue > 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                  {s.overdue > 0 ? `⚠ ${s.overdue}` : "✓ ok"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <AddDeliveryForm
          onSuccess={() => { setShowForm(false); setFormPrefill(undefined); fetchData(); }}
          onCancel={() => { setShowForm(false); setFormPrefill(undefined); }}
          cfg={deadlineCfg}
          prefill={formPrefill}
        />
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <input type="text" placeholder="Cari username..."
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Semua Progress</option>
            <option value="Selesai">✅ Selesai</option>
            <option value="On Progress">🔄 On Progress</option>
            <option value="Belum Mulai">⏳ Belum Mulai</option>
          </select>
          <select value={submissionFilter} onChange={e => { setSubmissionFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Semua Submission</option>
            <option value="belum">⬜ Belum Submit</option>
            <option value="partial">🔵 Partial Submit</option>
            <option value="complete">✅ Complete</option>
            <option value="terlambat">🔴 Terlambat Submit</option>
          </select>
          {specialists.length > 0 && (
            <select value={picFilter} onChange={e => { setPicFilter(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Semua PIC</option>
              {specialists.map(s => (
                <option key={s.id} value={String(s.id)}>👤 {s.nama}</option>
              ))}
            </select>
          )}
          {(searchInput || statusFilter || submissionFilter || categoryFilter || picFilter) && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setStatusFilter(""); setSubmissionFilter(""); setCategoryFilter(""); setPicFilter(""); }}
              className="text-xs text-red-500 hover:underline px-2">Reset</button>
          )}
          <span className="text-sm text-gray-400 ml-auto">{items.length} pengiriman</span>
        </div>
        {/* Category filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => { setCategoryFilter(""); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${!categoryFilter ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
            Semua
          </button>
          {SAMPLE_CATEGORIES.map(cat => {
            const m = CATEGORY_META[cat];
            const active = categoryFilter === cat;
            return (
              <button key={cat} onClick={() => { setCategoryFilter(active ? "" : cat); setPage(1); }}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${active ? `${m.color} ring-1` : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                {m.icon} {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <DeliveryCardSkeleton key={i} />)}
        </div>
      ) : fetchError ? (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-8 py-12 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-700">Gagal memuat data</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">{fetchError}</p>
          <button
            onClick={() => fetchData()}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            🔄 Coba Lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-16 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="font-semibold text-gray-700">Belum ada pengiriman</p>
          <p className="text-sm text-gray-400 mt-1">Klik <strong>+ Kirim Sample Baru</strong> untuk mulai tracking</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(d => (
            <DeliveryCard key={d.id} delivery={d} templates={templates} cfg={deadlineCfg} onUpdated={handleUpdated} onDelete={handleDelete} waFooter={brand.waFooter} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 10 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-sm text-gray-500">{page} / {Math.ceil(total / 10)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 10)}
            className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}
