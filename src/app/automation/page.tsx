"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WAState {
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "reconnecting";
  qrDataUrl: string | null;
  phone: string | null;
  connectedAt: string | null;
  error: string | null;
}

interface AutomationConfig {
  automationEnabled: boolean;
  waAutomationEnabled: boolean;
  overdueWarningEnabled: boolean;
  autoReconnectEnabled: boolean;
}

interface AutomationStats {
  totalLogs: number;
  todaySent: number;
  todayFailed: number;
  totalPending: number;
  config: AutomationConfig;
}

interface ReminderLog {
  id: number;
  createdAt: string;
  username: string;
  tipeReminder: string;
  status: string;
  phone: string;
  pesan: string;
  errorMsg: string;
  pic: string;
}

interface RunResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ── Status helpers ────────────────────────────────────────────────────────────
function statusLabel(s: WAState["status"]) {
  switch (s) {
    case "connected":    return "Terhubung";
    case "connecting":   return "Menghubungkan…";
    case "qr_ready":     return "Scan QR Code";
    case "reconnecting": return "Menyambung ulang…";
    default:             return "Tidak Terhubung";
  }
}

function statusColor(s: WAState["status"]) {
  switch (s) {
    case "connected":    return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "connecting":
    case "reconnecting": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "qr_ready":     return "bg-blue-100 text-blue-700 border-blue-200";
    default:             return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function statusDot(s: WAState["status"]) {
  switch (s) {
    case "connected":    return "bg-emerald-500 animate-pulse";
    case "connecting":
    case "reconnecting": return "bg-yellow-400 animate-pulse";
    case "qr_ready":     return "bg-blue-500 animate-pulse";
    default:             return "bg-gray-400";
  }
}

function reminderStatusBadge(status: string) {
  switch (status) {
    case "sent":    return "bg-emerald-100 text-emerald-700";
    case "failed":  return "bg-red-100 text-red-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    default:        return "bg-yellow-100 text-yellow-700";
  }
}

function reminderTypeBadge(tipe: string) {
  if (tipe === "Final Warning")     return "bg-red-100 text-red-700";
  if (tipe.includes("Terlambat"))   return "bg-orange-100 text-orange-700";
  if (tipe.includes("Video"))       return "bg-purple-100 text-purple-700";
  if (tipe.includes("Pengiriman"))  return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${value ? "bg-violet-600" : "bg-gray-200"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${value ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AutomationPage() {
  const [waState, setWaState] = useState<WAState>({
    status: "disconnected",
    qrDataUrl: null,
    phone: null,
    connectedAt: null,
    error: null,
  });
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [config, setConfig] = useState<AutomationConfig>({
    automationEnabled: true,
    waAutomationEnabled: true,
    overdueWarningEnabled: true,
    autoReconnectEnabled: true,
  });
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [loadingDisconnect, setLoadingDisconnect] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ReminderLog | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch WA status ────────────────────────────────────────────────────────
  const fetchWAStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status");
      if (res.ok) setWaState(await res.json());
    } catch { /* ignore */ }
  }, []);

  // ── Fetch stats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/automation/stats");
      if (res.ok) {
        const data: AutomationStats = await res.json();
        setStats(data);
        setConfig(data.config);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`/api/automation/logs?page=${page}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setLogsTotal(data.total);
        setLogsPage(page);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchWAStatus();
    fetchStats();
    fetchLogs(1);
  }, [fetchWAStatus, fetchStats, fetchLogs]);

  // ── Poll WA status every 3 seconds when not connected ────────────────────
  useEffect(() => {
    if (waState.status === "connected") {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    if (!pollingRef.current) {
      pollingRef.current = setInterval(() => fetchWAStatus(), 3000);
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [waState.status, fetchWAStatus]);

  // ── Connect WA ────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setLoadingConnect(true);
    try {
      const res = await fetch("/api/wa/connect", { method: "POST" });
      if (res.ok) setWaState(await res.json());
    } catch { /* ignore */ }
    setLoadingConnect(false);
  };

  // ── Disconnect WA ─────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!confirm("Logout dari WhatsApp? Session akan dihapus dan kamu perlu scan QR ulang.")) return;
    setLoadingDisconnect(true);
    try {
      const res = await fetch("/api/wa/disconnect", { method: "POST" });
      if (res.ok) setWaState(await res.json());
    } catch { /* ignore */ }
    setLoadingDisconnect(false);
  };

  // ── Manual run ────────────────────────────────────────────────────────────
  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/automation/run", { method: "POST" });
      if (res.ok) {
        const data: RunResult = await res.json();
        setRunResult(data);
        fetchStats();
        fetchLogs(1);
      }
    } catch { /* ignore */ }
    setRunning(false);
  };

  // ── Save config toggle ────────────────────────────────────────────────────
  const handleConfigToggle = async (key: keyof AutomationConfig, val: boolean) => {
    const next = { ...config, [key]: val };
    setConfig(next);
    setSavingConfig(true);
    try {
      await fetch("/api/automation/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: val }),
      });
    } catch { /* ignore */ }
    setSavingConfig(false);
  };

  const logsPerPage = 20;
  const totalPages = Math.ceil(logsTotal / logsPerPage);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Automation Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Kelola koneksi WhatsApp, jadwal reminder otomatis, dan log aktivitas.
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Terkirim Hari Ini", value: stats.todaySent,   color: "text-emerald-600" },
            { label: "Gagal Hari Ini",    value: stats.todayFailed,  color: "text-red-500"    },
            { label: "Total Log",         value: stats.totalLogs,    color: "text-violet-600" },
            { label: "Delivery Aktif",    value: stats.totalPending, color: "text-blue-600"   },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: WA Connection ──────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          {/* WA Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <h2 className="font-semibold text-gray-800">WhatsApp</h2>
            </div>

            {/* Status badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${statusColor(waState.status)}`}>
              <span className={`w-2 h-2 rounded-full ${statusDot(waState.status)}`} />
              {statusLabel(waState.status)}
            </div>

            {/* Phone */}
            {waState.phone && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Nomor:</span> +{waState.phone}
              </div>
            )}
            {waState.connectedAt && (
              <div className="text-xs text-gray-400">
                Terhubung sejak {new Date(waState.connectedAt).toLocaleString("id-ID")}
              </div>
            )}

            {/* Error */}
            {waState.error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">
                {waState.error}
              </div>
            )}

            {/* QR Code */}
            {waState.status === "qr_ready" && waState.qrDataUrl && (
              <div className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 text-center">
                  Buka WhatsApp di HP → Menu → Perangkat Tertaut → Tautkan Perangkat
                </p>
                <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                  <Image
                    src={waState.qrDataUrl}
                    alt="WhatsApp QR Code"
                    width={220}
                    height={220}
                    className="rounded"
                    unoptimized
                  />
                </div>
                <p className="text-xs text-blue-600 font-medium">Scan QR Code di atas</p>
              </div>
            )}

            {/* Connecting state */}
            {(waState.status === "connecting" || waState.status === "reconnecting") && (
              <div className="flex items-center gap-2 text-sm text-yellow-700">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {waState.status === "reconnecting" ? "Menyambung ulang otomatis…" : "Menginisialisasi koneksi…"}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {waState.status === "disconnected" && (
                <button
                  onClick={handleConnect}
                  disabled={loadingConnect}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors"
                >
                  {loadingConnect ? "Menghubungkan…" : "Hubungkan WA"}
                </button>
              )}
              {(waState.status === "connected" || waState.status === "qr_ready") && (
                <button
                  onClick={handleDisconnect}
                  disabled={loadingDisconnect}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-colors"
                >
                  {loadingDisconnect ? "Logout…" : "Logout WA"}
                </button>
              )}
              <button
                onClick={fetchWAStatus}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm px-3 py-2 rounded-lg transition-colors"
                title="Refresh status"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0115.5-3M20 15a8 8 0 01-15.5 3" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Automation Rules ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Automation Rules
              {savingConfig && <span className="text-xs text-gray-400 font-normal ml-auto">Menyimpan…</span>}
            </h2>

            {[
              { key: "automationEnabled" as const,    label: "Automation Aktif",       desc: "Master switch seluruh automation" },
              { key: "waAutomationEnabled" as const,  label: "Kirim via WhatsApp",     desc: "Kirim reminder otomatis ke WA" },
              { key: "overdueWarningEnabled" as const,label: "Warning Terlambat",      desc: "Reminder Terlambat & Final Warning" },
              { key: "autoReconnectEnabled" as const, label: "Auto Reconnect",         desc: "Sambung ulang WA otomatis" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700">{item.label}</div>
                  <div className="text-xs text-gray-400 truncate">{item.desc}</div>
                </div>
                <Toggle
                  value={config[item.key]}
                  onChange={(v) => handleConfigToggle(item.key, v)}
                  disabled={savingConfig}
                />
              </div>
            ))}
          </div>

          {/* ── Manual Trigger ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Manual Trigger
            </h2>
            <p className="text-xs text-gray-500">
              Jalankan reminder engine sekarang tanpa menunggu jadwal 30 menit.
            </p>
            <button
              onClick={handleRun}
              disabled={running || waState.status !== "connected"}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {running && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {running ? "Menjalankan…" : "Jalankan Sekarang"}
            </button>
            {waState.status !== "connected" && (
              <p className="text-xs text-gray-400 text-center">WA harus terhubung untuk mengirim reminder.</p>
            )}

            {/* Run result */}
            {runResult && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1 text-xs">
                <div className="font-semibold text-gray-700 mb-1">Hasil Run:</div>
                <div className="grid grid-cols-2 gap-x-4">
                  <span className="text-gray-500">Diproses:</span>
                  <span className="font-medium">{runResult.processed}</span>
                  <span className="text-emerald-600">Terkirim:</span>
                  <span className="font-medium text-emerald-600">{runResult.sent}</span>
                  <span className="text-gray-400">Dilewati:</span>
                  <span>{runResult.skipped}</span>
                  <span className="text-red-500">Gagal:</span>
                  <span className="text-red-500">{runResult.failed}</span>
                </div>
                {runResult.errors.length > 0 && (
                  <div className="mt-2 text-red-600 bg-red-50 rounded p-2">
                    {runResult.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Reminder Activity Log ─────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Reminder Activity Log</h2>
                <p className="text-xs text-gray-400 mt-0.5">{logsTotal.toLocaleString("id-ID")} total entri</p>
              </div>
              <button
                onClick={() => fetchLogs(logsPage)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0115.5-3M20 15a8 8 0 01-15.5 3" />
                </svg>
                Refresh
              </button>
            </div>

            {logs.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm text-gray-400">Belum ada log reminder.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Waktu</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">PIC</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString("id-ID", {
                              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-800">@{log.username}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${reminderTypeBadge(log.tipeReminder)}`}>
                              {log.tipeReminder}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${reminderStatusBadge(log.status)}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{log.pic || "—"}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="text-xs text-violet-600 hover:text-violet-800 font-medium"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      Hal {logsPage} dari {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchLogs(logsPage - 1)}
                        disabled={logsPage <= 1}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => fetchLogs(logsPage + 1)}
                        disabled={logsPage >= totalPages}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Log Detail Modal ─────────────────────────────────────────────────── */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Detail Log #{selectedLog.id}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(selectedLog.createdAt).toLocaleString("id-ID")}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Username</div>
                  <div className="font-medium">@{selectedLog.username}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Tipe Reminder</div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${reminderTypeBadge(selectedLog.tipeReminder)}`}>
                    {selectedLog.tipeReminder}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Status</div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${reminderStatusBadge(selectedLog.status)}`}>
                    {selectedLog.status}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Nomor WA</div>
                  <div>{selectedLog.phone || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">PIC</div>
                  <div>{selectedLog.pic || "—"}</div>
                </div>
              </div>
              {selectedLog.pesan && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Pesan Terkirim</div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto border border-gray-100">
                    {selectedLog.pesan}
                  </div>
                </div>
              )}
              {selectedLog.errorMsg && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Error</div>
                  <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 border border-red-100">
                    {selectedLog.errorMsg}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
