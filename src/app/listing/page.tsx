"use client";

import { useEffect, useState, useCallback } from "react";
import { formatRupiah, formatNumber } from "@/lib/format";
import ConfirmModal from "@/components/ConfirmModal";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";
import { VISUAL_TAKE } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ListingItem {
  id: number;
  usernameTiktok: string;
  linkTiktok: string;
  followers: number;
  mediaPromosiFocus: string;
  kategoriAffiliate: string;
  gmvPer30Hari: number;
  qtyProdukTerjual: number;
  rataRataViews: number;
  kejelasanGambar: string;
  visualisasiProduk: string;
  audioSuara: string;
  jenisVisualTake: string;
  qtyVideoPerProduk: number;
  skorGmv: number;
  skorQtyTerjual: number;
  skorViews: number;
  skorKualitas: number;
  overallResult: number;
  worthIt: string;
  sampleDecision: string;
  approvalSample: boolean;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const KUALITAS = ["Sangat Bagus", "Bagus", "Kurang"];
const MEDIA    = ["Vidio", "Live", "Live & Vidio"];
// VISUAL_TAKE imported from @/lib/constants — shared with Database Affiliate

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

// ─── Small UI helpers ─────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-full">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-2 mb-0.5">{children}</p>
      <div className="border-b border-gray-100" />
    </div>
  );
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-bold w-8 tabular-nums ${score >= 8 ? "text-green-600" : score >= 6 ? "text-yellow-600" : "text-red-500"}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function WorthItBadge({ value }: { value: string }) {
  const cfg: Record<string, { cls: string; icon: string }> = {
    "Worth It":       { cls: "bg-green-100 text-green-700 border-green-200",  icon: "🟢" },
    "Pertimbangkan":  { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "🟡" },
    "Tidak Worth It": { cls: "bg-red-100 text-red-600 border-red-200",         icon: "🔴" },
  };
  const { cls, icon } = cfg[value] ?? { cls: "bg-gray-100 text-gray-500 border-gray-200", icon: "⚪" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      {icon} {value || "—"}
    </span>
  );
}

function SampleBadge({ value }: { value: string }) {
  const cfg: Record<string, { cls: string; icon: string }> = {
    "Layak Sample 2": { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "⭐" },
    "Layak Sample 1": { cls: "bg-green-100 text-green-700 border-green-200",       icon: "✅" },
    "Tidak Layak":    { cls: "bg-red-100 text-red-600 border-red-200",             icon: "❌" },
  };
  const { cls, icon } = cfg[value] ?? { cls: "bg-gray-100 text-gray-500 border-gray-200", icon: "—" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      {icon} {value || "—"}
    </span>
  );
}

