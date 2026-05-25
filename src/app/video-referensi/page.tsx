"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VideoItem {
  id: number;
  usernameTiktok: string;
  linkTiktok: string;
  linkVideo: string;
  videoPath: string;
  videoFilename: string;
  caption: string;
  hook: string;
  jenisVisualTake: string;
  mediaFocus: string;
  kategori: string;
  tags: string;
  tagsParsed: string[];
  gmv: number;
  totalOrders: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  analisis: string;
  kelebihan: string;
  patternContent: string;
  createdAt: string;
}

interface Analytics {
  totalVideo: number;
  totalGmv: number;
  totalViews: number;
  topVisualTake: string;
  topTag: string;
}

const VISUAL_TAKES = ["Inframe", "Shake/Panning", "Review", "Unboxing", "Tutorial", "Lifestyle", "Testimonial"];
const MEDIA_FOCUS  = ["Face Cam", "Product Only", "Split Screen", "Text Only", "B-Roll"];
const KATEGORI_OPT = ["Skincare", "Makeup", "Haircare", "Bodycare", "Fragrance", "Fashion", "Lifestyle"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtRupiah(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}Jt`;
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function GmvBadge({ gmv }: { gmv: number }) {
  if (gmv >= 50_000_000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
      ⭐ 50Jt+
    </span>
  );
  if (gmv >= 10_000_000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
      🟡 10Jt+
    </span>
  );
  if (gmv >= 5_000_000) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
      🟢 5Jt+
    </span>
  );
  return null;
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const labelCls = "block text-xs font-semibold text-gray-500 mb-1.5";

// ─── Tag Input ────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");

  function add() {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  }

  function remove(t: string) { onChange(tags.filter((x) => x !== t)); }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Tambah tag (Enter untuk tambah)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button type="button" onClick={add}
          className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 whitespace-nowrap">
          + Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
              #{t}
              <button type="button" onClick={() => remove(t)} className="text-indigo-400 hover:text-indigo-700 ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Video Form ───────────────────────────────────────────────────────────────
const emptyForm = {
  usernameTiktok: "", linkVideo: "",
  caption: "", hook: "", jenisVisualTake: "", mediaFocus: "", kategori: "",
  gmv: "", totalOrders: "", views: "", likes: "", comments: "", shares: "",
  analisis: "", kelebihan: "", patternContent: "",
};

function VideoForm({
  initial,
  editId,
  onSuccess,
  onCancel,
}: {
  initial?: Partial<typeof emptyForm & { tags: string[] }>;
  editId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form, setForm]       = useState({ ...emptyForm, ...initial });
  const [tags, setTags]       = useState<string[]>(initial?.tags ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [uploadedPath, setUploadedPath] = useState(initial ? (initial as Record<string, unknown>).videoPath as string ?? "" : "");
  const [uploadedFilename, setUploadedFilename] = useState(initial ? (initial as Record<string, unknown>).videoFilename as string ?? "" : "");
  const [uploadProgress, setUploadProgress] = useState("");

  const isEdit = editId !== undefined;

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Auto-upload immediately
    setUploading(true);
    setUploadProgress("Mengupload video...");
    const fd = new FormData();
    fd.append("video", file);
    const res = await fetch("/api/video-referensi/upload", { method: "POST", body: fd });
    if (res.ok) {
      const json = await res.json();
      setUploadedPath(json.videoPath);
      setUploadedFilename(json.filename);
      setUploadProgress(`✅ Upload berhasil (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      const err = await res.json();
      setUploadProgress(`❌ ${err.error}`);
    }
    setUploading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      tags,
      gmv:         Number(form.gmv) || 0,
      totalOrders: Number(form.totalOrders) || 0,
      views:       Number(form.views) || 0,
      likes:       Number(form.likes) || 0,
      comments:    Number(form.comments) || 0,
      shares:      Number(form.shares) || 0,
      videoPath:   uploadedPath,
      videoFilename: uploadedFilename,
    };

    if (isEdit) {
      await fetch(`/api/video-referensi/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/video-referensi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">{isEdit ? "Edit Video" : "Tambah Video Referensi"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{isEdit ? "Update metadata video" : "Tambah video viral ke knowledge base"}</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-6 flex-1">
          {/* ── Section: TikTok Info ── */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              Identitas TikTok
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Username TikTok *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                  <input className={`${inputCls} pl-7`} placeholder="username"
                    value={form.usernameTiktok} onChange={(e) => set("usernameTiktok", e.target.value.replace(/^@/, ""))} required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Link Video TikTok</label>
                <input className={inputCls} placeholder="https://www.tiktok.com/..."
                  value={form.linkVideo} onChange={(e) => set("linkVideo", e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* ── Section: Upload Video ── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              File Video (opsional)
            </legend>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-indigo-300 transition-colors">
              <input type="file" accept="video/mp4,video/quicktime,video/webm" id="video-file"
                className="hidden" onChange={handleFileChange} disabled={uploading} />
              <label htmlFor="video-file" className="cursor-pointer block">
                <div className="text-3xl mb-2">{uploadedPath ? "🎬" : "☁️"}</div>
                {uploadedPath ? (
                  <div>
                    <p className="text-sm font-semibold text-green-600">{uploadProgress || "Video tersimpan"}</p>
                    <p className="text-xs text-gray-400 mt-1">Klik untuk ganti video</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Upload Video</p>
                    <p className="text-xs text-gray-400 mt-1">MP4, MOV, WEBM · maks 200MB</p>
                  </div>
                )}
                {uploading && <p className="text-xs text-indigo-500 mt-2 animate-pulse">Mengupload...</p>}
                {uploadProgress && !uploading && (
                  <p className={`text-xs mt-2 ${uploadProgress.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                    {uploadProgress}
                  </p>
                )}
              </label>
            </div>
          </fieldset>

          {/* ── Section: Classification ── */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              Klasifikasi Konten
            </legend>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Jenis Visual Take</label>
                <select className={inputCls} value={form.jenisVisualTake} onChange={(e) => set("jenisVisualTake", e.target.value)}>
                  <option value="">— Pilih —</option>
                  {VISUAL_TAKES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Media Focus</label>
                <select className={inputCls} value={form.mediaFocus} onChange={(e) => set("mediaFocus", e.target.value)}>
                  <option value="">— Pilih —</option>
                  {MEDIA_FOCUS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kategori Produk</label>
                <select className={inputCls} value={form.kategori} onChange={(e) => set("kategori", e.target.value)}>
                  <option value="">— Pilih —</option>
                  {KATEGORI_OPT.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Tags</label>
              <TagInput tags={tags} onChange={setTags} />
            </div>
          </fieldset>

          {/* ── Section: Performance ── */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              Performa Video
            </legend>
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: "gmv",         label: "GMV (Rp)",         placeholder: "5000000" },
                { key: "totalOrders", label: "Total Orders",      placeholder: "100" },
                { key: "views",       label: "Views",             placeholder: "10000" },
                { key: "likes",       label: "Likes",             placeholder: "500" },
                { key: "comments",    label: "Comments",          placeholder: "50" },
                { key: "shares",      label: "Shares",            placeholder: "30" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input type="number" min={0} className={inputCls} placeholder={placeholder}
                    value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </div>
          </fieldset>

          {/* ── Section: Hook & Caption ── */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              Hook & Caption
            </legend>
            <div>
              <label className={labelCls}>Hook (kalimat pembuka)</label>
              <input className={inputCls} placeholder="Hook yang dipakai di awal video..."
                value={form.hook} onChange={(e) => set("hook", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Caption</label>
              <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Caption TikTok..."
                value={form.caption} onChange={(e) => set("caption", e.target.value)} />
            </div>
          </fieldset>

          {/* ── Section: Analysis ── */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 pb-2 border-b border-gray-100 w-full">
              Analisis & Pattern
            </legend>
            <div>
              <label className={labelCls}>Analisis (kenapa berhasil?)</label>
              <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Tuliskan analisis mengapa video ini viral..."
                value={form.analisis} onChange={(e) => set("analisis", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Kelebihan Video</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Apa yang membuat video ini lebih baik dari lainnya..."
                value={form.kelebihan} onChange={(e) => set("kelebihan", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Pattern Content</label>
              <input className={inputCls} placeholder="Pola konten yang bisa direplikasi..."
                value={form.patternContent} onChange={(e) => set("patternContent", e.target.value)} />
            </div>
          </fieldset>

          {/* Actions */}
          <div className="flex gap-3 pt-2 pb-4">
            <button type="submit" disabled={saving || uploading}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Menyimpan..." : isEdit ? "💾 Simpan Perubahan" : "🎬 Tambah Video"}
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

// ─── Video Detail Modal ───────────────────────────────────────────────────────
function VideoDetailModal({
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  item: VideoItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto z-10">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">@{item.usernameTiktok}</span>
                <GmvBadge gmv={item.gmv} />
              </div>
              {item.jenisVisualTake && (
                <span className="text-xs text-indigo-600 font-medium">{item.jenisVisualTake}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">
              ✏️ Edit
            </button>
            <button onClick={onDelete}
              className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
              🗑️ Hapus
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 ml-1">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Video player */}
          {item.videoPath ? (
            <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] max-h-80 mx-auto max-w-[180px]">
              <video src={item.videoPath} controls className="w-full h-full object-contain" />
            </div>
          ) : item.linkVideo ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
              <p className="text-2xl mb-2">🎬</p>
              <a href={item.linkVideo} target="_blank" rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline font-medium">
                Buka video di TikTok ↗
              </a>
            </div>
          ) : null}

          {/* Performance stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "GMV",      val: fmtRupiah(item.gmv),     icon: "💰" },
              { label: "Orders",   val: item.totalOrders.toLocaleString(), icon: "🛍️" },
              { label: "Views",    val: fmtNum(item.views),      icon: "👁️" },
              { label: "Likes",    val: fmtNum(item.likes),      icon: "❤️" },
              { label: "Comments", val: fmtNum(item.comments),   icon: "💬" },
              { label: "Shares",   val: fmtNum(item.shares),     icon: "🔗" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3 text-center border border-gray-100">
                <p className="text-lg">{s.icon}</p>
                <p className="font-bold text-gray-900 text-sm">{s.val}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Classification */}
          <div className="flex flex-wrap gap-2">
            {item.mediaFocus && <Chip label={item.mediaFocus} color="blue" />}
            {item.kategori && <Chip label={item.kategori} color="purple" />}
            {item.tagsParsed.map((t) => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">#{t}</span>
            ))}
          </div>

          {/* Hook & Caption */}
          {item.hook && (
            <InfoBlock icon="💡" title="Hook" content={item.hook} />
          )}
          {item.caption && (
            <InfoBlock icon="📝" title="Caption" content={item.caption} />
          )}

          {/* Analysis */}
          {item.analisis && <InfoBlock icon="🔍" title="Analisis" content={item.analisis} />}
          {item.kelebihan && <InfoBlock icon="✨" title="Kelebihan" content={item.kelebihan} />}
          {item.patternContent && <InfoBlock icon="🔄" title="Pattern Content" content={item.patternContent} />}

          {/* Links */}
          <div className="flex gap-3">
            {item.linkTiktok && (
              <a href={item.linkTiktok} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-500 hover:underline">
                🔗 Profil TikTok
              </a>
            )}
            {item.linkVideo && (
              <a href={item.linkVideo} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-500 hover:underline">
                🎬 Video Asli
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: "blue" | "purple" | "green" }) {
  const cls = { blue: "bg-blue-100 text-blue-700", purple: "bg-purple-100 text-purple-700", green: "bg-green-100 text-green-700" }[color];
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

function InfoBlock({ icon, title, content }: { icon: string; title: string; content: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{icon} {title}</p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────
function VideoCard({
  item,
  onDetail,
  onEdit,
  onDelete,
}: {
  item: VideoItem;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  function handleMouseEnter() {
    setHovered(true);
    videoRef.current?.play().catch(() => {});
  }
  function handleMouseLeave() {
    setHovered(false);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-indigo-100 transition-all group">
      {/* Thumbnail / Video preview */}
      <div
        className="relative bg-gray-100 cursor-pointer overflow-hidden"
        style={{ aspectRatio: "9/14" }}
        onClick={onDetail}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {item.videoPath ? (
          <video
            ref={videoRef}
            src={item.videoPath}
            muted
            loop
            playsInline
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <span className="text-4xl mb-2">🎬</span>
            <span className="text-xs text-gray-400 text-center px-2">
              {item.linkVideo ? "Video TikTok" : "Belum ada file"}
            </span>
          </div>
        )}

        {/* GMV badge overlay */}
        {item.gmv >= 5_000_000 && (
          <div className="absolute top-2 right-2">
            <GmvBadge gmv={item.gmv} />
          </div>
        )}

        {/* Visual take overlay */}
        {item.jenisVisualTake && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-xs backdrop-blur-sm font-medium">
              {item.jenisVisualTake}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        {hovered && item.videoPath && (
          <div className="absolute inset-0 bg-black/10 transition-opacity" />
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        {/* Username */}
        <div className="flex items-center justify-between gap-1">
          <a href={item.linkTiktok || "#"} target="_blank" rel="noopener noreferrer"
            className="text-xs font-bold text-gray-900 hover:text-indigo-600 truncate">
            @{item.usernameTiktok}
          </a>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 text-xs">✏️</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs">🗑️</button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-bold text-gray-900">{fmtRupiah(item.gmv)}</span>
          <span className="text-gray-300">·</span>
          <span>👁 {fmtNum(item.views)}</span>
          <span className="text-gray-300">·</span>
          <span>❤️ {fmtNum(item.likes)}</span>
        </div>

        {/* Caption preview */}
        {item.caption && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{item.caption}</p>
        )}

        {/* Tags */}
        {item.tagsParsed.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tagsParsed.slice(0, 3).map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs">#{t}</span>
            ))}
            {item.tagsParsed.length > 3 && (
              <span className="text-xs text-gray-400">+{item.tagsParsed.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analytics Cards ──────────────────────────────────────────────────────────
function AnalyticsCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 truncate">{label}</p>
        <p className="font-bold text-gray-900 text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VideoReferensiPage() {
  const [items, setItems]         = useState<VideoItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);

  // Filters
  const [search, setSearch]         = useState("");
  const [gmvMin, setGmvMin]         = useState("0");
  const [visualTake, setVisualTake] = useState("");
  const [mediaFocus, setMediaFocus] = useState("");

  // UI state
  const [showForm, setShowForm]     = useState(false);
  const [editItem, setEditItem]     = useState<VideoItem | null>(null);
  const [detailItem, setDetailItem] = useState<VideoItem | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "24" });
    if (search)     params.set("search", search);
    if (gmvMin && gmvMin !== "0") params.set("gmvMin", gmvMin);
    if (visualTake) params.set("visualTake", visualTake);
    if (mediaFocus) params.set("mediaFocus", mediaFocus);

    const res  = await fetch(`/api/video-referensi?${params}`);
    const json = await res.json();
    setItems(json.items || []);
    setTotal(json.total || 0);
    setAnalytics(json.analytics || null);
    setLoading(false);
  }, [page, search, gmvMin, visualTake, mediaFocus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/video-referensi/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    setDetailItem(null);
    fetchData();
  }

  function openEdit(item: VideoItem) {
    setDetailItem(null);
    setEditItem(item);
  }

  function openDeleteConfirm(id: number) {
    setDetailItem(null);
    setDeleteId(id);
  }

  const hasFilters = search || gmvMin !== "0" || visualTake || mediaFocus;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referensi Video Viral</h1>
          <p className="text-sm text-gray-500 mt-0.5">Content Intelligence Library · benchmark & knowledge base tim affiliate</p>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }}
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2">
          🎬 Tambah Video
        </button>
      </div>

      {/* ── Analytics Summary ───────────────────────────── */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <AnalyticsCard icon="🎬" label="Total Video"      value={String(analytics.totalVideo)} />
          <AnalyticsCard icon="💰" label="Total GMV"        value={fmtRupiah(analytics.totalGmv)} />
          <AnalyticsCard icon="👁" label="Total Views"      value={fmtNum(analytics.totalViews)} />
          <AnalyticsCard icon="📹" label="Top Visual Take"  value={analytics.topVisualTake || "—"} />
          <AnalyticsCard icon="🏷" label="Top Tag"          value={analytics.topTag ? `#${analytics.topTag}` : "—"} />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Cari username TikTok..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-52"
        />
        <select value={gmvMin} onChange={(e) => { setGmvMin(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="0">Semua GMV</option>
          <option value="5000000">🟢 5Jt+</option>
          <option value="10000000">🟡 10Jt+</option>
          <option value="50000000">⭐ 50Jt+</option>
        </select>
        <select value={visualTake} onChange={(e) => { setVisualTake(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Visual Take</option>
          {VISUAL_TAKES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={mediaFocus} onChange={(e) => { setMediaFocus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua Media Focus</option>
          {MEDIA_FOCUS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setGmvMin("0"); setVisualTake(""); setMediaFocus(""); setPage(1); }}
            className="text-xs text-red-500 hover:underline px-2">
            Reset filter
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">{total} video</span>
      </div>

      {/* ── Grid ────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3 animate-pulse">🎬</div>
          <p className="text-sm">Memuat video...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-20 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <p className="font-bold text-gray-700 text-lg">Belum ada video referensi</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            {hasFilters ? "Tidak ada hasil untuk filter ini." : "Tambah video viral pertama sebagai benchmark tim."}
          </p>
          {!hasFilters && (
            <button onClick={() => setShowForm(true)}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700">
              🎬 Tambah Video Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              onDetail={() => setDetailItem(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => openDeleteConfirm(item.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 24 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-sm text-gray-500">{page} / {Math.ceil(total / 24)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 24)}
            className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}

      {/* ── Add / Edit Form drawer ─── */}
      {(showForm || editItem) && (
        <VideoForm
          editId={editItem?.id}
          initial={editItem ? {
            usernameTiktok: editItem.usernameTiktok,
            linkVideo:      editItem.linkVideo,
            caption:        editItem.caption,
            hook:           editItem.hook,
            jenisVisualTake: editItem.jenisVisualTake,
            mediaFocus:     editItem.mediaFocus,
            kategori:       editItem.kategori,
            tags:           editItem.tagsParsed,
            gmv:            String(editItem.gmv),
            totalOrders:    String(editItem.totalOrders),
            views:          String(editItem.views),
            likes:          String(editItem.likes),
            comments:       String(editItem.comments),
            shares:         String(editItem.shares),
            analisis:       editItem.analisis,
            kelebihan:      editItem.kelebihan,
            patternContent: editItem.patternContent,
            videoPath:      editItem.videoPath,
            videoFilename:  editItem.videoFilename,
          } as Parameters<typeof VideoForm>[0]["initial"] : undefined}
          onSuccess={() => { setShowForm(false); setEditItem(null); fetchData(); }}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* ── Detail Modal ─── */}
      {detailItem && (
        <VideoDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => openEdit(detailItem)}
          onDelete={() => openDeleteConfirm(detailItem.id)}
        />
      )}

      {/* ── Delete Confirm ─── */}
      {deleteId && (
        <ConfirmModal
          title="Hapus Video Referensi"
          message="Video ini akan dihapus dari knowledge base. Data tersimpan di database namun tidak akan muncul lagi."
          confirmLabel="Hapus Video"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
