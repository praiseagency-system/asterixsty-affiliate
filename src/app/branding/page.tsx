"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { useBranding } from "@/contexts/BrandingContext";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

// ── Client-side image compress + crop to target aspect ────────────────────────
async function compressImage(
  file: File,
  targetW: number,
  targetH: number,
  quality = 0.88
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const srcAspect = img.width / img.height;
      const tgtAspect = targetW / targetH;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAspect > tgtAspect) {
        sw = img.height * tgtAspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / tgtAspect;
        sy = (img.height - sh) / 2;
      }
      const canvas = document.createElement("canvas");
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Compress failed")), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Simple Toast ──────────────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in slide-in-from-bottom-4 ${
      type === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-red-50 border-red-200 text-red-800"
    }`}>
      {type === "success" ? (
        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {message}
    </div>
  );
}

// ── Upload Progress Bar ───────────────────────────────────────────────────────
function UploadProgress({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function BrandingPage() {
  const { brand, refreshBranding } = useBranding();

  // Local form state — mirrors context but editable
  const [form, setForm] = useState(() => ({ ...brand }));
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Logo upload state
  const [logoPreview, setLogoPreview]   = useState(brand.logoPath || "");
  const [logoProgress, setLogoProgress] = useState(0);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Banner upload state
  const [bannerPreview, setBannerPreview]   = useState(brand.bannerPath || "");
  const [bannerProgress, setBannerProgress] = useState(0);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const logoRef   = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  // Sync form when context refreshes
  // (only on initial mount — user edits take precedence)
  const [synced, setSynced] = useState(false);
  if (!synced && brand.brandName) {
    setForm({ ...brand });
    setLogoPreview(brand.logoPath || "");
    setBannerPreview(brand.bannerPath || "");
    setSynced(true);
  }

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function set(k: keyof typeof form, v: string) {
    setForm((c) => ({ ...c, [k]: v }));
  }

  // ── Save brand config ──────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await refreshBranding();
        showToast("Branding berhasil disimpan!", "success");
      } else {
        showToast("Gagal menyimpan branding", "error");
      }
    } catch {
      showToast("Terjadi error saat menyimpan", "error");
    }
    setSaving(false);
  }

  // ── Logo upload ────────────────────────────────────────────────────────────
  const uploadLogo = useCallback(async (file: File) => {
    setUploadingLogo(true);
    setLogoProgress(10);
    try {
      setLogoProgress(30);
      const fd = new FormData();
      fd.append("logo", file);
      setLogoProgress(60);
      const res = await fetch("/api/brand/logo", { method: "POST", body: fd });
      const data = await res.json();
      setLogoProgress(90);
      if (res.ok) {
        const path = data.logoPath + "?t=" + Date.now();
        setLogoPreview(path);
        setForm((c) => ({ ...c, logoPath: data.logoPath }));
        await refreshBranding();
        setLogoProgress(100);
        showToast("Logo berhasil diupload!", "success");
      } else {
        showToast(data.error || "Gagal upload logo", "error");
      }
    } catch {
      showToast("Terjadi error saat upload logo", "error");
    }
    setTimeout(() => { setUploadingLogo(false); setLogoProgress(0); }, 400);
  }, [refreshBranding]);

  async function deleteLogo() {
    if (!confirm("Hapus logo brand?")) return;
    await fetch("/api/brand/logo", { method: "DELETE" });
    setLogoPreview("");
    setForm((c) => ({ ...c, logoPath: "" }));
    await refreshBranding();
    showToast("Logo dihapus", "success");
  }

  // ── Banner upload with client-side crop + compress ────────────────────────
  const uploadBanner = useCallback(async (file: File) => {
    setUploadingBanner(true);
    setBannerProgress(10);
    try {
      setBannerProgress(25);
      // Client-side compress + center-crop to 1600×400
      const compressed = await compressImage(file, 1600, 400, 0.88);
      setBannerProgress(55);
      const compressedFile = new File([compressed], "brand-banner.jpg", { type: "image/jpeg" });

      // Show local preview immediately
      const previewUrl = URL.createObjectURL(compressed);
      setBannerPreview(previewUrl);
      setBannerProgress(70);

      const fd = new FormData();
      fd.append("banner", compressedFile);
      const res = await fetch("/api/brand/banner", { method: "POST", body: fd });
      const data = await res.json();
      setBannerProgress(90);
      if (res.ok) {
        const path = data.bannerPath + "?t=" + Date.now();
        setBannerPreview(path);
        setForm((c) => ({ ...c, bannerPath: data.bannerPath }));
        await refreshBranding();
        setBannerProgress(100);
        showToast("Banner berhasil diupload & dikompres!", "success");
      } else {
        showToast(data.error || "Gagal upload banner", "error");
        setBannerPreview(brand.bannerPath || "");
      }
    } catch {
      showToast("Terjadi error saat upload banner", "error");
    }
    setTimeout(() => { setUploadingBanner(false); setBannerProgress(0); }, 400);
  }, [refreshBranding, brand.bannerPath]);

  async function deleteBanner() {
    if (!confirm("Hapus banner form?")) return;
    await fetch("/api/brand/banner", { method: "DELETE" });
    setBannerPreview("");
    setForm((c) => ({ ...c, bannerPath: "" }));
    await refreshBranding();
    showToast("Banner dihapus", "success");
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branding Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Identitas brand yang muncul di sidebar, form submission, dan reminder WA</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Menyimpan…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Simpan Branding
            </>
          )}
        </button>
      </div>

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">🖼️ Logo Brand</h2>
        <div className="flex items-start gap-5">
          {/* Preview */}
          <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo" width={88} height={88} className="object-contain w-full h-full p-1" unoptimized />
            ) : (
              <div className="text-center">
                <svg className="w-8 h-8 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-400 mt-1">Logo</p>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-sm text-gray-500">PNG, JPG, atau WEBP · Max 2 MB · Tampil di sidebar</p>
            {uploadingLogo && <UploadProgress pct={logoProgress} label="Mengupload logo…" />}
            <div className="flex gap-2">
              <button
                onClick={() => logoRef.current?.click()}
                disabled={uploadingLogo}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {uploadingLogo ? "Mengupload…" : logoPreview ? "Ganti Logo" : "Upload Logo"}
              </button>
              {logoPreview && (
                <button
                  onClick={deleteLogo}
                  className="px-4 py-2 border border-red-200 text-red-600 bg-red-50 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
                >
                  Hapus
                </button>
              )}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
            />
          </div>
        </div>
      </div>

      {/* ── Banner Form ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">🖼 Banner Form Submission</h2>
        <p className="text-xs text-gray-400 mb-4">Tampil sebagai header visual di halaman form affiliate · Otomatis di-crop ke rasio 4:1 (1600×400 px)</p>

        {/* Banner preview */}
        <div
          className={`w-full rounded-xl border-2 border-dashed overflow-hidden mb-4 ${bannerPreview ? "border-gray-200" : "border-gray-200 bg-gray-50"}`}
          style={{ aspectRatio: "4/1" }}
        >
          {bannerPreview ? (
            <Image
              src={bannerPreview}
              alt="Banner"
              width={1600}
              height={400}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-400">Banner belum diupload</p>
              <p className="text-xs text-gray-300">Rekomendasi 1600×400 px</p>
            </div>
          )}
        </div>

        {uploadingBanner && <div className="mb-4"><UploadProgress pct={bannerProgress} label="Memproses banner (crop + compress)…" /></div>}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => bannerRef.current?.click()}
            disabled={uploadingBanner}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {uploadingBanner ? "Memproses…" : bannerPreview ? "Ganti Banner" : "Upload Banner"}
          </button>
          {bannerPreview && (
            <button
              onClick={deleteBanner}
              className="px-4 py-2 border border-red-200 text-red-600 bg-red-50 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
            >
              Hapus Banner
            </button>
          )}
          <p className="self-center text-xs text-gray-400">PNG/JPG/WEBP · Max 3 MB · Auto-crop center 4:1</p>
        </div>
        <input
          ref={bannerRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBanner(f); e.target.value = ""; }}
        />
      </div>

      {/* ── Brand Identity ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">🏷️ Identitas Brand</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nama Brand</label>
            <input className={inputCls} placeholder="ASTERIXSTY" value={form.brandName} onChange={(e) => set("brandName", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nama Sistem</label>
            <input className={inputCls} placeholder="Affiliate Manager" value={form.brandSystem} onChange={(e) => set("brandSystem", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Primary Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white" />
              <input className={`${inputCls} flex-1`} value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} placeholder="#6d28d9" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Secondary Color <span className="text-gray-400 font-normal">(opsional)</span></label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondaryColor || "#000000"} onChange={(e) => set("secondaryColor", e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white" />
              <input className={`${inputCls} flex-1`} value={form.secondaryColor} onChange={(e) => set("secondaryColor", e.target.value)} placeholder="#e11d48" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Form Content ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">📋 Konten Form & Reminder</h2>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Header Form</label>
          <input className={inputCls} placeholder="Form Pengumpulan Konten Affiliate" value={form.formHeader} onChange={(e) => set("formHeader", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Muncul sebagai judul di bawah banner (jika tidak ada banner)</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Deskripsi Form</label>
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Mohon isi form setiap selesai upload video." value={form.formDescription} onChange={(e) => set("formDescription", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Footer Reminder WhatsApp</label>
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Team Asterixsty ✨" value={form.waFooter} onChange={(e) => set("waFooter", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Muncul di pesan WA reminder dan di bawah form submission</p>
        </div>
      </div>

      {/* ── Previews ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">👁️ Live Preview</h2>
        </div>
        <div className="p-6 space-y-6">
          {/* Sidebar preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sidebar Brand</p>
            <div className="border border-gray-200 rounded-xl p-4 bg-white max-w-[220px] shadow-sm">
              <div className="flex items-center gap-2.5">
                {logoPreview ? (
                  <div className="w-9 h-9 rounded-xl border border-gray-100 overflow-hidden shrink-0 bg-white flex items-center justify-center">
                    <Image src={logoPreview} alt={form.brandName} width={32} height={32} className="object-contain w-full h-full p-0.5" unoptimized />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: form.primaryColor }}>
                    <span className="text-white text-xs font-bold">{(form.brandName || "AB").slice(0, 2)}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.15em] truncate">{form.brandName || "BRAND"}</p>
                  <p className="text-[13px] font-bold text-gray-800 leading-tight truncate">{form.brandSystem || "System"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form header preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Form Header Preview</p>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              {bannerPreview ? (
                <div className="relative" style={{ aspectRatio: "4/1" }}>
                  <Image src={bannerPreview} alt="Banner" fill className="object-cover" unoptimized />
                  {/* Overlay text on banner */}
                  {form.formDescription && (
                    <div className="absolute inset-0 flex items-end p-4 bg-gradient-to-t from-black/40 to-transparent">
                      <p className="text-white text-xs opacity-90">{form.formDescription}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 px-4 text-center text-white" style={{ backgroundColor: form.primaryColor }}>
                  {logoPreview && (
                    <div className="flex justify-center mb-3">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden">
                        <Image src={logoPreview} alt={form.brandName} width={40} height={40} className="object-contain" unoptimized />
                      </div>
                    </div>
                  )}
                  <p className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">{form.brandName || "BRAND"}</p>
                  <p className="text-sm font-bold">{form.formHeader || "Header Form"}</p>
                  {form.formDescription && <p className="text-xs opacity-75 mt-1">{form.formDescription}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom save */}
      <div className="flex justify-end pb-4">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 shadow-sm transition-colors">
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </button>
      </div>
    </div>
  );
}

export default function BrandingPageGate() {
  return (
    <PermissionGate permission={PERMISSIONS.BRANDING_SETTINGS}>
      <BrandingPage />
    </PermissionGate>
  );
}
