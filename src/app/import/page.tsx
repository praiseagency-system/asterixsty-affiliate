"use client";

import { useState } from "react";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

type Step = { label: string; done: boolean; active: boolean };

const TIKTOK_HEADERS: Record<string, string> = {
  // English column names (TikTok Affiliate Center - Creator Performance)
  "creator username": "Creator username",
  "affiliate gmv": "Affiliate GMV",
  "affiliate live gmv": "Affiliate LIVE GMV",
  "affiliate shoppable video gmv": "Affiliate shoppable video GMV",
  "affiliate product card gmv": "Affiliate product card GMV",
  "affiliate products sold": "Affiliate products sold",
  "items sold": "Items sold",
  "est. commission": "Est. commission",
  "est. flat fee": "Est. flat fee",
  "avg. order value": "Avg. order value",
  "affiliate orders": "Affiliate orders",
  "ctr": "CTR",
  "product impressions": "Product impressions",
  "affiliate live streams": "Affiliate LIVE streams",
  "affiliate shoppable videos": "Affiliate shoppable videos",
  "open collaboration gmv": "Open collaboration GMV",
  "affiliate refunded gmv": "Affiliate refunded GMV",
  "affiliate items refunded": "Affiliate items refunded",
  "affiliate followers": "Affiliate followers",
  // Indonesian column names (Transaction Analysis Creator List)
  "creator name": "Creator username",
  "gmv dari kreator": "Affiliate GMV",
  "pengembalian dana": "Affiliate refunded GMV",
  "pesanan teratribusi": "Affiliate orders",
  "produk yang terjual dari kreator": "Items sold",
  "produk yang dikembalikan dananya": "Affiliate items refunded",
  "aov": "Avg. order value",
  "video": "Affiliate shoppable videos",
  "siaran live": "Affiliate LIVE streams",
  "perkiraan komisi": "Est. commission",
};

const WEEK_DAY: Record<string, number> = { "1": 1, "2": 8, "3": 15, "4": 22 };
const WEEK_LABEL: Record<string, string> = {
  "1": "Minggu 1 (Tgl 1–7)",
  "2": "Minggu 2 (Tgl 8–14)",
  "3": "Minggu 3 (Tgl 15–21)",
  "4": "Minggu 4 (Tgl 22–31)",
};

function normalizeNum(val: string): number {
  if (!val || val === "--" || val === "") return 0;
  const cleaned = val.replace(/[Rp$\s%,]/g, "").replace(/\./g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; continue; }
      if (line[i] === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += line[i];
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""])) as Record<string, string>;
  });
}

async function parseXLSX(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: "" });
  return data.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
  );
}

function normalizeRows(rows: Record<string, string>[]): Record<string, string | number>[] {
  return rows.map((r) => {
    const normalized: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r)) {
      const mapped = TIKTOK_HEADERS[k.toLowerCase().trim()];
      if (mapped) normalized[mapped] = normalizeNum(v) || v;
      else normalized[k] = v;
    }
    return normalized;
  }).filter((r) => {
    const u = String(r["Creator username"] || "").trim().toLowerCase();
    return u && u !== "creator username" && u !== "total";
  });
}