// ─── Approval Toggle ──────────────────────────────────────────────────────────
function ApprovalToggle({ id, approved, onChange }: { id: number; approved: boolean; onChange: (id: number, val: boolean) => void }) {
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = !approved;
    await fetch("/api/listing/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approvalSample: next }),
    });
    onChange(id, next);
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={approved ? "Batalkan approval" : "Approve sample"}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 ${
        approved ? "bg-green-500" : "bg-gray-200"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${approved ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// ─── Score Detail Tooltip ─────────────────────────────────────────────────────
function ScoreDetail({ item }: { item: ListingItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-indigo-600 ml-1 text-xs" title="Lihat detail skor">ⓘ</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 w-52 bg-white rounded-xl shadow-lg border border-gray-100 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-gray-700 mb-2">Breakdown Skor</p>
            {[
              { label: "GMV Score",     val: item.skorGmv,      weight: "45%" },
              { label: "Qty Score",     val: item.skorQtyTerjual || 0, weight: "25%" },
              { label: "Views Score",   val: item.skorViews,    weight: "10%" },
              { label: "Quality Score", val: +item.skorKualitas.toFixed(2), weight: "20%" },
            ].map(({ label, val, weight }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-gray-500">{label} <span className="opacity-50">({weight})</span></span>
                <span className="font-semibold text-gray-800">{val}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-1.5 flex justify-between font-bold text-gray-900">
              <span>Overall</span>
              <span className={item.overallResult >= 8 ? "text-green-600" : item.overallResult >= 6 ? "text-yellow-600" : "text-red-500"}>
                {item.overallResult.toFixed(1)} / 10
              </span>
            </div>
            <div className="pt-1 space-y-0.5 text-gray-500 border-t border-gray-100">
              <div className="flex justify-between"><span>Visual</span><span>{item.kejelasanGambar || "—"}</span></div>
              <div className="flex justify-between"><span>Describe</span><span>{item.visualisasiProduk || "—"}</span></div>
              <div className="flex justify-between"><span>Audio</span><span>{item.audioSuara || "—"}</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Listing Form ─────────────────────────────────────────────────────────────
function ListingForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    usernameTiktok: "", followers: "", mediaPromosiFocus: "Vidio",
    kategoriAffiliate: "", gmvPer30Hari: "", qtyProdukTerjual: "", rataRataViews: "",
    kejelasanGambar: "", visualisasiProduk: "", audioSuara: "",
    jenisVisualTake: "", qtyVideoPerProduk: "",
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ overallResult: number; worthIt: string; sampleDecision: string } | null>(null);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); setPreview(null); }

  // Auto-generate link preview
  const tiktokLink = form.usernameTiktok
    ? `https://www.tiktok.com/@${form.usernameTiktok.replace(/^@/, "")}`
    : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        followers:        Number(form.followers) || 0,
        gmvPer30Hari:     Number(form.gmvPer30Hari) || 0,
        qtyProdukTerjual: Number(form.qtyProdukTerjual) || 0,
        rataRataViews:    Number(form.rataRataViews) || 0,
        qtyVideoPerProduk: Number(form.qtyVideoPerProduk) || 0,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      setPreview({ overallResult: json.overallResult, worthIt: json.worthIt, sampleDecision: json.sampleDecision });
      setTimeout(() => { onSuccess(); }, 800);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Form header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-indigo-50 to-white">
        <div>
          <h2 className="font-bold text-gray-900">🔍 Creator Qualification Form</h2>
          <p className="text-xs text-gray-400 mt-0.5">Isi data creator — sistem akan otomatis scoring & recommendation</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100">✕</button>
      </div>

      <form onSubmit={submit} className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

          {/* Basic Data */}
          <SectionLabel>📋 Basic Data</SectionLabel>

          <Field label="Username TikTok" required>
            <input required className={inputCls} placeholder="@username"
              value={form.usernameTiktok}
              onChange={(e) => set("usernameTiktok", e.target.value)} />
            {tiktokLink && (
              <a href={tiktokLink} target="_blank" rel="noreferrer"
                className="text-xs text-indigo-500 hover:underline mt-1 block truncate">
                🔗 {tiktokLink}
              </a>
            )}
          </Field>

          <Field label="Followers">
            <input type="number" min={0} className={inputCls} placeholder="12500"
              value={form.followers} onChange={(e) => set("followers", e.target.value)} />
          </Field>

          <Field label="Media Promosi Focus">
            <select className={inputCls} value={form.mediaPromosiFocus} onChange={(e) => set("mediaPromosiFocus", e.target.value)}>
              {MEDIA.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>

          <Field label="Kategori Affiliate">
            <input className={inputCls} placeholder="Beauty, Fashion, dll"
              value={form.kategoriAffiliate} onChange={(e) => set("kategoriAffiliate", e.target.value)} />
          </Field>

          {/* Performance Data */}
          <SectionLabel>📊 Performance Data</SectionLabel>

          <Field label="GMV 30 Hari (Rp)" required>
            <input required type="number" min={0} className={inputCls} placeholder="5000000"
              value={form.gmvPer30Hari} onChange={(e) => set("gmvPer30Hari", e.target.value)} />
            {form.gmvPer30Hari && (
              <p className="text-xs text-gray-400 mt-0.5">{formatRupiah(Number(form.gmvPer30Hari))}</p>
            )}
          </Field>

          <Field label="Qty Produk Terjual" required>
            <input required type="number" min={0} className={inputCls} placeholder="50"
              value={form.qtyProdukTerjual} onChange={(e) => set("qtyProdukTerjual", e.target.value)} />
          </Field>

          <Field label="Rata-rata Views" required>
            <input required type="number" min={0} className={inputCls} placeholder="10000"
              value={form.rataRataViews} onChange={(e) => set("rataRataViews", e.target.value)} />
            {form.rataRataViews && (
              <p className="text-xs text-gray-400 mt-0.5">{formatNumber(Number(form.rataRataViews))} views</p>
            )}
          </Field>

          <Field label="Jenis Visual Take">
            <select className={inputCls} value={form.jenisVisualTake} onChange={(e) => set("jenisVisualTake", e.target.value)}>
              <option value="">— Pilih —</option>
              {VISUAL_TAKE.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>

          <Field label="Total Video Deliver">
            <input type="number" min={0} className={inputCls} placeholder="3"
              value={form.qtyVideoPerProduk} onChange={(e) => set("qtyVideoPerProduk", e.target.value)} />
          </Field>

          {/* Content Quality */}
          <SectionLabel>🎬 Content Quality</SectionLabel>

          <Field label="Kualitas Gambar / Visual">
            <select className={inputCls} value={form.kejelasanGambar} onChange={(e) => set("kejelasanGambar", e.target.value)}>
              <option value="">— Pilih —</option>
              {KUALITAS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-0.5">Bobot 35%</p>
          </Field>

          <Field label="Visualisasi / Describe Produk">
            <select className={inputCls} value={form.visualisasiProduk} onChange={(e) => set("visualisasiProduk", e.target.value)}>
              <option value="">— Pilih —</option>
              {KUALITAS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-0.5">Bobot 40%</p>
          </Field>

          <Field label="Audio / Suara">
            <select className={inputCls} value={form.audioSuara} onChange={(e) => set("audioSuara", e.target.value)}>
              <option value="">— Pilih —</option>
              {KUALITAS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-0.5">Bobot 25%</p>
          </Field>
        </div>

        {/* Preview result */}
        {preview && (
          <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-green-50 border border-indigo-100 p-4 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-500">Overall Score</p>
              <p className={`text-2xl font-bold ${preview.overallResult >= 8 ? "text-green-600" : preview.overallResult >= 6 ? "text-yellow-600" : "text-red-500"}`}>
                {preview.overallResult.toFixed(1)}
                <span className="text-sm text-gray-400 font-normal"> / 10</span>
              </p>
            </div>
            <div><WorthItBadge value={preview.worthIt} /></div>
            <div><SampleBadge value={preview.sampleDecision} /></div>
            <p className="text-xs text-green-600 font-medium ml-auto">✅ Tersimpan!</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "⏳ Menghitung & Menyimpan..." : "🚀 Qualify Creator"}
          </button>
          <button type="button" onClick={onCancel}
            className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Edit Listing Modal ───────────────────────────────────────────────────────
function EditListingModal({ item, onSuccess, onCancel }: { item: ListingItem; onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    usernameTiktok:    item.usernameTiktok,
    followers:         String(item.followers),
    mediaPromosiFocus: item.mediaPromosiFocus || "Vidio",
    kategoriAffiliate: item.kategoriAffiliate || "",
    gmvPer30Hari:      String(item.gmvPer30Hari),
    qtyProdukTerjual:  String(item.qtyProdukTerjual),
    rataRataViews:     String(item.rataRataViews),
    kejelasanGambar:   item.kejelasanGambar || "",
    visualisasiProduk: item.visualisasiProduk || "",
    audioSuara:        item.audioSuara || "",
    jenisVisualTake:   item.jenisVisualTake || "",
    qtyVideoPerProduk: String(item.qtyVideoPerProduk),
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/listing/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        followers:         Number(form.followers) || 0,
        gmvPer30Hari:      Number(form.gmvPer30Hari) || 0,
        qtyProdukTerjual:  Number(form.qtyProdukTerjual) || 0,
        rataRataViews:     Number(form.rataRataViews) || 0,
        qtyVideoPerProduk: Number(form.qtyVideoPerProduk) || 0,
      }),
    });
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Edit Creator — @{item.usernameTiktok}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Skor akan dihitung ulang otomatis setelah disimpan</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <SectionLabel>📋 Basic Data</SectionLabel>

            <Field label="Username TikTok" required>
              <input required className={inputCls} value={form.usernameTiktok}
                onChange={(e) => set("usernameTiktok", e.target.value)} />
            </Field>
            <Field label="Followers">
              <input type="number" min={0} className={inputCls} value={form.followers}
                onChange={(e) => set("followers", e.target.value)} />
            </Field>
            <Field label="Media Promosi Focus">
              <select className={inputCls} value={form.mediaPromosiFocus} onChange={(e) => set("mediaPromosiFocus", e.target.value)}>
                {MEDIA.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Kategori Affiliate">
              <input className={inputCls} value={form.kategoriAffiliate}
                onChange={(e) => set("kategoriAffiliate", e.target.value)} />
            </Field>

            <SectionLabel>📊 Performance Data</SectionLabel>

            <Field label="GMV 30 Hari (Rp)" required>
              <input required type="number" min={0} className={inputCls} value={form.gmvPer30Hari}
                onChange={(e) => set("gmvPer30Hari", e.target.value)} />
            </Field>
            <Field label="Qty Produk Terjual" required>
              <input required type="number" min={0} className={inputCls} value={form.qtyProdukTerjual}
                onChange={(e) => set("qtyProdukTerjual", e.target.value)} />
            </Field>
            <Field label="Rata-rata Views" required>
              <input required type="number" min={0} className={inputCls} value={form.rataRataViews}
                onChange={(e) => set("rataRataViews", e.target.value)} />
            </Field>
            <Field label="Jenis Visual Take">
              <select className={inputCls} value={form.jenisVisualTake} onChange={(e) => set("jenisVisualTake", e.target.value)}>
                <option value="">— Pilih —</option>
                {VISUAL_TAKE.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Total Video Deliver">
              <input type="number" min={0} className={inputCls} value={form.qtyVideoPerProduk}
                onChange={(e) => set("qtyVideoPerProduk", e.target.value)} />
            </Field>

            <SectionLabel>🎬 Content Quality</SectionLabel>

            <Field label="Kualitas Gambar / Visual">
              <select className={inputCls} value={form.kejelasanGambar} onChange={(e) => set("kejelasanGambar", e.target.value)}>
                <option value="">— Pilih —</option>
                {KUALITAS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Visualisasi / Describe Produk">
              <select className={inputCls} value={form.visualisasiProduk} onChange={(e) => set("visualisasiProduk", e.target.value)}>
                <option value="">— Pilih —</option>
                {KUALITAS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Audio / Suara">
              <select className={inputCls} value={form.audioSuara} onChange={(e) => set("audioSuara", e.target.value)}>
                <option value="">— Pilih —</option>
                {KUALITAS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex gap-3 pt-2 pb-4">
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "⏳ Menghitung Ulang & Menyimpan..." : "💾 Simpan Perubahan"}
            </button>
            <button type="button" onClick={onCancel}
              className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function ListingPage() {
  const [items, setItems] = useState<ListingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [worthFilter, setWorthFilter] = useState("");
  const [sampleFilter, setSampleFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [visualTakeFilter, setVisualTakeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ListingItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ updated: number } | null>(null);

  // Summary counts
  const [stats, setStats] = useState({ worthIt: 0, layak: 0, approved: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (search) params.set("search", search);
    if (worthFilter) params.set("worthIt", worthFilter);
    if (sampleFilter) params.set("sample", sampleFilter);
    if (approvalFilter) params.set("approval", approvalFilter);
    if (visualTakeFilter) params.set("visualTake", visualTakeFilter);
    const res = await fetch(`/api/listing?${params}`);
    const json = await res.json();
    setItems(json.items || []);
    setTotal(json.total || 0);
    setLoading(false);

    // Recompute stats from unfiltered (quick local calculation)
    const all: ListingItem[] = json.items || [];
    setStats({
      worthIt:  all.filter((r) => r.worthIt === "Worth It").length,
      layak:    all.filter((r) => r.sampleDecision?.startsWith("Layak")).length,
      approved: all.filter((r) => r.approvalSample).length,
    });
  }, [page, search, worthFilter, sampleFilter, approvalFilter, visualTakeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Optimistic approval toggle
  function handleApprovalChange(id: number, val: boolean) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, approvalSample: val } : it));
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/listing/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchData();
  }

  async function handleRecalculate() {
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await fetch("/api/listing/recalculate", { method: "POST" });
      const json = await res.json() as { updated?: number };
      setRecalcResult({ updated: json.updated ?? 0 });
      await fetchData();
    } finally {
      setRecalculating(false);
    }
  }

  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = worthFilter || sampleFilter || approvalFilter || search || visualTakeFilter;

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Scouting</h1>
          <p className="text-sm text-gray-500 mt-0.5">Qualification & Scoring Engine — evaluasi creator secara otomatis</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => window.open("/api/listing/export", "_blank")}
            className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            ⬇️ Export CSV
          </button>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            title="Hitung ulang semua skor berdasarkan threshold terkini"
            className="flex items-center gap-1.5 border border-amber-200 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors">
            {recalculating ? "⏳ Menghitung..." : "🔄 Recalculate Scores"}
          </button>
          {recalcResult && (
            <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-full">
              ✓ {recalcResult.updated} skor diperbarui
            </span>
          )}
          <button onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
            + Qualify Creator
          </button>
        </div>
      </div>

      {/* ── Quick Stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Creator",  val: total,        icon: "👥", cls: "text-gray-900" },
          { label: "Worth It",       val: stats.worthIt, icon: "🟢", cls: "text-green-600" },
          { label: "Layak Sample",   val: stats.layak,   icon: "📦", cls: "text-indigo-600" },
          { label: "Approved",       val: stats.approved,icon: "✅", cls: "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-xl font-bold ${s.cls}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Form ───────────────────────────────────────────────────────── */}
      {showForm && (
        <ListingForm
          onSuccess={() => { setShowForm(false); fetchData(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text" placeholder="Cari username..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48"
        />
        <select value={worthFilter} onChange={(e) => { setWorthFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Status</option>
          <option value="Worth It">🟢 Worth It</option>
          <option value="Pertimbangkan">🟡 Pertimbangkan</option>
          <option value="Tidak Worth It">🔴 Tidak Worth It</option>
        </select>
        <select value={sampleFilter} onChange={(e) => { setSampleFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Sample</option>
          <option value="Layak Sample 2">⭐ Layak Sample 2</option>
          <option value="Layak Sample 1">✅ Layak Sample 1</option>
          <option value="Tidak Layak">❌ Tidak Layak</option>
        </select>
        <select value={approvalFilter} onChange={(e) => { setApprovalFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Approval</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
        </select>
        <select value={visualTakeFilter} onChange={(e) => { setVisualTakeFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Visual Take</option>
          {VISUAL_TAKE.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setWorthFilter(""); setSampleFilter(""); setApprovalFilter(""); setVisualTakeFilter(""); setPage(1); }}
            className="text-xs text-red-500 hover:underline px-2">
            Reset Filter
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">{total} creator</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  { h: "No" },
                  { h: "Creator" },
                  { h: "Followers" },
                  { h: "Media Focus" },
                  { h: "GMV / 30 Hari" },
                  { h: "Qty Terjual" },
                  { h: "Avg Views" },
                  { h: "Overall Score" },
                  { h: "Status" },
                  { h: "Sample Decision" },
                  { h: "Approval Sample" },
                  { h: "Aksi" },
                ].map(({ h }) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">
                  <div className="text-3xl mb-2">⏳</div>
                  <p className="text-sm">Memuat data...</p>
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-gray-400">
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="font-semibold text-gray-700">Belum ada creator</p>
                  <p className="text-sm mt-1">Klik <strong>+ Qualify Creator</strong> untuk mulai scouting</p>
                </td></tr>
              ) : items.map((item, i) => (
                <tr key={item.id} className={`hover:bg-indigo-50/20 transition-colors ${item.approvalSample ? "bg-green-50/30" : ""}`}>
                  <td className="px-3 py-3 text-gray-400 text-xs">{(page - 1) * pageSize + i + 1}</td>

                  {/* Creator */}
                  <td className="px-3 py-3">
                    <div className="font-semibold text-indigo-700 whitespace-nowrap">@{item.usernameTiktok}</div>
                    {item.linkTiktok && (
                      <a href={item.linkTiktok} target="_blank" rel="noreferrer"
                        className="text-xs text-gray-400 hover:text-indigo-500 block truncate max-w-[140px]">
                        🔗 TikTok
                      </a>
                    )}
                    {item.jenisVisualTake && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        {item.jenisVisualTake}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{formatNumber(item.followers)}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{item.mediaPromosiFocus || "—"}</td>
                  <td className="px-3 py-3 font-medium whitespace-nowrap">{formatRupiah(item.gmvPer30Hari)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(item.qtyProdukTerjual)}</td>
                  <td className="px-3 py-3 text-gray-600">{formatNumber(item.rataRataViews)}</td>

                  {/* Score */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <ScoreBar score={item.overallResult} />
                      <ScoreDetail item={item} />
                    </div>
                  </td>

                  {/* Worth It */}
                  <td className="px-3 py-3"><WorthItBadge value={item.worthIt} /></td>

                  {/* Sample Decision */}
                  <td className="px-3 py-3"><SampleBadge value={item.sampleDecision} /></td>

                  {/* Approval */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ApprovalToggle id={item.id} approved={item.approvalSample} onChange={handleApprovalChange} />
                      <span className={`text-xs font-medium ${item.approvalSample ? "text-green-600" : "text-gray-400"}`}>
                        {item.approvalSample ? "Approved" : "Pending"}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditItem(item)} title="Edit"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 text-xs transition-colors">
                        ✏️
                      </button>
                      <button onClick={() => setDeleteId(item.id)} title="Hapus"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs transition-colors">
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{total} creator{hasFilters ? " (difilter)" : ""}</span>
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

      {/* ── Edit Modal ─── */}
      {editItem && (
        <EditListingModal
          item={editItem}
          onSuccess={() => { setEditItem(null); fetchData(); }}
          onCancel={() => setEditItem(null)}
        />
      )}

      {/* ── Delete Confirm ─── */}
      {deleteId && (
        <ConfirmModal
          title="Hapus Creator"
          message="Data creator ini akan dihapus dari daftar scouting. Data tersimpan di database namun tidak akan muncul lagi."
          confirmLabel="Hapus Creator"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

export default function ListingPageGate() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_AFFILIATE}>
      <ListingPage />
    </PermissionGate>
  );
}
