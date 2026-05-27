"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface TierConfig {
  id: number; tier: string; label: string; minGmv: number; color: string;
}
interface CriteriaRow {
  minValue: number;
}
interface DeadlineConfig {
  durasiPengiriman: number;
  durasiVideo1: number;
  durasiVideo2: number;
  durasiVideo3: number;
  finalWarningDelay: number;
  reminderOverdue: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TIER_COLORS: Record<string, string> = {
  A: "bg-yellow-50 border-yellow-200",
  B: "bg-blue-50 border-blue-200",
  C: "bg-gray-50 border-gray-200",
};

const MONITORING_SCORE = [
  { komponen: "GMV", minValue: "≥ Rp 10 Jt", poin: 6 },
  { komponen: "GMV", minValue: "≥ Rp 5 Jt",  poin: 5 },
  { komponen: "GMV", minValue: "≥ Rp 1 Jt",  poin: 4 },
  { komponen: "GMV", minValue: "≥ Rp 300 rb", poin: 2 },
  { komponen: "GMV", minValue: "≥ Rp 0",      poin: 1 },
  { komponen: "Items Sold", minValue: "≥ 100 pcs", poin: 2 },
  { komponen: "Items Sold", minValue: "≥ 50 pcs",  poin: 1 },
  { komponen: "Total Video", minValue: "≥ 5 video", poin: 1 },
  { komponen: "Live Stream", minValue: "≥ 1 live",  poin: 1 },
];

function formatGmv(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)} M`;
  if (v >= 1_000_000)     return `Rp ${(v / 1_000_000).toFixed(1).replace(".0","")} Jt`;
  if (v >= 1_000)         return `Rp ${(v / 1_000).toFixed(0)} rb`;
  return v === 0 ? "Rp 0" : `Rp ${v}`;
}

function isAscending(rows: CriteriaRow[]): boolean {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].minValue <= rows[i - 1].minValue) return false;
  }
  return true;
}

// ─── CriteriaTable Component ─────────────────────────────────────────────────
function CriteriaTable({
  title, subtitle, emoji, rows, onChange, valueLabel, valueFmt, valueUnit,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  rows: CriteriaRow[];
  onChange: (rows: CriteriaRow[]) => void;
  valueLabel: string;
  valueFmt?: (v: number) => string;
  valueUnit?: string;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ordered   = isAscending(rows);

  function addRow() {
    const last = rows[rows.length - 1]?.minValue ?? 0;
    onChange([...rows, { minValue: last > 0 ? last * 2 : 100 }]);
    // focus new input next tick
    setTimeout(() => inputRefs.current[rows.length]?.focus(), 50);
  }

  function deleteRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, v: number) {
    const next = [...rows];
    next[i] = { minValue: v };
    onChange(next);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-50">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{emoji} {title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Tambah Kriteria
          </button>
        </div>

        {/* Validation warning */}
        {rows.length > 1 && !ordered && (
          <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <p className="text-xs text-amber-700 font-medium">Nilai harus urut ascending (dari terkecil ke terbesar)</p>
          </div>
        )}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-400">Belum ada kriteria. Klik "+ Tambah Kriteria" untuk mulai.</p>
        </div>
      ) : (
        <div className="overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-12 gap-0 border-b border-gray-100 bg-gray-50 px-4 py-2">
            <div className="col-span-1 text-xs font-semibold text-gray-500 text-center">No</div>
            <div className="col-span-7 text-xs font-semibold text-gray-500 pl-2">{valueLabel}</div>
            <div className="col-span-2 text-xs font-semibold text-gray-500 text-center">Point</div>
            <div className="col-span-2 text-xs font-semibold text-gray-500 text-center">Aksi</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {rows.map((row, i) => {
              const point = i + 1;
              const isDuplicate = rows.some((r, j) => j !== i && r.minValue === row.minValue);
              const isOutOfOrder = i > 0 && row.minValue <= rows[i - 1].minValue;

              return (
                <div
                  key={i}
                  className={`grid grid-cols-12 gap-0 px-4 py-2.5 items-center group transition-colors ${
                    isOutOfOrder ? "bg-amber-50/50" : "hover:bg-gray-50/50"
                  }`}
                >
                  {/* No */}
                  <div className="col-span-1 text-center">
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 rounded-full w-5 h-5 inline-flex items-center justify-center">{i + 1}</span>
                  </div>

                  {/* Value input */}
                  <div className="col-span-7 pl-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 max-w-[180px]">
                        {valueUnit && (
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
                            {valueUnit}
                          </span>
                        )}
                        <input
                          ref={(el) => { inputRefs.current[i] = el; }}
                          type="number"
                          min={0}
                          value={row.minValue || ""}
                          onChange={(e) => updateRow(i, parseFloat(e.target.value) || 0)}
                          className={`w-full border rounded-lg py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                            valueUnit ? "pl-8 pr-2" : "px-3"
                          } ${isDuplicate || isOutOfOrder ? "border-amber-300" : "border-gray-200"}`}
                        />
                      </div>
                      {/* Formatted preview */}
                      {valueFmt && row.minValue > 0 && (
                        <span className="text-xs text-gray-500 whitespace-nowrap font-medium">
                          = {valueFmt(row.minValue)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Point badge */}
                  <div className="col-span-2 flex justify-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${
                      point <= 1 ? "bg-gray-100 text-gray-500 border-gray-200"
                      : point <= 2 ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-indigo-100 text-indigo-700 border-indigo-200"
                    }`}>
                      {point}
                    </span>
                  </div>

                  {/* Delete */}
                  <div className="col-span-2 flex justify-center">
                    <button
                      onClick={() => deleteRow(i)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Hapus baris"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer legend */}
          <div className="px-4 py-3 border-t border-gray-50 bg-gray-50/50">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Point dihitung otomatis berdasarkan urutan baris (baris 1 = 1 poin, baris 2 = 2 poin, dst).
              Nilai di atas threshold tertinggi mendapat poin terbesar. Nilai di bawah semua threshold mendapat 0 poin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Preview Card ─────────────────────────────────────────────────────────────
function CriteriaPreview({
  gmvRows, qtyRows,
}: {
  gmvRows: CriteriaRow[];
  qtyRows: CriteriaRow[];
}) {
  const sorted = (rows: CriteriaRow[]) => [...rows].sort((a, b) => b.minValue - a.minValue);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-[#0F1B2D] rounded-2xl border border-indigo-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-indigo-700 mb-3">🔍 Preview Scoring Logic</h3>
      <p className="text-xs text-gray-500 mb-4">Ini adalah logika scoring yang akan digunakan di Affiliate Scouting</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">GMV Score</p>
          <div className="space-y-1">
            {sorted(gmvRows).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                <span className="text-gray-600">≥ {formatGmv(r.minValue)}</span>
                <span className="font-bold text-indigo-600">{gmvRows.length - i} poin</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-400">Di bawah semua threshold</span>
              <span className="font-bold text-gray-400">0 poin</span>
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Qty Score</p>
          <div className="space-y-1">
            {sorted(qtyRows).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                <span className="text-gray-600">≥ {r.minValue} pcs</span>
                <span className="font-bold text-indigo-600">{qtyRows.length - i} poin</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-400">Di bawah semua threshold</span>
              <span className="font-bold text-gray-400">0 poin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Component ─────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${value ? "bg-indigo-600" : "bg-gray-200"}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

interface AutomationConfig {
  automationEnabled: boolean;
  waAutomationEnabled: boolean;
  overdueWarningEnabled: boolean;
  autoReconnectEnabled: boolean;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tierConfig,    setTierConfig]    = useState<TierConfig[]>([]);
  const [gmvCriteria,   setGmvCriteria]   = useState<CriteriaRow[]>([]);
  const [qtyCriteria,   setQtyCriteria]   = useState<CriteriaRow[]>([]);
  const [deadlineConfig, setDeadlineConfig] = useState<DeadlineConfig>({
    durasiPengiriman: 5, durasiVideo1: 3, durasiVideo2: 3, durasiVideo3: 4,
    finalWarningDelay: 5, reminderOverdue: true,
  });
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>({
    automationEnabled: true, waAutomationEnabled: true,
    overdueWarningEnabled: true, autoReconnectEnabled: true,
  });
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [status,   setStatus]   = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [configRes, automationRes] = await Promise.all([
      fetch("/api/admin/config"),
      fetch("/api/automation/config"),
    ]);
    const json = await configRes.json();
    setTierConfig(json.tierConfig   || []);
    setGmvCriteria(json.gmvCriteria || []);
    setQtyCriteria(json.qtyCriteria || []);
    if (json.deadlineConfig) setDeadlineConfig(json.deadlineConfig);
    if (automationRes.ok) setAutomationConfig(await automationRes.json());
    setLoading(false);
  }

  async function handleAutomationToggle(key: keyof AutomationConfig, val: boolean) {
    const next = { ...automationConfig, [key]: val };
    setAutomationConfig(next);
    setSavingAutomation(true);
    try {
      await fetch("/api/automation/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: val }),
      });
    } catch { /* ignore */ }
    setSavingAutomation(false);
  }

  async function save() {
    if (gmvCriteria.length > 1 && !isAscending(gmvCriteria)) {
      setStatus("❌ GMV Kriteria harus urut ascending (dari terkecil ke terbesar)");
      return;
    }
    if (qtyCriteria.length > 1 && !isAscending(qtyCriteria)) {
      setStatus("❌ Qty Kriteria harus urut ascending");
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierConfig, gmvCriteria, qtyCriteria, deadlineConfig }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus("✅ Konfigurasi berhasil disimpan! Semua perubahan sudah aktif.");
        load();
      } else {
        setStatus(`❌ ${json.error || "Gagal menyimpan"}`);
      }
    } catch {
      setStatus("❌ Terjadi error");
    }
    setSaving(false);
  }

  function updateTier(id: number, field: keyof TierConfig, value: string | number) {
    setTierConfig((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">Memuat konfigurasi...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Konfigurasi Sistem</h1>
          <p className="text-sm text-gray-500 mt-0.5">Atur threshold tier & scoring Affiliate Scouting</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Menyimpan...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Simpan Semua Perubahan
            </>
          )}
        </button>
      </div>

      {/* Status feedback */}
      {status && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          status.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {status}
        </div>
      )}

      {/* ─── Tier Config ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">🏆 Konfigurasi Tier</h2>
          <p className="text-xs text-gray-400 mt-0.5">Threshold GMV untuk kategori tier affiliate. Berlaku langsung di Monitoring Bulanan.</p>
        </div>
        {tierConfig.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Tidak ada tier config. Jalankan <code className="bg-gray-100 px-1 rounded">npm run db:seed</code> terlebih dahulu.
          </div>
        ) : (
          <div className="px-6 py-4 space-y-3">
            {tierConfig.map((t) => (
              <div key={t.id} className={`border rounded-xl p-4 ${TIER_COLORS[t.tier] || "bg-gray-50 border-gray-200"}`}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tier</label>
                    <input value={t.tier} onChange={(e) => updateTier(t.id, "tier", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Label Program</label>
                    <input value={t.label} onChange={(e) => updateTier(t.id, "label", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Min GMV (Rp)</label>
                    <input type="number" value={t.minGmv} onChange={(e) => updateTier(t.id, "minGmv", parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-700">≥ {formatGmv(t.minGmv)}</p>
                    <p className="text-xs text-gray-400">{t.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── GMV Kriteria ────────────────────────────────────────────────── */}
      <CriteriaTable
        title="GMV Kriteria — Scouting Scoring"
        subtitle="Threshold GMV per 30 hari untuk menentukan skor GMV di Affiliate Scouting. Urut dari terkecil ke terbesar."
        emoji="📈"
        rows={gmvCriteria}
        onChange={setGmvCriteria}
        valueLabel="GMV per 30 Hari (Rp)"
        valueFmt={formatGmv}
        valueUnit="Rp"
      />

      {/* ─── Qty Kriteria ─────────────────────────────────────────────────── */}
      <CriteriaTable
        title="Qty Produk Kriteria — Scouting Scoring"
        subtitle="Threshold jumlah produk terjual per 30 hari untuk skor Qty di Affiliate Scouting. Urut dari terkecil ke terbesar."
        emoji="📦"
        rows={qtyCriteria}
        onChange={setQtyCriteria}
        valueLabel="Qty Produk Terjual (pcs)"
        valueUnit="pcs"
      />

      {/* ─── Reminder Timeline Configuration ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">⏱ Reminder Timeline Configuration</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Durasi (hari) dihitung kumulatif dari tanggal kirim sample. Mempengaruhi deadline tracking dan pemilihan template WA.
          </p>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Duration fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              { key: "durasiPengiriman", label: "Durasi Pengiriman", sub: "Produk Sampai (D+N)" },
              { key: "durasiVideo1",     label: "Durasi Video 1",    sub: "Setelah produk sampai" },
              { key: "durasiVideo2",     label: "Durasi Video 2",    sub: "Setelah Video 1" },
              { key: "durasiVideo3",     label: "Durasi Video 3+",   sub: "Setelah Video 2 (dst)" },
            ] as { key: keyof DeadlineConfig; label: string; sub: string }[]).map(({ key, label, sub }) => {
              const val = deadlineConfig[key] as number;
              const cum = key === "durasiPengiriman" ? val
                : key === "durasiVideo1" ? deadlineConfig.durasiPengiriman + val
                : key === "durasiVideo2" ? deadlineConfig.durasiPengiriman + deadlineConfig.durasiVideo1 + val
                : deadlineConfig.durasiPengiriman + deadlineConfig.durasiVideo1 + deadlineConfig.durasiVideo2 + val;
              return (
                <div key={key} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <label className="block text-xs font-semibold text-gray-600 mb-0.5">{label}</label>
                  <p className="text-[11px] text-gray-400 mb-2">{sub}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={val}
                      onChange={e => setDeadlineConfig(c => ({ ...c, [key]: Math.max(1, Number(e.target.value) || 1) }))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-500">hari</span>
                  </div>
                  <p className="text-[11px] text-indigo-600 font-medium mt-1.5">D+{cum} dari kirim</p>
                </div>
              );
            })}
          </div>

          {/* Final Warning + Reminder Overdue toggle */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">Final Warning Delay</label>
              <p className="text-[11px] text-gray-400 mb-2">Hari overdue sebelum beralih ke template Final Warning</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={deadlineConfig.finalWarningDelay}
                  onChange={e => setDeadlineConfig(c => ({ ...c, finalWarningDelay: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-500">hari terlambat</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">Reminder saat Overdue</label>
              <p className="text-[11px] text-gray-400 mb-3">Tampilkan tombol WA Reminder meski sudah melewati deadline</p>
              <button
                onClick={() => setDeadlineConfig(c => ({ ...c, reminderOverdue: !c.reminderOverdue }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  deadlineConfig.reminderOverdue
                    ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${deadlineConfig.reminderOverdue ? "bg-green-500 border-green-500" : "bg-white border-gray-300"}`} />
                {deadlineConfig.reminderOverdue ? "ON — Tampilkan Reminder" : "OFF — Sembunyikan"}
              </button>
            </div>
          </div>

          {/* Summary preview */}
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-bold text-indigo-600 mb-2 uppercase tracking-wide">Preview Timeline Aktif</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Produk Sampai", d: deadlineConfig.durasiPengiriman },
                { label: "Video 1", d: deadlineConfig.durasiPengiriman + deadlineConfig.durasiVideo1 },
                { label: "Video 2", d: deadlineConfig.durasiPengiriman + deadlineConfig.durasiVideo1 + deadlineConfig.durasiVideo2 },
                { label: "Video 3", d: deadlineConfig.durasiPengiriman + deadlineConfig.durasiVideo1 + deadlineConfig.durasiVideo2 + deadlineConfig.durasiVideo3 },
              ].map(({ label, d }) => (
                <div key={label} className="bg-white rounded-lg px-3 py-1.5 border border-indigo-100 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-indigo-700">{label}</span>
                  <span className="text-xs text-indigo-400 font-bold">D+{d}</span>
                </div>
              ))}
              <div className="bg-white rounded-lg px-3 py-1.5 border border-red-100 flex items-center gap-1.5">
                <span className="text-xs font-medium text-red-600">Final Warning</span>
                <span className="text-xs text-red-400 font-bold">+{deadlineConfig.finalWarningDelay}h overdue</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Automation Rules ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">🤖 Automation Rules</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Kontrol sistem automation reminder WhatsApp. Perubahan aktif langsung tanpa perlu simpan.
            </p>
          </div>
          {savingAutomation && <span className="text-xs text-gray-400">Menyimpan…</span>}
        </div>
        <div className="px-6 py-5 space-y-4">
          {([
            { key: "automationEnabled" as const,    label: "Automation Aktif",   desc: "Master switch seluruh sistem automation reminder" },
            { key: "waAutomationEnabled" as const,  label: "Kirim via WhatsApp", desc: "Kirim reminder otomatis ke nomor WA affiliator" },
            { key: "overdueWarningEnabled" as const,label: "Warning Terlambat",  desc: "Aktifkan Reminder Terlambat & Final Warning saat overdue" },
            { key: "autoReconnectEnabled" as const, label: "Auto Reconnect WA",  desc: "Sambung ulang WhatsApp otomatis jika koneksi terputus" },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 bg-gray-50 rounded-xl px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
              <Toggle
                value={automationConfig[key]}
                onChange={(v) => handleAutomationToggle(key, v)}
                disabled={savingAutomation}
              />
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">
            Untuk melihat status koneksi WA dan log reminder, buka{" "}
            <a href="/automation" className="text-indigo-600 hover:underline font-medium">Automation Center →</a>
          </p>
        </div>
      </div>

      {/* ─── Monitoring Score Reference ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">📊 Sistem Scoring Monitoring</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Referensi poin per komponen. Status: ≥8 = <span className="text-yellow-600 font-medium">⭐ SCALE</span>, ≥5 = <span className="text-blue-600 font-medium">📈 PUSH</span>, &lt;5 = <span className="text-gray-500 font-medium">👀 MONITOR</span>.
          </p>
        </div>
        <div className="px-6 py-4">
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Komponen</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Kondisi</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MONITORING_SCORE.map((s, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-3 py-2 font-medium text-gray-700">{s.komponen}</td>
                    <td className="px-3 py-2 text-gray-500">{s.minValue}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold ${s.poin >= 5 ? "text-yellow-600" : s.poin >= 3 ? "text-blue-600" : "text-gray-600"}`}>+{s.poin}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">* Sistem memilih poin tertinggi yang sesuai threshold. Total maks = 10.</p>
        </div>
      </div>

      {/* ─── Preview Scoring Logic ─────────────────────────────────────────── */}
      {(gmvCriteria.length > 0 || qtyCriteria.length > 0) && (
        <CriteriaPreview gmvRows={gmvCriteria} qtyRows={qtyCriteria} />
      )}

      {/* Bottom save */}
      <div className="flex justify-end pb-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? "Menyimpan..." : "Simpan Semua Perubahan"}
        </button>
      </div>
    </div>
  );
}