function ImportPage() {
  const [type, setType] = useState<"mingguan" | "bulanan">("bulanan");
  // Bulanan
  const [periode, setPeriode] = useState("");
  // Mingguan
  const [bulan, setBulan] = useState("");
  const [minggu, setMinggu] = useState("1");

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [pendingRows, setPendingRows] = useState<Record<string, string | number>[] | null>(null);
  const [preview, setPreview] = useState<{ total: number; sample: string[] } | null>(null);

  function makeSteps(active: number): Step[] {
    const labels = ["Membaca data", "Cek existing", "Import ke database", "Selesai"];
    return labels.map((label, i) => ({ label, done: i < active, active: i === active }));
  }

  function getPeriodeIso(): string | null {
    if (type === "mingguan") {
      if (!bulan || !minggu) return null;
      const day = String(WEEK_DAY[minggu]).padStart(2, "0");
      return new Date(`${bulan}-${day}`).toISOString();
    }
    if (!periode) return null;
    return new Date(`${periode}-01`).toISOString();
  }

  function getPeriodeLabel(): string {
    if (type === "mingguan") {
      if (!bulan) return "";
      const d = new Date(`${bulan}-01`);
      const bLabel = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      return `${WEEK_LABEL[minggu]} — ${bLabel}`;
    }
    if (!periode) return "";
    return new Date(`${periode}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }

  async function checkExisting(periodeIso: string) {
    const res = await fetch(`/api/import?type=${type}&periode=${encodeURIComponent(periodeIso)}`);
    const json = await res.json();
    return (json.count as number) ?? 0;
  }

  async function readData(): Promise<Record<string, string | number>[]> {
    if (!file) return [];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    let raw: Record<string, string>[] = [];
    if (ext === "xlsx" || ext === "xls") {
      raw = await parseXLSX(file);
    } else if (ext === "csv") {
      raw = parseCSV(await file.text());
    } else {
      // TSV / TXT
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length >= 2) {
        const headers = lines[0].split("\t").map((h) => h.trim().replace(/^"|"$/g, ""));
        raw = lines.slice(1).map((line) => {
          const vals = line.split("\t").map((v) => v.trim().replace(/^"|"$/g, ""));
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
        });
      }
    }
    return normalizeRows(raw);
  }

  async function handleImport(mode: "replace" | "merge" = "replace") {
    const periodeIso = getPeriodeIso();
    if (!file || !periodeIso) {
      setStatus("⚠️ Pilih file dan lengkapi periode terlebih dahulu");
      return;
    }

    setLoading(true);
    setStatus(null);
    setExistingCount(null);
    setPendingRows(null);
    setPreview(null);

    try {
      setSteps(makeSteps(0));
      setProgress(15);
      const rows = await readData();
      if (rows.length === 0) {
        setStatus("❌ Tidak ada data valid. Pastikan format sesuai export TikTok Affiliate Center.");
        setSteps([]);
        setLoading(false);
        return;
      }

      setPreview({
        total: rows.length,
        sample: rows.slice(0, 3).map((r) => String(r["Creator username"] || "")),
      });
      setProgress(35);

      setSteps(makeSteps(1));
      const existing = await checkExisting(periodeIso);
      setProgress(55);

      if (existing > 0 && mode === "replace" && !pendingRows) {
        setExistingCount(existing);
        setPendingRows(rows);
        setSteps([]);
        setLoading(false);
        return;
      }

      setSteps(makeSteps(2));
      setProgress(75);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, periode: periodeIso, rows, mode }),
      });

      setProgress(95);
      const json = await res.json();
      setSteps(makeSteps(3));
      setProgress(100);

      if (res.ok) {
        const label = getPeriodeLabel();
        const note = json.deleted > 0 ? ` (${json.deleted} data lama dihapus)` : "";
        setStatus(`✅ Berhasil import ${json.imported} creator — ${label}${note}`);
      } else {
        setStatus(`❌ Error: ${json.error}`);
      }
    } catch (err) {
      setStatus(`❌ Gagal: ${err}`);
    }

    setLoading(false);
  }

  async function handleConfirm(mode: "replace" | "merge") {
    if (!pendingRows) return;
    const periodeIso = getPeriodeIso();
    if (!periodeIso) return;
    setLoading(true);
    setExistingCount(null);

    try {
      setSteps(makeSteps(2));
      setProgress(75);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, periode: periodeIso, rows: pendingRows, mode }),
      });
      setProgress(95);
      const json = await res.json();
      setSteps(makeSteps(3));
      setProgress(100);

      if (res.ok) {
        const label = getPeriodeLabel();
        const note = json.deleted > 0 ? ` (${json.deleted} data lama diganti)` : "";
        setStatus(`✅ Berhasil ${mode === "replace" ? "ganti" : "gabung"} ${json.imported} creator — ${label}${note}`);
      } else {
        setStatus(`❌ Error: ${json.error}`);
      }
    } catch (err) {
      setStatus(`❌ Gagal: ${err}`);
    }

    setPendingRows(null);
    setLoading(false);
  }

  function reset() {
    setFile(null); setStatus(null);
    setExistingCount(null); setPendingRows(null); setPreview(null); setSteps([]);
  }

  const periodeOk = type === "mingguan" ? !!(bulan && minggu) : !!periode;
  const canImport = !loading && !!file && periodeOk;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload export data dari TikTok Affiliate Center</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Tipe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipe Data</label>
          <div className="flex gap-3">
            {(["mingguan", "bulanan"] as const).map((t) => (
              <button key={t} onClick={() => { setType(t); reset(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${type === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
                {t === "mingguan" ? "📅 Data Mingguan" : "📆 Data Bulanan"}
              </button>
            ))}
          </div>
        </div>

        {/* Periode — Bulanan */}
        {type === "bulanan" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Periode Bulan</label>
            <input type="month" value={periode}
              onChange={(e) => { setPeriode(e.target.value); reset(); setFile(file); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
        )}

        {/* Periode — Mingguan */}
        {type === "mingguan" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bulan</label>
              <input type="month" value={bulan}
                onChange={(e) => { setBulan(e.target.value); reset(); setFile(file); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minggu</label>
              <div className="grid grid-cols-4 gap-2">
                {(["1","2","3","4"] as const).map((w) => (
                  <button key={w} onClick={() => setMinggu(w)}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors text-center ${
                      minggu === w ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                    }`}>
                    <div className="font-semibold">Minggu {w}</div>
                    <div className="text-xs opacity-70">
                      {w === "1" ? "Tgl 1–7" : w === "2" ? "Tgl 8–14" : w === "3" ? "Tgl 15–21" : "Tgl 22–31"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">File Data</label>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
            {file ? (
              <div>
                <p className="text-sm font-medium text-indigo-700">📄 {file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button onClick={() => setFile(null)} className="text-xs text-red-500 mt-2 hover:underline">Hapus</button>
              </div>
            ) : (
              <div>
                <p className="text-3xl mb-2">📥</p>
                <p className="text-sm text-gray-500">Drag & drop, atau</p>
                <label className="mt-2 inline-block cursor-pointer text-sm text-indigo-600 hover:underline font-medium">
                  Pilih File
                  <input type="file" accept=".txt,.tsv,.csv,.xlsx,.xls" className="hidden"
                    onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
                </label>
                <p className="text-xs text-gray-400 mt-2">Format: XLSX, CSV, TSV dari TikTok Affiliate Center</p>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-700">✅ {preview.total} creator terdeteksi</p>
            {preview.sample.length > 0 && (
              <p className="text-xs text-green-600 mt-1">
                Contoh: {preview.sample.map((u) => `@${u}`).join(", ")}
                {preview.total > 3 && ` +${preview.total - 3} lainnya`}
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        {steps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    s.done ? "bg-green-500 text-white" : s.active ? "bg-indigo-600 text-white animate-pulse" : "bg-gray-200 text-gray-400"
                  }`}>{s.done ? "✓" : i + 1}</div>
                  <span className={`text-xs ${s.active ? "text-indigo-700 font-medium" : s.done ? "text-green-600" : "text-gray-400"}`}>{s.label}</span>
                  {i < steps.length - 1 && <div className="w-4 h-px bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Existing data warning */}
        {existingCount !== null && existingCount > 0 && pendingRows && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Data periode ini sudah ada</p>
            <p className="text-sm text-amber-700 mb-3">
              Terdapat <strong>{existingCount} record</strong> data {type} untuk periode ini.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => handleConfirm("replace")}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium">
                🔄 Ganti (hapus & import ulang)
              </button>
              <button onClick={() => handleConfirm("merge")}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
                ➕ Gabungkan
              </button>
              <button onClick={() => { setExistingCount(null); setPendingRows(null); setSteps([]); }}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
                Batal
              </button>
            </div>
          </div>
        )}

        {status && (
          <div className={`rounded-lg px-4 py-3 text-sm ${status.startsWith("✅") ? "bg-green-50 text-green-700" : status.startsWith("⚠️") ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
            {status}
          </div>
        )}

        {!pendingRows && (
          <button onClick={() => handleImport("replace")} disabled={!canImport}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? "Memproses..." : "Import Data"}
          </button>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
        <h3 className="font-semibold text-blue-800 mb-2">📖 Cara Export dari TikTok</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Buka TikTok Affiliate Center → Creator Performance</li>
          <li>Pilih rentang waktu (mingguan atau bulanan)</li>
          <li>Klik <strong>Export</strong> di pojok kanan atas</li>
          <li>Download file XLSX/CSV</li>
          <li>Upload file di form di atas</li>
        </ol>
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-600">
            <strong>Format yang didukung:</strong> XLSX (Excel), CSV, TSV dari TikTok Affiliate Center (bahasa Indonesia & Inggris)
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ImportPageGate() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_MONITORING}>
      <ImportPage />
    </PermissionGate>
  );
}
