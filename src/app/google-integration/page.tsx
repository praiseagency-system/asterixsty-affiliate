"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoogleStatus {
  hasCredentials:    boolean;
  configured:        boolean;
  connected:         boolean;
  tokenExpired:      boolean;
  status?:           string;
  email?:            string;
  connectedEmail?:   string;
  clientId?:         string;
  googleFormId?:     string;
  googleFormPublicId?: string;
  googleFormTitle?:  string;
  googleSheetId?:    string;
  googleSheetName?:  string;
  entryIds?:         Record<string, string>;
  questionIds?:      Record<string, string>;
  lastSyncAt?:       string | null;
  connectedAt?:      string | null;
}

interface IntegrationInfo {
  brandId?:        string;
  clientId?:       string;
  hasSecret?:      boolean;
  status?:         string;
  connectedEmail?: string;
}

interface SyncResult {
  ok:       boolean;
  synced?:  number;
  skipped?: number;
  errors?:  string[];
  error?:   string;
}

interface FormSetupResult {
  ok:          boolean;
  formId?:     string;
  publicId?:   string;
  previewLink?: string;
  entryIds?:   Record<string, string>;
  error?:      string;
}

interface FixEntryResult {
  ok:       boolean;
  entryIds?: Record<string, string>;
  message?:  string;
  error?:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(d));
}

function StatusChip({ status, hasCredentials, connected, tokenExpired }: {
  status?: string; hasCredentials: boolean; connected: boolean; tokenExpired: boolean;
}) {
  if (!hasCredentials) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">● No Credentials</span>;
  }
  if (connected) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">● Connected</span>;
  }
  if (tokenExpired || status === "expired") {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600">● Token Expired</span>;
  }
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">● Disconnected</span>;
}

