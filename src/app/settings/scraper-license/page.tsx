"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LicenseInfo {
  licenseKey:    string;
  workspaceName: string;
  brandName:     string;
  isActive:      boolean;
  expiryDate:    string;
  stats: {
    totalOrders:   number;
    pendingOrders: number;
    lastScrapedAt: string | null;
    lastPlatform:  string | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1)   return "Baru saja";
  if (diff < 60)  return `${diff} menit lalu`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ScraperLicensePage() {
  const { current } = useWorkspace();
  const wsId = current?.id ?? 1;

  const [info,      setInfo]      = useState<LicenseInfo | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [copied,    setCopied]    = useState(false);
  const [masked,    setMasked]    = useState(true);
  const [regen,     setRegen]     = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/scraper-license?workspaceId=${wsId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal memuat");
      setInfo(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  useEffect(() => { void fetchInfo(); }, [fetchInfo]);

  const copyKey = async () => {
    if (!info?.licenseKey) return;
    await navigator.clipboard.writeText(info.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (!regenConfirm) { setRegenConfirm(true); return; }
    setRegen(true);
    setRegenConfirm(false);
    try {
      const res = await fetch(`/api/settings/scraper-license?workspaceId=${wsId}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal regenerate");
      await fetchInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRegen(false);
    }
  };

  const displayKey = info?.licenseKey
    ? (masked ? info.licenseKey.replace(/[^-]/g, (_, i) => i < 7 ? info!.licenseKey[i] : "•") : info.licenseKey)
    : "";

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scraper License</h1>
        <p className="text-sm text-muted mt-1">
          License key untuk Chrome Extension scraper. Gunakan key ini sebagai{" "}
          <code className="bg-subtle px-1.5 py-0.5 rounded text-xs font-mono">Authorization: Bearer</code> header.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LicenseCardSkeleton />
      ) : info ? (
        <>
          {/* License card */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{info.brandName}</p>
                  <p className="text-xs text-muted">{info.workspaceName}</p>
                </div>
              </div>
              {/* Status badge */}
              <span className={[
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                info.isActive
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200",
              ].join(" ")}>
                <span className={`w-1.5 h-1.5 rounded-full ${info.isActive ? "bg-green-500" : "bg-red-500"}`} />
                {info.isActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>

            {/* License key display */}
            <div className="px-5 py-5">
              <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">License Key</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-subtle border border-border rounded-xl px-4 py-3 font-mono text-sm text-foreground tracking-wider overflow-x-auto">
                  {displayKey}
                </div>
                {/* Toggle mask */}
                <button
                  onClick={() => setMasked(m => !m)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-subtle text-muted hover:text-foreground hover:bg-border transition-colors shrink-0"
                  title={masked ? "Tampilkan" : "Sembunyikan"}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    {masked
                      ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                      : <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    }
                  </svg>
                </button>
                {/* Copy */}
                <button
                  onClick={copyKey}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-subtle text-muted hover:text-foreground hover:bg-border transition-colors shrink-0"
                  title="Copy license key"
                >
                  {copied ? (
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 mt-1.5">✓ Tersalin ke clipboard</p>
              )}

              {/* Meta info */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-subtle rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-faint uppercase tracking-wider mb-0.5">Berlaku hingga</p>
                  <p className="text-sm font-semibold text-foreground">{info.expiryDate}</p>
                </div>
                <div className="bg-subtle rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-faint uppercase tracking-wider mb-0.5">Platform</p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {info.stats.lastPlatform ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Total Orders Scraped"
              value={info.stats.totalOrders.toLocaleString("id-ID")}
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              color="text-indigo-500 bg-indigo-50"
            />
            <StatCard
              label="Menunggu Konfirmasi"
              value={info.stats.pendingOrders.toLocaleString("id-ID")}
              icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              color="text-amber-500 bg-amber-50"
            />
            <StatCard
              label="Scrape Terakhir"
              value={relativeTime(info.stats.lastScrapedAt)}
              icon="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              color="text-green-500 bg-green-50"
            />
          </div>

          {/* Usage guide */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
              </svg>
              Cara Penggunaan
            </h2>
            <div className="space-y-3 text-sm text-muted">
              <p>Pasang license key di Chrome Extension pada bagian <strong className="text-foreground">Settings → License Key</strong>, lalu klik Connect.</p>
              <div className="bg-subtle rounded-xl p-3 font-mono text-xs text-foreground space-y-1">
                <p className="text-faint"># Validasi license</p>
                <p>POST {process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.praiseagency.id"}/api/v1/license/validate</p>
                <p className="text-faint mt-2"># Kirim data scrape</p>
                <p>POST {process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.praiseagency.id"}/api/v1/samples/create</p>
                <p className="text-faint">Authorization: Bearer <span className="text-accent">{info.licenseKey}</span></p>
              </div>
            </div>
          </div>

          {/* Danger zone — regenerate (OWNER only) */}
          <div className="bg-surface border border-red-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-red-600 mb-1">Danger Zone</h2>
            <p className="text-xs text-muted mb-3">
              Regenerate akan membuat license key baru. Chrome Extension harus diupdate manual dengan key baru.
              Key lama tidak bisa digunakan lagi.
            </p>
            {regenConfirm ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-red-600 font-medium">Yakin? Key lama akan invalid.</p>
                <button
                  onClick={handleRegenerate}
                  disabled={regen}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {regen ? "Generating…" : "Ya, Regenerate"}
                </button>
                <button
                  onClick={() => setRegenConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={handleRegenerate}
                className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                Regenerate License Key
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: string; color: string;
}) {
  const [bg, text] = color.split(" ");
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        <svg className={`w-4 h-4 ${text}`} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function LicenseCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-subtle" />
        <div className="space-y-1.5">
          <div className="w-32 h-4 rounded bg-subtle" />
          <div className="w-24 h-3 rounded bg-subtle" />
        </div>
      </div>
      <div className="h-11 rounded-xl bg-subtle" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-14 rounded-xl bg-subtle" />
        <div className="h-14 rounded-xl bg-subtle" />
      </div>
    </div>
  );
}
