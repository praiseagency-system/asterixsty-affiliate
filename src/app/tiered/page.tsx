"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { formatRupiah, formatNumber } from "@/lib/format";

// ─── Types ─────────────────────────────────────────────────────────────────
type Status = "UPCOMING" | "ONGOING" | "ACHIEVED" | "FAILED" | "EXPIRED";
type AgreementStatus = "Belum Upload" | "Uploaded" | "Signed";

interface LogChange { label: string; from: string; to: string; }
interface LogEntry  { date: string; changes: LogChange[]; }

interface Program {
  id: number;
  tiktokUsername: string; namaAffiliator: string; namaProgram: string;
  periodeTipe: string; startDate: string; endDate: string;
  targetGmv: number; targetVideo: number; targetLive: number; targetOrders: number;
  benefitKomisi: string; benefitCash: number; benefitBestSeller: boolean;
  benefitBonusProduk: string; benefitExclusive: boolean;
  pic: string; catatan: string;
  manualStatus: string; updateLog: string;
  agreementFilename: string; agreementPath: string; agreementSize: number;
  agreementUploadedAt: string | null; agreementStatus: string;
  currentGmv: number; status: Status; progressPct: number; daysLeft: number;
  createdAt: string;
}

interface Summary {
  totalAktif: number; achieved: number; ongoing: number;
  failed: number; upcoming: number; totalCashReward: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<Status, { label: string; color: string; bg: string; dot: string; border: string }> = {
  UPCOMING: { label: "Upcoming",  color: "text-blue-600",    bg: "bg-blue-50",    dot: "bg-blue-400",    border: "border-blue-200" },
  ONGOING:  { label: "Ongoing",   color: "text-amber-600",   bg: "bg-amber-50",   dot: "bg-amber-400",   border: "border-amber-200" },
  ACHIEVED: { label: "Achieved",  color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-400", border: "border-emerald-200" },
  FAILED:   { label: "Failed",    color: "text-red-600",     bg: "bg-red-50",     dot: "bg-red-400",     border: "border-red-200" },
  EXPIRED:  { label: "Expired",   color: "text-gray-500",    bg: "bg-gray-50",    dot: "bg-gray-400",    border: "border-gray-200" },
};

const AGREEMENT_CFG: Record<AgreementStatus, { color: string; bg: string; border: string }> = {
  "Belum Upload": { color: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200" },
  "Uploaded":     { color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  "Signed":       { color: "text-emerald-600",bg: "bg-emerald-50",border: "border-emerald-200" },
};

const STATUS_TABS = [
  { label: "Semua",   value: "" },
  { label: "Ongoing", value: "ONGOING" },
  { label: "Achieved",value: "ACHIEVED" },
  { label: "Upcoming",value: "UPCOMING" },
  { label: "Failed",  value: "FAILED" },
  { label: "Expired", value: "EXPIRED" },
];

const emptyForm = (): FormState => ({
  tiktokUsername: "", namaAffiliator: "", namaProgram: "",
  periodeTipe: "Bulanan", startDate: "", endDate: "",
  targetGmv: 0, targetVideo: 0, targetLive: 0, targetOrders: 0,
  benefitKomisi: "", benefitCash: 0, benefitBestSeller: false,
  benefitBonusProduk: "", benefitExclusive: false,
  pic: "", catatan: "", manualStatus: "",
});

interface FormState {
  tiktokUsername: string; namaAffiliator: string; namaProgram: string;
  periodeTipe: string; startDate: string; endDate: string;
  targetGmv: number; targetVideo: number; targetLive: number; targetOrders: number;
  benefitKomisi: string; benefitCash: number; benefitBestSeller: boolean;
  benefitBonusProduk: string; benefitExclusive: boolean;
  pic: string; catatan: string; manualStatus: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateShort(s: string) {
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-components ────────────────────────────────────────────────────────
function SummaryBar({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {[
        { label: "Total Aktif",  value: formatNumber(summary.totalAktif),         color: "text-indigo-600" },
        { label: "Achieved",     value: formatNumber(summary.achieved),            color: "text-emerald-600" },
        { label: "Ongoing",      value: formatNumber(summary.ongoing),             color: "text-amber-600" },
        { label: "Failed",       value: formatNumber(summary.failed),              color: "text-red-600" },
        { label: "Total Reward", value: formatRupiah(summary.totalCashReward),     color: "text-purple-600" },
      ].map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">{c.label}</p>
          <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ pct, status }: { pct: number; status: Status }) {
  const track = status === "ACHIEVED" ? "bg-emerald-100" : status === "FAILED" ? "bg-red-100" : "bg-gray-100";
  const fill  = status === "ACHIEVED" ? "bg-emerald-500" : status === "FAILED" ? "bg-red-400" : status === "ONGOING" ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className={`h-1.5 rounded-full ${track} overflow-hidden`}>
      <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function BenefitChips({ p }: { p: Pick<Program, "benefitKomisi"|"benefitCash"|"benefitBestSeller"|"benefitBonusProduk"|"benefitExclusive"> }) {
  const chips: { label: string; color: string }[] = [];
  if (p.benefitKomisi)    chips.push({ label: `Komisi: ${p.benefitKomisi}`,    color: "bg-blue-50 text-blue-700 border-blue-200" });
  if (p.benefitCash > 0)  chips.push({ label: `Cash ${formatRupiah(p.benefitCash)}`, color: "bg-purple-50 text-purple-700 border-purple-200" });
  if (p.benefitBestSeller) chips.push({ label: "Best Seller Pack",             color: "bg-yellow-50 text-yellow-700 border-yellow-200" });
  if (p.benefitBonusProduk) chips.push({ label: `Bonus: ${p.benefitBonusProduk}`, color: "bg-green-50 text-green-700 border-green-200" });
  if (p.benefitExclusive) chips.push({ label: "Exclusive",                    color: "bg-pink-50 text-pink-700 border-pink-200" });
  if (!chips.length) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`inline-block text-[10px] font-medium border rounded px-1.5 py-0.5 leading-tight ${c.color}`}>{c.label}</span>
      ))}
    </div>
  );
}

// ─── AgreementBadge ────────────────────────────────────────────────────────
function AgreementBadge({ status }: { status: string }) {
  const cfg = AGREEMENT_CFG[(status as AgreementStatus)] ?? AGREEMENT_CFG["Belum Upload"];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded px-1.5 py-0.5 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {status === "Signed" ? "✓ " : status === "Uploaded" ? "📎 " : ""}
      {status}
    </span>
  );
}

// ─── AgreementSection ──────────────────────────────────────────────────────
function AgreementSection({ program, onUpdate }: { program: Program; onUpdate: (p: Partial<Program>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [error, setError]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasFile = !!program.agreementFilename;

  async function handleUpload(file: File) {
    setError(""); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch(`/api/affiliate-program/${program.id}/upload`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Gagal upload"); return; }
      onUpdate({ agreementFilename: json.filename, agreementPath: json.path, agreementSize: json.size, agreementUploadedAt: json.uploadedAt, agreementStatus: json.status });
    } catch { setError("Terjadi kesalahan"); }
    setUploading(false);
  }

  async function handleDelete() {
    if (!confirm("Hapus file agreement ini?")) return;
    const res = await fetch(`/api/affiliate-program/${program.id}/upload`, { method: "DELETE" });
    if (res.ok) onUpdate({ agreementFilename: "", agreementPath: "", agreementSize: 0, agreementUploadedAt: null, agreementStatus: "Belum Upload" });
  }

  async function markSigned() {
    const res  = await fetch(`/api/affiliate-program/${program.id}/upload`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Signed" }) });
    const json = await res.json();
    if (res.ok) onUpdate({ agreementStatus: json.agreementStatus });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Surat Perjanjian</p>
        <AgreementBadge status={program.agreementStatus} />
      </div>

      {hasFile ? (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">
              {program.agreementFilename.endsWith(".pdf") ? "📄" : "🖼️"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{program.agreementFilename}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtFileSize(program.agreementSize)}
                {program.agreementUploadedAt && ` · ${fmtDate(program.agreementUploadedAt)}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <a
              href={program.agreementPath} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              View
            </a>
            <a
              href={program.agreementPath} download={program.agreementFilename}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download
            </a>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
              Replace
            </button>
            {program.agreementStatus !== "Signed" && (
              <button
                onClick={markSigned}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
              >
                ✓ Mark Signed
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-white border border-red-100 rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Hapus
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <div className="text-2xl mb-1">📄</div>
          <p className="text-sm font-medium text-gray-700">{uploading ? "Mengupload..." : "Upload Agreement File"}</p>
          <p className="text-xs text-gray-400 mt-0.5">PDF, JPG, atau PNG · Drag & drop atau klik</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── HistorySection ────────────────────────────────────────────────────────
function HistorySection({ log }: { log: string }) {
  const [open, setOpen] = useState(false);
  let entries: LogEntry[] = [];
  try { entries = JSON.parse(log || "[]"); } catch { entries = []; }
  if (entries.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Riwayat Perubahan</span>
          <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-medium">{entries.length}</span>
        </div>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
          {entries.map((entry, i) => (
            <div key={i} className="pt-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
                {new Date(entry.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="space-y-1">
                {entry.changes.map((c, j) => (
                  <div key={j} className="text-xs bg-white border border-gray-100 rounded-lg px-2.5 py-2">
                    <span className="font-semibold text-gray-600">{c.label}</span>
                    <span className="text-gray-400 mx-1">diubah</span>
                    <span className="line-through text-red-400">{c.from}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-medium text-emerald-600">{c.to}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ProgramCard ─────────────────────────────────────────────────────────────
function ProgramCard({ p, onDetail, onEdit, onDelete }: {
  p: Program;
  onDetail: (p: Program) => void;
  onEdit:   (p: Program) => void;
  onDelete: (id: number) => void;
}) {
  const cfg = STATUS_CFG[p.status];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onDetail(p)}>
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            <span className="text-[10px] text-gray-400 border border-gray-100 rounded-full px-2 py-0.5 bg-gray-50">{p.periodeTipe}</span>
            {p.agreementFilename && <AgreementBadge status={p.agreementStatus} />}
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">@{p.tiktokUsername}</p>
          {p.namaAffiliator && <p className="text-xs text-gray-400 truncate">{p.namaAffiliator}</p>}
          {p.namaProgram && <p className="text-xs text-gray-600 font-medium mt-0.5 truncate">{p.namaProgram}</p>}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onEdit(p)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
            title="Edit program"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button
            onClick={() => onDelete(p.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors"
            title="Hapus program"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* Period */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer" onClick={() => onDetail(p)}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        {fmtDateShort(p.startDate)} – {fmtDateShort(p.endDate)}
        {p.status === "ONGOING" && p.daysLeft > 0 && <span className="ml-auto text-amber-500 font-medium">{p.daysLeft}h lagi</span>}
      </div>

      {/* Progress */}
      <div className="space-y-1.5 cursor-pointer" onClick={() => onDetail(p)}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 font-medium">{formatRupiah(p.currentGmv)}</span>
          <span className="text-gray-400">/ {formatRupiah(p.targetGmv)}</span>
        </div>
        <ProgressBar pct={p.progressPct} status={p.status} />
        <div className="text-right text-[10px] text-gray-400">{p.progressPct.toFixed(1)}%</div>
      </div>

      {/* Benefits */}
      <div className="cursor-pointer" onClick={() => onDetail(p)}>
        <BenefitChips p={p} />
      </div>

      {/* Footer */}
      {p.pic && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 pt-1 border-t border-gray-50">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          {p.pic}
        </div>
      )}
    </div>
  );
}

// ─── ProgramDrawer (Create + Edit) ────────────────────────────────────────
function ProgramDrawer({ open, onClose, onSaved, editData }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: Program | null;
}) {
  const isEdit = !!editData;
  const [form,   setForm]   = useState<FormState>(emptyForm());
  const [localP, setLocalP] = useState<Program | null>(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Sync form when drawer opens
  useEffect(() => {
    if (!open) return;
    setError("");
    if (editData) {
      setLocalP(editData);
      setForm({
        tiktokUsername: editData.tiktokUsername,
        namaAffiliator: editData.namaAffiliator,
        namaProgram:    editData.namaProgram,
        periodeTipe:    editData.periodeTipe,
        startDate:      editData.startDate.slice(0, 10),
        endDate:        editData.endDate.slice(0, 10),
        targetGmv:      editData.targetGmv,
        targetVideo:    editData.targetVideo,
        targetLive:     editData.targetLive,
        targetOrders:   editData.targetOrders,
        benefitKomisi:  editData.benefitKomisi,
        benefitCash:    editData.benefitCash,
        benefitBestSeller:  editData.benefitBestSeller,
        benefitBonusProduk: editData.benefitBonusProduk,
        benefitExclusive:   editData.benefitExclusive,
        pic:            editData.pic,
        catatan:        editData.catatan,
        manualStatus:   editData.manualStatus,
      });
    } else {
      setLocalP(null);
      setForm(emptyForm());
    }
  }, [open, editData]);

  // Auto-fill from database when username selected (create mode)
  async function handleUsernameChange(val: string) {
    setForm((f) => ({ ...f, tiktokUsername: val }));
    if (!val || isEdit) return;
    try {
      const res  = await fetch(`/api/database?search=${encodeURIComponent(val)}&limit=1`);
      const json = await res.json();
      const a    = json.items?.[0];
      if (a && a.tiktokUsername.toLowerCase() === val.toLowerCase()) {
        setForm((f) => ({ ...f, namaAffiliator: a.namaAffiliator || "", pic: a.affiliateSpecialist || "" }));
      }
    } catch { /* ignore */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.tiktokUsername) { setError("Username TikTok wajib diisi"); return; }
    if (!form.startDate || !form.endDate) { setError("Periode wajib diisi"); return; }
    if (form.targetGmv <= 0) { setError("Target GMV wajib diisi"); return; }
    setSaving(true);
    try {
      const url    = isEdit ? `/api/affiliate-program/${editData!.id}` : "/api/affiliate-program";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Gagal menyimpan");
      } else {
        onSaved();
        onClose();
      }
    } catch { setError("Terjadi kesalahan"); }
    setSaving(false);
  }

  const inp  = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
  const set  = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  function field(label: string, children: React.ReactNode, required = false) {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {children}
      </div>
    );
  }

  return (
    <>
      <div className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 h-full w-full max-w-[460px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{isEdit ? "Edit Program" : "Buat Program Baru"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{isEdit ? `@${editData!.tiktokUsername}` : "Target & reward personal untuk affiliate"}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Creator */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Creator</p>
            {field("Username TikTok", (
              <SearchableSelect
                value={form.tiktokUsername}
                onChange={handleUsernameChange}
                suggestionsUrl="/api/master/suggestions?type=tiktokUsername"
                placeholder="Cari @username..."
                disabled={isEdit}
              />
            ), true)}
            {field("Nama Affiliator", (
              <input className={inp} value={form.namaAffiliator} onChange={(e) => set("namaAffiliator", e.target.value)} placeholder="Nama lengkap" />
            ))}
          </div>

          {/* Program */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Program</p>
            {field("Nama Program", (
              <input className={inp} value={form.namaProgram} onChange={(e) => set("namaProgram", e.target.value)} placeholder="e.g. Campaign Ramadan Elite" />
            ))}
            {field("Tipe Periode", (
              <select className={inp} value={form.periodeTipe} onChange={(e) => set("periodeTipe", e.target.value)}>
                <option value="Mingguan">Mingguan</option>
                <option value="Bulanan">Bulanan</option>
                <option value="Custom">Custom</option>
              </select>
            ))}
            <div className="grid grid-cols-2 gap-2">
              {field("Mulai", (
                <input type="date" className={inp} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              ), true)}
              {field("Selesai", (
                <input type="date" className={inp} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              ), true)}
            </div>
          </div>

          {/* Targets */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Target</p>
            {field("Target GMV (Rp)", (
              <input type="number" min={0} className={inp} value={form.targetGmv || ""} onChange={(e) => set("targetGmv", parseFloat(e.target.value) || 0)} placeholder="0" />
            ), true)}
            <div className="grid grid-cols-3 gap-2">
              {field("Video", (<input type="number" min={0} className={inp} value={form.targetVideo || ""} onChange={(e) => set("targetVideo", parseInt(e.target.value) || 0)} placeholder="0" />))}
              {field("Live",  (<input type="number" min={0} className={inp} value={form.targetLive  || ""} onChange={(e) => set("targetLive",  parseInt(e.target.value) || 0)} placeholder="0" />))}
              {field("Orders",(<input type="number" min={0} className={inp} value={form.targetOrders|| ""} onChange={(e) => set("targetOrders",parseInt(e.target.value) || 0)} placeholder="0" />))}
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Benefit</p>
            {field("Komisi (free text)", (<input className={inp} value={form.benefitKomisi} onChange={(e) => set("benefitKomisi", e.target.value)} placeholder="e.g. 8% komisi + free ongkir" />))}
            {field("Cash Reward (Rp)", (<input type="number" min={0} className={inp} value={form.benefitCash || ""} onChange={(e) => set("benefitCash", parseFloat(e.target.value) || 0)} placeholder="0" />))}
            {field("Bonus Produk", (<input className={inp} value={form.benefitBonusProduk} onChange={(e) => set("benefitBonusProduk", e.target.value)} placeholder="e.g. 2 pcs Parfum X" />))}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" checked={form.benefitBestSeller} onChange={(e) => set("benefitBestSeller", e.target.checked)} className="rounded text-indigo-600" />
                Best Seller Pack
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" checked={form.benefitExclusive} onChange={(e) => set("benefitExclusive", e.target.checked)} className="rounded text-indigo-600" />
                Exclusive
              </label>
            </div>
          </div>

          {/* PIC + Status Override + Catatan */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lainnya</p>
            {field("PIC", (
              <SearchableSelect value={form.pic} onChange={(v) => set("pic", v)} suggestionsUrl="/api/master/suggestions?type=specialist" placeholder="Pilih specialist..." />
            ))}
            {isEdit && field("Override Status", (
              <select className={inp} value={form.manualStatus} onChange={(e) => set("manualStatus", e.target.value)}>
                <option value="">Auto (dari kalkulasi)</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="ONGOING">Ongoing</option>
                <option value="ACHIEVED">Achieved</option>
                <option value="FAILED">Failed</option>
                <option value="EXPIRED">Expired</option>
              </select>
            ))}
            {field("Catatan", (
              <textarea className={`${inp} resize-none`} rows={3} value={form.catatan} onChange={(e) => set("catatan", e.target.value)} placeholder="Catatan tambahan..." />
            ))}
          </div>

          {/* Agreement upload (edit mode only) */}
          {isEdit && localP && (
            <div className="bg-gray-50 rounded-xl p-3">
              <AgreementSection
                program={localP}
                onUpdate={(patch) => setLocalP((prev) => prev ? { ...prev, ...patch } : prev)}
              />
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>}
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Batal
          </button>
          <button
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Program"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── DetailDrawer ────────────────────────────────────────────────────────────
function DetailDrawer({ program, onClose, onEdit, onDelete, onProgramUpdate }: {
  program: Program | null;
  onClose: () => void;
  onEdit:  (p: Program) => void;
  onDelete:(id: number) => void;
  onProgramUpdate: (patch: Partial<Program>) => void;
}) {
  if (!program) return null;
  const cfg = STATUS_CFG[program.status];
  const pct = program.progressPct;

  return (
    <>
      <div className={`fixed inset-0 bg-black/30 z-40`} onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-1 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
            </span>
            <span className="text-xs text-gray-400 border border-gray-100 rounded-full px-2 py-0.5 bg-gray-50">{program.periodeTipe}</span>
            {program.manualStatus && <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 font-medium">Manual Override</span>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { onEdit(program); onClose(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit
            </button>
            <button onClick={() => { onDelete(program.id); onClose(); }} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Creator */}
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-4 border border-indigo-100">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-2">Creator</p>
            <p className="text-lg font-bold text-gray-900">@{program.tiktokUsername}</p>
            {program.namaAffiliator && <p className="text-sm text-gray-500">{program.namaAffiliator}</p>}
            {program.namaProgram && <p className="text-sm font-semibold text-indigo-700 mt-1">{program.namaProgram}</p>}
            {program.pic && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                PIC: {program.pic}
              </div>
            )}
          </div>

          {/* Periode */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Periode</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{fmtDate(program.startDate)}</span>
              <span className="text-gray-300 mx-2">→</span>
              <span className="text-gray-700">{fmtDate(program.endDate)}</span>
            </div>
            {program.status === "ONGOING" && program.daysLeft > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-1.5">{program.daysLeft} hari tersisa</p>
            )}
          </div>

          {/* GMV Progress */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Progress GMV</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900">{formatRupiah(program.currentGmv)}</p>
                <p className="text-xs text-gray-400">GMV Aktual</p>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold text-gray-600">{formatRupiah(program.targetGmv)}</p>
                <p className="text-xs text-gray-400">Target</p>
              </div>
            </div>
            <ProgressBar pct={pct} status={program.status} />
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${cfg.color}`}>{pct.toFixed(1)}% tercapai</span>
              {program.targetGmv > program.currentGmv && (
                <span className="text-gray-400">Sisa: {formatRupiah(program.targetGmv - program.currentGmv)}</span>
              )}
            </div>
          </div>

          {/* Target tambahan */}
          {(program.targetVideo > 0 || program.targetLive > 0 || program.targetOrders > 0) && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Target Tambahan</p>
              <div className="grid grid-cols-3 gap-2">
                {program.targetVideo  > 0 && <div className="text-center"><p className="text-base font-bold text-gray-800">{program.targetVideo}</p><p className="text-[10px] text-gray-400">Video</p></div>}
                {program.targetLive   > 0 && <div className="text-center"><p className="text-base font-bold text-gray-800">{program.targetLive}</p><p className="text-[10px] text-gray-400">Live</p></div>}
                {program.targetOrders > 0 && <div className="text-center"><p className="text-base font-bold text-gray-800">{program.targetOrders}</p><p className="text-[10px] text-gray-400">Orders</p></div>}
              </div>
            </div>
          )}

          {/* Benefits */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Benefit</p>
            {program.benefitKomisi && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 mt-0.5 whitespace-nowrap">Komisi</span>
                <span className="text-sm text-gray-700">{program.benefitKomisi}</span>
              </div>
            )}
            {program.benefitCash > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5 whitespace-nowrap">Cash</span>
                <span className="text-sm font-semibold text-purple-700">{formatRupiah(program.benefitCash)}</span>
              </div>
            )}
            {program.benefitBonusProduk && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200 rounded px-1.5 py-0.5 mt-0.5 whitespace-nowrap">Bonus</span>
                <span className="text-sm text-gray-700">{program.benefitBonusProduk}</span>
              </div>
            )}
            {program.benefitBestSeller && <div className="flex items-center gap-2"><span className="text-[10px] font-semibold bg-yellow-50 text-yellow-600 border border-yellow-200 rounded px-1.5 py-0.5">Best Seller Pack</span></div>}
            {program.benefitExclusive  && <div className="flex items-center gap-2"><span className="text-[10px] font-semibold bg-pink-50 text-pink-600 border border-pink-200 rounded px-1.5 py-0.5">Exclusive Campaign</span></div>}
            {!program.benefitKomisi && !program.benefitCash && !program.benefitBonusProduk && !program.benefitBestSeller && !program.benefitExclusive && (
              <p className="text-xs text-gray-400">Belum ada benefit</p>
            )}
          </div>

          {/* Agreement */}
          <div className="bg-gray-50 rounded-xl p-3">
            <AgreementSection program={program} onUpdate={onProgramUpdate} />
          </div>

          {/* Catatan */}
          {program.catatan && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Catatan</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{program.catatan}</p>
            </div>
          )}

          {/* History */}
          <HistorySection log={program.updateLog} />
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AffiliateProgramPage() {
  const [items,   setItems]   = useState<Program[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterPic,    setFilterPic]    = useState("");
  const [search,       setSearch]       = useState("");

  const [showCreate,    setShowCreate]    = useState(false);
  const [editProgram,   setEditProgram]   = useState<Program | null>(null);
  const [detailProgram, setDetailProgram] = useState<Program | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterPic)    params.set("pic",    filterPic);
    if (search)       params.set("search", search);
    const res  = await fetch(`/api/affiliate-program?${params}`);
    const json = await res.json();
    setItems(json.items   || []);
    setTotal(json.total   || 0);
    setSummary(json.summary || null);
    setLoading(false);
  }, [filterStatus, filterPic, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSearch(val: string) {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setSearch(val), 300);
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus program ini? Tindakan ini tidak dapat dibatalkan.")) return;
    await fetch(`/api/affiliate-program/${id}`, { method: "DELETE" });
    fetchData();
  }

  function handleEdit(p: Program) {
    setDetailProgram(null);
    setEditProgram(p);
  }

  // Patch detail/list program in place (for agreement changes from drawer)
  function handleProgramPatch(patch: Partial<Program>) {
    if (detailProgram) setDetailProgram((prev) => prev ? { ...prev, ...patch } : prev);
    setItems((prev) => prev.map((p) => p.id === detailProgram?.id ? { ...p, ...patch } : p));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Program</h1>
          <p className="text-sm text-gray-400 mt-0.5">Target & reward personal untuk affiliate terpilih</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Buat Program
        </button>
      </div>

      {/* Summary */}
      <SummaryBar summary={summary} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterStatus(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${filterStatus === t.value ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
              {t.value && summary && (
                <span className="ml-1 opacity-60">
                  ({t.value==="ONGOING" ? summary.ongoing : t.value==="ACHIEVED" ? summary.achieved : t.value==="FAILED" ? summary.failed : t.value==="UPCOMING" ? summary.upcoming : 0})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <div className="w-48">
            <SearchableSelect value={filterPic} onChange={setFilterPic} suggestionsUrl="/api/master/suggestions?type=specialist" placeholder="Filter PIC..." />
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Cari username / program..."
              onChange={(e) => handleSearch(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 pl-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
      </div>

      {!loading && <p className="text-xs text-gray-400">{total} program ditemukan</p>}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-52 animate-pulse">
              <div className="flex gap-2 mb-3"><div className="h-5 w-16 bg-gray-100 rounded-full" /><div className="h-5 w-12 bg-gray-100 rounded-full" /></div>
              <div className="h-4 w-32 bg-gray-100 rounded mb-1" /><div className="h-3 w-24 bg-gray-100 rounded mb-4" />
              <div className="h-2 w-full bg-gray-100 rounded mb-3" /><div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <p className="text-gray-500 font-medium">Belum ada program terdaftar</p>
          <p className="text-gray-400 text-sm mt-1">Klik "Buat Program" untuk menambahkan target & reward personal</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2 text-sm font-semibold">
            Buat Program Pertama
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <ProgramCard
              key={p.id}
              p={p}
              onDetail={setDetailProgram}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Drawers */}
      <ProgramDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={fetchData}
      />
      <ProgramDrawer
        open={!!editProgram}
        onClose={() => setEditProgram(null)}
        onSaved={() => { fetchData(); setEditProgram(null); }}
        editData={editProgram}
      />
      <DetailDrawer
        program={detailProgram}
        onClose={() => setDetailProgram(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onProgramUpdate={handleProgramPatch}
      />
    </div>
  );
}