// ── Inner page (uses useSearchParams) ─────────────────────────────────────────
function GoogleIntegrationInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [status,        setStatus]        = useState<GoogleStatus | null>(null);
  const [integration,   setIntegration]   = useState<IntegrationInfo | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [connecting,    setConnecting]    = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Credentials state
  const [clientId,     setClientId]     = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret,   setShowSecret]   = useState(false);
  const [savingCreds,  setSavingCreds]  = useState(false);
  const [savedCreds,   setSavedCreds]   = useState(false);

  // Redirect URI + JS Origin (computed client-side)
  const [redirectUri,  setRedirectUri]  = useState("");
  const [jsOrigin,     setJsOrigin]     = useState("");
  const [copiedUri,    setCopiedUri]    = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  // Form setup
  const [formTitle,     setFormTitle]     = useState("Asterixsty Video Submission");
  const [settingUpForm, setSettingUpForm] = useState(false);
  const [formSetupResult, setFormSetupResult] = useState<FormSetupResult | null>(null);

  // Fix entry IDs
  const [fixingEntryIds, setFixingEntryIds] = useState(false);
  const [fixEntryResult, setFixEntryResult] = useState<FixEntryResult | null>(null);

  // Sync
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Instructions collapse
  const [showInstructions, setShowInstructions] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  // Compute redirect URI + JS origin on mount (client-side only)
  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/google/callback`);
    setJsOrigin(window.location.origin);
  }, []);

  // Check OAuth callback status from URL
  useEffect(() => {
    const s = searchParams.get("status");
    const r = searchParams.get("reason");
    if (s === "success") showToast("success", "Google Account berhasil dihubungkan!");
    if (s === "error")   showToast("error",   `Koneksi gagal: ${r || "unknown"}`);
    if (s) router.replace("/google-integration");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch status + integration info
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, integrationRes] = await Promise.all([
        fetch("/api/google/status"),
        fetch("/api/google/integration"),
      ]);

      let s: GoogleStatus = { hasCredentials: false, configured: false, connected: false, tokenExpired: false };
      let i: IntegrationInfo = {};
      try { const t = await statusRes.text();      s = t ? JSON.parse(t) : s; } catch { /* ignore */ }
      try { const t = await integrationRes.text(); i = t ? JSON.parse(t) : i; } catch { /* ignore */ }

      setStatus(s);
      setIntegration(i);

      // Pre-fill client ID from integration
      if (i.clientId) setClientId(i.clientId);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Copy helpers
  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch { /* ignore */ }
  }
  async function copyJsOrigin() {
    try {
      await navigator.clipboard.writeText(jsOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    } catch { /* ignore */ }
  }

  // Client ID validation
  const clientIdHint = clientId.trim() && !clientId.trim().endsWith(".apps.googleusercontent.com")
    ? "Format Client ID biasanya berakhiran .apps.googleusercontent.com"
    : "";

  // Save credentials
  async function handleSaveCreds() {
    if (!clientId.trim()) {
      showToast("error", "Client ID tidak boleh kosong");
      return;
    }
    setSavingCreds(true); setSavedCreds(false);
    try {
      const res = await fetch("/api/google/integration", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      let j: { ok?: boolean; error?: string } = {};
      try { const t = await res.text(); j = t ? JSON.parse(t) : j; } catch { /* ignore */ }
      if (j.ok) {
        setSavedCreds(true);
        setClientSecret("");
        setTimeout(() => setSavedCreds(false), 3000);
        showToast("success", "Credentials berhasil disimpan");
        fetchAll();
      } else {
        showToast("error", j.error || "Gagal menyimpan credentials");
      }
    } catch {
      showToast("error", "Network error saat menyimpan credentials");
    } finally {
      setSavingCreds(false);
    }
  }

  // Connect Google
  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/google/auth");
      let j: { url?: string; error?: string } = {};
      try { const t = await res.text(); j = t ? JSON.parse(t) : j; } catch { /* ignore */ }
      if (j.url) {
        window.location.href = j.url;
      } else {
        showToast("error", j.error || "Gagal mendapatkan OAuth URL");
        setConnecting(false);
      }
    } catch {
      showToast("error", "Gagal terhubung ke server");
      setConnecting(false);
    }
  }

  // Disconnect
  async function handleDisconnect() {
    if (!confirm("Putuskan koneksi Google? Token akan dihapus (credentials tetap tersimpan).")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/google/disconnect", { method: "DELETE" });
      showToast("success", "Google Account berhasil diputus");
      fetchAll();
    } catch {
      showToast("error", "Gagal disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  // Auto-create Google Form
  async function handleSetupForm() {
    setSettingUpForm(true); setFormSetupResult(null);
    try {
      const res = await fetch("/api/google/form/setup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ formTitle }),
      });
      let j: FormSetupResult = { ok: false };
      try { const t = await res.text(); j = t ? JSON.parse(t) : j; } catch { /* ignore */ }
      setFormSetupResult(j);
      if (j.ok) {
        showToast("success", "Google Form berhasil dibuat!");
        fetchAll();
      } else {
        showToast("error", j.error || "Gagal membuat form");
      }
    } catch {
      showToast("error", "Network error saat membuat form");
      setFormSetupResult({ ok: false, error: "Network error" });
    } finally {
      setSettingUpForm(false);
    }
  }

  // Fix entry IDs (derive from stored questionIds)
  async function handleFixEntryIds() {
    setFixingEntryIds(true); setFixEntryResult(null);
    try {
      const res = await fetch("/api/google/form/fix-entry-ids", { method: "POST" });
      let j: FixEntryResult = { ok: false };
      try { const t = await res.text(); j = t ? JSON.parse(t) : j; } catch { /* ignore */ }
      setFixEntryResult(j);
      if (j.ok) {
        showToast("success", "Entry IDs berhasil diperbaiki — prefilled link akan berfungsi");
        fetchAll();
      } else {
        showToast("error", j.error || "Gagal fix entry IDs");
      }
    } catch {
      showToast("error", "Network error");
      setFixEntryResult({ ok: false, error: "Network error" });
    } finally {
      setFixingEntryIds(false);
    }
  }

  // Sync
  async function handleSync() {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      let j: SyncResult = { ok: false };
      try { const t = await res.text(); j = t ? JSON.parse(t) : j; } catch { /* ignore */ }
      setSyncResult(j);
      if (j.ok) fetchAll();
    } catch {
      setSyncResult({ ok: false, error: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  const isConnected = status?.connected ?? false;
  const hasForm     = !!(status?.googleFormId || status?.googleFormPublicId);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border transition-all ${
          toast.type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Google Integration</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hubungkan Google Account untuk auto-create form dan sync response video affiliate.
            </p>
          </div>
          {status && (
            <StatusChip
              status={status.status}
              hasCredentials={status.hasCredentials}
              connected={status.connected}
              tokenExpired={status.tokenExpired}
            />
          )}
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <>
            {/* ── A. Integration Setup Card (always visible) ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔐</span>
                  <div>
                    <h2 className="font-semibold text-gray-800">Google OAuth Credentials</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Masukkan Client ID dan Client Secret dari Google Cloud Console</p>
                  </div>
                </div>
                {integration?.hasSecret && (
                  <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                    ✓ Credentials Saved
                  </span>
                )}
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* URLs to copy into Google Cloud Console */}
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-indigo-700">
                    URL untuk dimasukkan ke Google Cloud Console
                  </p>

                  {/* JS Origins */}
                  <div>
                    <p className="text-[11px] text-indigo-600 mb-1 font-medium">
                      ① Authorized JavaScript origins
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={jsOrigin}
                        className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-mono text-indigo-800 focus:outline-none"
                      />
                      <button
                        onClick={copyJsOrigin}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                          copiedOrigin
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {copiedOrigin ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Redirect URI */}
                  <div>
                    <p className="text-[11px] text-indigo-600 mb-1 font-medium">
                      ② Authorized redirect URIs
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={redirectUri}
                        className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-mono text-indigo-800 focus:outline-none"
                      />
                      <button
                        onClick={copyRedirectUri}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                          copiedUri
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {copiedUri ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-indigo-400">
                    Copy kedua URL di atas saat mengisi OAuth Client ID di Google Cloud Console (lihat tutorial di bawah).
                  </p>
                </div>

                {/* Client ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxxxxxx.apps.googleusercontent.com"
                    className={`w-full px-3 py-2 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                      clientIdHint ? "border-amber-300 bg-amber-50/30" : "border-gray-200"
                    }`}
                  />
                  {clientIdHint && (
                    <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                      <span>⚠</span> {clientIdHint}
                    </p>
                  )}
                </div>

                {/* Client Secret */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Client Secret
                    {integration?.hasSecret && (
                      <span className="ml-2 text-green-600 font-normal">✓ tersimpan (kosongkan jika tidak ingin mengubah)</span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder={integration?.hasSecret ? "Biarkan kosong untuk tidak mengubah" : "GOCSPX-..."}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((p) => !p)}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      {showSecret ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveCreds}
                  disabled={savingCreds || !clientId.trim()}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    savedCreds
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {savingCreds ? "Menyimpan…" : savedCreds ? "✓ Tersimpan!" : "Simpan Credentials"}
                </button>

                {/* Setup instructions collapsible — full 10-step guide */}
                <div className="pt-1">
                  <button
                    onClick={() => setShowInstructions((p) => !p)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5"
                  >
                    <span className={`transition-transform ${showInstructions ? "rotate-90" : ""}`}>▶</span>
                    Tutorial: Cara Membuat Google OAuth Credentials (10 langkah)
                  </button>

                  {showInstructions && (
                    <div className="mt-3 border border-indigo-100 rounded-xl overflow-hidden">
                      {/* Tutorial header */}
                      <div className="px-4 py-3 bg-indigo-600 text-white">
                        <p className="text-xs font-semibold">📋 Panduan Lengkap Membuat OAuth 2.0 Client ID</p>
                        <p className="text-[11px] text-indigo-200 mt-0.5">Ikuti 10 langkah di bawah ini. Proses ±5 menit.</p>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {/* Step 1 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Buka Google Cloud Console</p>
                            <p className="text-[11px] text-gray-500">
                              Kunjungi{" "}
                              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium">
                                console.cloud.google.com
                              </a>{" "}
                              dan login menggunakan Google Account yang ingin dipakai.
                            </p>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Buat Project Baru</p>
                            <p className="text-[11px] text-gray-500">
                              Klik dropdown <strong>"Select a project"</strong> di pojok kiri atas → klik <strong>"NEW PROJECT"</strong> → isi nama project (contoh: <em>Asterixsty Affiliate</em>) → klik <strong>"CREATE"</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Aktifkan APIs yang Diperlukan</p>
                            <p className="text-[11px] text-gray-500">
                              Di sidebar kiri klik <strong>"APIs &amp; Services"</strong> → <strong>"Library"</strong>.
                              Cari dan aktifkan satu per satu:
                            </p>
                            <ul className="text-[11px] text-gray-600 space-y-0.5 mt-1">
                              <li className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded bg-green-100 text-green-700 flex items-center justify-center text-[9px]">✓</span>
                                <strong>Google Forms API</strong> → klik Enable
                              </li>
                              <li className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded bg-green-100 text-green-700 flex items-center justify-center text-[9px]">✓</span>
                                <strong>Google Drive API</strong> → klik Enable
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Buka OAuth Consent Screen</p>
                            <p className="text-[11px] text-gray-500">
                              Di sidebar klik <strong>"APIs &amp; Services"</strong> → <strong>"OAuth consent screen"</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Step 5 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Pilih User Type: External</p>
                            <p className="text-[11px] text-gray-500">
                              Pilih <strong>"External"</strong> → klik <strong>"CREATE"</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Step 6 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">6</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Isi Info Aplikasi</p>
                            <p className="text-[11px] text-gray-500">Isi field-field berikut lalu klik <strong>"SAVE AND CONTINUE"</strong> (skip bagian Scopes dan Test Users):</p>
                            <ul className="text-[11px] text-gray-600 space-y-0.5 mt-1">
                              <li>• <strong>App name</strong>: Asterixsty Affiliate System</li>
                              <li>• <strong>User support email</strong>: email kamu</li>
                              <li>• <strong>Developer contact email</strong>: email kamu</li>
                            </ul>
                          </div>
                        </div>

                        {/* Step 7 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">7</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Buat OAuth Client ID</p>
                            <p className="text-[11px] text-gray-500">
                              Di sidebar klik <strong>"Credentials"</strong> → klik tombol <strong>"CREATE CREDENTIALS"</strong> (atas halaman) → pilih <strong>"OAuth client ID"</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Step 8 */}
                        <div className="px-4 py-3 flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">8</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Pilih Application Type: Web application</p>
                            <p className="text-[11px] text-gray-500">
                              Pada dropdown <strong>"Application type"</strong> pilih <strong>"Web application"</strong> → isi <strong>Name</strong> (contoh: <em>Asterixsty Web</em>).
                            </p>
                          </div>
                        </div>

                        {/* Step 9 */}
                        <div className="px-4 py-3 flex gap-3 bg-amber-50/60">
                          <span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">9</span>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-800">⭐ Tambahkan URLs (Penting!)</p>
                            <div className="space-y-1.5">
                              <div className="p-2 bg-white border border-amber-200 rounded-lg">
                                <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Authorized JavaScript origins → ADD URI:</p>
                                <p className="text-[11px] font-mono text-gray-700">{jsOrigin || "http://localhost:3000"}</p>
                              </div>
                              <div className="p-2 bg-white border border-amber-200 rounded-lg">
                                <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Authorized redirect URIs → ADD URI:</p>
                                <p className="text-[11px] font-mono text-gray-700">{redirectUri || "http://localhost:3000/api/google/callback"}</p>
                              </div>
                            </div>
                            <p className="text-[11px] text-amber-700">
                              💡 Gunakan tombol <strong>Copy</strong> di boks biru di atas agar tidak salah ketik. Klik <strong>"CREATE"</strong> setelah selesai.
                            </p>
                          </div>
                        </div>

                        {/* Step 10 */}
                        <div className="px-4 py-3 flex gap-3 bg-green-50/50">
                          <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">10</span>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-800">Copy Client ID &amp; Secret → Paste di atas</p>
                            <p className="text-[11px] text-gray-500">
                              Setelah klik "CREATE", Google akan menampilkan <strong>Your Client ID</strong> dan <strong>Your Client Secret</strong>.
                              Copy keduanya dan paste ke field di atas, lalu klik <strong>"Simpan Credentials"</strong>.
                            </p>
                            <p className="text-[11px] text-green-600 font-medium">
                              ✓ Setelah disimpan, klik "Connect Google Account" untuk login OAuth.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <p className="text-[11px] text-gray-500">
                          ℹ️ Jika aplikasi masih dalam status "Testing", tambahkan email Google kamu sebagai <strong>Test User</strong> di OAuth Consent Screen sebelum login.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── B. Connection Status Card ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                <span className="text-lg">👤</span>
                <h2 className="font-semibold text-gray-800">Google Account</h2>
              </div>
              <div className="px-6 py-5">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(status?.connectedEmail || status?.email || "G")[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{status?.connectedEmail || status?.email}</p>
                        <p className="text-xs text-gray-400">Terhubung sejak {fmt(status?.connectedAt)}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {disconnecting ? "Memutus…" : "Putuskan Koneksi"}
                    </button>
                  </div>
                ) : (status?.tokenExpired || status?.status === "expired") ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      Token untuk <span className="font-medium">{status?.connectedEmail || status?.email}</span> sudah expired.
                    </p>
                    <button
                      onClick={handleConnect}
                      disabled={connecting || !status?.hasCredentials}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {connecting ? "Mengarahkan ke Google…" : "Reconnect Google"}
                    </button>
                  </div>
                ) : !status?.hasCredentials ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Simpan credentials terlebih dahulu di bagian atas.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Credentials tersimpan. Klik tombol di bawah untuk login ke Google.
                    </p>
                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      {connecting ? "Mengarahkan ke Google…" : "Connect Google Account"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── C. Google Form Setup Card (only when connected) ── */}
            {isConnected && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                  <span className="text-lg">📝</span>
                  <div>
                    <h2 className="font-semibold text-gray-800">Master Google Form</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Auto-create via Google Forms API</p>
                  </div>
                </div>
                <div className="px-6 py-5 space-y-4">
                  {hasForm ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 border border-green-100 rounded-xl space-y-2">
                        <p className="text-sm font-semibold text-green-800">✓ Form Aktif: {status?.googleFormTitle || "Asterixsty Video Submission"}</p>
                        {status?.googleFormPublicId && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-green-700 font-mono break-all flex-1">
                              https://docs.google.com/forms/d/e/{status.googleFormPublicId}/viewform
                            </p>
                            <a
                              href={`https://docs.google.com/forms/d/e/${status.googleFormPublicId}/viewform`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-2.5 py-1 bg-green-700 text-white rounded-lg hover:bg-green-800 shrink-0"
                            >
                              Buka Form
                            </a>
                          </div>
                        )}
                        {status?.googleFormId && (
                          <p className="text-[11px] text-green-600">Form ID (editing): {status.googleFormId}</p>
                        )}
                      </div>

                      {/* Entry IDs summary + fix button */}
                      <div className="p-3 bg-gray-50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600">
                            Entry IDs — prefilled link parameters
                          </p>
                          <button
                            onClick={handleFixEntryIds}
                            disabled={fixingEntryIds}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-white hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {fixingEntryIds
                              ? <><span className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin" />Fixing…</>
                              : "🔧 Fix Entry IDs"}
                          </button>
                        </div>

                        {status?.entryIds && Object.keys(status.entryIds).length > 0 ? (
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(status.entryIds).map(([k, v]) => (
                              <div key={k} className="flex gap-1.5 text-[11px]">
                                <span className="text-gray-400 shrink-0 w-20">{k}:</span>
                                <span className="font-mono text-gray-700">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <span className="text-amber-600 text-sm">⚠</span>
                            <p className="text-[11px] text-amber-700">
                              Entry IDs kosong — prefilled link tidak akan bekerja. Klik <strong>Fix Entry IDs</strong> untuk memperbaiki.
                            </p>
                          </div>
                        )}

                        {fixEntryResult && (
                          <div className={`p-2 rounded-lg text-[11px] ${fixEntryResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {fixEntryResult.ok
                              ? `✓ ${fixEntryResult.message}`
                              : `✕ ${fixEntryResult.error}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500">
                        Belum ada Google Form. Klik tombol di bawah untuk auto-create form dengan semua field yang diperlukan.
                      </p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Judul Form</label>
                        <input
                          type="text"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSetupForm}
                      disabled={settingUpForm}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {settingUpForm && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {settingUpForm ? "Membuat Form…" : hasForm ? "🔄 Buat Ulang Form" : "⚙️ Auto-Create Google Form"}
                    </button>
                    {hasForm && (
                      <span className="text-xs text-amber-600">Buat ulang akan mengganti form lama</span>
                    )}
                  </div>

                  {formSetupResult && (
                    <div className={`p-4 rounded-xl text-sm ${
                      formSetupResult.ok
                        ? "bg-green-50 border border-green-100 text-green-800"
                        : "bg-red-50 border border-red-100 text-red-800"
                    }`}>
                      {formSetupResult.ok ? (
                        <div className="space-y-1">
                          <p className="font-semibold">Form berhasil dibuat!</p>
                          {formSetupResult.previewLink && (
                            <a href={formSetupResult.previewLink} target="_blank" rel="noreferrer"
                               className="text-xs text-green-700 underline">
                              Buka form
                            </a>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold">Gagal membuat form</p>
                          <p className="text-xs mt-1">{formSetupResult.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── D. Sync Card (only when connected + form set) ── */}
            {isConnected && hasForm && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                  <span className="text-lg">🔄</span>
                  <div>
                    <h2 className="font-semibold text-gray-800">Sync Submissions</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Auto-sync setiap 2 menit · Forms API → Dashboard</p>
                  </div>
                </div>
                <div className="px-6 py-5 space-y-4">
                  {/* Auto-sync status banner */}
                  <div className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-100 rounded-xl">
                    <span className="text-green-500 text-base shrink-0">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-green-800">Auto-Sync Aktif</p>
                      <p className="text-[11px] text-green-600 mt-0.5">
                        Sistem otomatis baca Google Form response setiap 2 menit.
                        Halaman Kirim Sample akan update sendiri tanpa perlu refresh.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm text-gray-700">
                        Last sync: <span className="font-medium">{fmt(status?.lastSyncAt)}</span>
                      </p>
                      <p className="text-[11px] text-gray-400">Gunakan tombol ini jika ingin sync manual sekarang</p>
                    </div>
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {syncing && <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
                      {syncing ? "Syncing…" : "🔄 Sync Manual"}
                    </button>
                  </div>

                  {syncResult && (
                    <div className={`p-4 rounded-xl text-sm ${
                      syncResult.ok
                        ? "bg-green-50 border border-green-100 text-green-800"
                        : "bg-red-50 border border-red-100 text-red-800"
                    }`}>
                      {syncResult.ok ? (
                        <div className="space-y-2">
                          <p className="font-semibold">Sync Berhasil</p>
                          <div className="flex gap-4 text-xs">
                            <span>✅ Berhasil sync: <strong>{syncResult.synced}</strong></span>
                            <span>⏭ Dilewati: <strong>{syncResult.skipped}</strong></span>
                          </div>
                          {(syncResult.errors?.length ?? 0) > 0 && (
                            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-xs font-semibold text-amber-700 mb-1">
                                ⚠ {syncResult.errors?.length} response tidak dapat diproses:
                              </p>
                              <ul className="text-[11px] text-amber-700 space-y-1">
                                {syncResult.errors?.map((e, i) => (
                                  <li key={i} className="flex gap-1">
                                    <span className="shrink-0">•</span>
                                    <span>{e}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(syncResult.skipped ?? 0) > 0 && (syncResult.errors?.length ?? 0) === 0 && (
                            <p className="text-xs text-green-600">
                              {syncResult.skipped ?? 0} response dilewati (sudah ada di database / duplikat).
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold">Sync Gagal</p>
                          <p className="text-xs mt-1">{syncResult.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1.5">
                    <p className="font-medium text-gray-600">Cara kerja auto-sync:</p>
                    <ol className="space-y-1 list-none">
                      {["Affiliate submit Google Form", "Server baca response via Forms API tiap 2 menit", "Matching berdasarkan Delivery ID (prefilled otomatis)", "Checklist video & progress diupdate di database", "Halaman Kirim Sample refresh otomatis (tanpa reload)"].map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-[11px] text-gray-400 pt-0.5">Response yang dilewati = sudah ada di database sebelumnya (idempoten).</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── How it works (when not connected) ── */}
            {!isConnected && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <p className="text-sm font-semibold text-blue-800 mb-3">Cara Kerja Sistem</p>
                <ol className="space-y-2 text-xs text-blue-700">
                  {[
                    "Simpan Google OAuth Credentials (Client ID + Secret)",
                    "Connect Google Account sekali via OAuth",
                    "Auto-create Master Google Form via Forms API",
                    "System generate prefilled link personal untuk setiap sample delivery",
                    "Link otomatis dikirim via WhatsApp ke affiliate",
                    "Affiliate isi Google Form (tidak perlu login)",
                    "Website sync via Forms API dan update checklist video",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Page wrapper with Suspense (required for useSearchParams) ─────────────────
export default function GoogleIntegrationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <GoogleIntegrationInner />
    </Suspense>
  );
}
