"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";

interface BrandConfig {
  brandName: string;
  brandSystem: string;
  primaryColor: string;
  formHeader: string;
  formDescription: string;
  waFooter: string;
  logoPath: string;
  bannerPath: string;
}

interface DeliveryInfo {
  id: number;
  affiliateUsername: string;
  produk: string;
  totalVideoTarget: number;
}

interface VideoSub {
  id: number;
  videoNumber: number;
  tiktokLink: string;
  sparkCode: string;
  notes: string;
  submittedAt: string;
}

export default function SubmitVideoPage() {
  const params = useParams();
  const router = useRouter();
  const deliveryId = params.id as string;

  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [submissions, setSubmissions] = useState<VideoSub[]>([]);
  const [submittedNumbers, setSubmittedNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    videoNumber: "",
    tiktokLink: "",
    sparkCode: "",
    notes: "",
  });

  useEffect(() => {
    fetch(`/api/submit-video/${deliveryId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setBrand(data.brand);
        setDelivery(data.delivery);
        setSubmissions(data.submissions);
        setSubmittedNumbers(data.submittedNumbers);
        // Pre-select first unsubmitted video
        const target = data.delivery.totalVideoTarget;
        const submitted: number[] = data.submittedNumbers;
        const next = Array.from({ length: target }, (_, i) => i + 1).find((n) => !submitted.includes(n));
        if (next) setForm((f) => ({ ...f, videoNumber: String(next) }));
        setLoading(false);
      })
      .catch(() => { setError("Gagal memuat form. Coba lagi."); setLoading(false); });
  }, [deliveryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!delivery) return;
    setSubmitError(null);

    if (!form.videoNumber) { setSubmitError("Pilih nomor video terlebih dahulu"); return; }
    if (!form.tiktokLink.trim()) { setSubmitError("Link TikTok wajib diisi"); return; }
    if (!form.sparkCode.trim()) { setSubmitError("Spark Code wajib diisi"); return; }

    setSubmitting(true);
    const res = await fetch(`/api/submit-video/${deliveryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliateUsername: delivery.affiliateUsername,
        videoNumber: parseInt(form.videoNumber),
        tiktokLink: form.tiktokLink,
        sparkCode: form.sparkCode,
        notes: form.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error || "Terjadi kesalahan");
      setSubmitting(false);
      return;
    }
    // Success
    router.push(`/submit-video/${deliveryId}/success?vn=${form.videoNumber}`);
  }

  const primaryColor  = brand?.primaryColor  || "#6d28d9";
  const bannerPath    = brand?.bannerPath    || "";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Memuat form…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center max-w-sm">
          <div className="text-4xl mb-3">❌</div>
          <h2 className="font-bold text-gray-900 mb-2">Form Tidak Ditemukan</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const totalTarget = delivery?.totalVideoTarget ?? 0;
  const availableOptions = Array.from({ length: totalTarget }, (_, i) => i + 1).filter(
    (n) => !submittedNumbers.includes(n)
  );
  const allSubmitted = submittedNumbers.length >= totalTarget;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Brand Header — Banner image OR fallback colored header */}
      {bannerPath ? (
        <div className="relative w-full" style={{ aspectRatio: "4/1", maxHeight: "200px" }}>
          <Image
            src={bannerPath}
            alt={brand?.brandName || "Banner"}
            fill
            className="object-cover"
            unoptimized
            priority
          />
          {/* Gradient overlay with text */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end">
            <div className="p-4 text-white">
              {brand?.logoPath && (
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden mb-1.5">
                  <Image src={brand.logoPath} alt={brand.brandName} width={28} height={28} className="object-contain" unoptimized />
                </div>
              )}
              <p className="text-xs font-bold opacity-80 uppercase tracking-widest">{brand?.brandName || "BRAND"}</p>
              {brand?.formDescription && <p className="text-xs opacity-75 mt-0.5">{brand.formDescription}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-white py-8" style={{ backgroundColor: primaryColor }}>
          <div className="max-w-lg mx-auto px-4 text-center">
            {brand?.logoPath && (
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg overflow-hidden">
                  <Image src={brand.logoPath} alt={brand.brandName} width={56} height={56} className="object-contain" unoptimized />
                </div>
              </div>
            )}
            <p className="text-sm font-semibold opacity-80 uppercase tracking-widest mb-1">{brand?.brandName || "BRAND"}</p>
            <h1 className="text-xl font-bold">{brand?.formHeader || "Form Submit Video"}</h1>
            {brand?.formDescription && (
              <p className="text-sm opacity-80 mt-2">{brand.formDescription}</p>
            )}
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Delivery info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Informasi Pengiriman</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400">Username</span>
              <div className="font-semibold text-gray-800">@{delivery?.affiliateUsername}</div>
            </div>
            <div>
              <span className="text-gray-400">Produk</span>
              <div className="font-semibold text-gray-800">{delivery?.produk}</div>
            </div>
            <div>
              <span className="text-gray-400">Target Video</span>
              <div className="font-semibold text-gray-800">{totalTarget} video</div>
            </div>
            <div>
              <span className="text-gray-400">Sudah Submit</span>
              <div className="font-semibold text-gray-800">{submittedNumbers.length} video</div>
            </div>
          </div>
        </div>

        {/* Submission status */}
        {submissions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Status Submission</div>
            <div className="space-y-2">
              {Array.from({ length: totalTarget }, (_, i) => i + 1).map((n) => {
                const sub = submissions.find((s) => s.videoNumber === n);
                return (
                  <div key={n} className={`flex items-center gap-3 p-2.5 rounded-xl ${sub ? "bg-green-50 border border-green-100" : "bg-gray-50 border border-gray-100"}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${sub ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {sub ? "✓" : n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700">Video {n}</div>
                      {sub ? (
                        <div className="text-xs text-green-600 font-medium">
                          Submitted · {new Date(sub.submittedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">Belum disubmit</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Form */}
        {allSubmitted ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">Semua Video Sudah Disubmit!</h3>
            <p className="text-sm text-gray-500">Terima kasih, semua {totalTarget} video sudah dikumpulkan.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Submit Video</h2>
              <p className="text-xs text-gray-400 mt-0.5">Isi setiap kali selesai upload 1 video</p>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Video number select */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Pilih Video yang Dikumpulkan <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.videoNumber}
                  onChange={(e) => setForm((f) => ({ ...f, videoNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white"
                  style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                  required
                >
                  <option value="">-- Pilih nomor video --</option>
                  {availableOptions.map((n) => (
                    <option key={n} value={n}>Video {n}</option>
                  ))}
                </select>
              </div>

              {/* TikTok link */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Link Video TikTok <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://www.tiktok.com/@username/video/..."
                  value={form.tiktokLink}
                  onChange={(e) => setForm((f) => ({ ...f, tiktokLink: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white"
                  required
                />
              </div>

              {/* Spark code */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Spark Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Masukkan kode spark dari TikTok Creator Marketplace"
                  value={form.sparkCode}
                  onChange={(e) => setForm((f) => ({ ...f, sparkCode: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Catatan <span className="text-xs text-gray-400 font-normal">(opsional)</span>
                </label>
                <textarea
                  placeholder="Catatan tambahan jika ada..."
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white resize-none"
                />
              </div>

              {/* Error */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                )}
                {submitting ? "Mengirim…" : "Submit Video"}
              </button>
            </form>
          </div>
        )}

        {/* Rules */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="text-xs font-bold text-amber-700 mb-2">📌 Ketentuan</div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li>Pastikan link video aktif dan bisa diakses</li>
            <li>Spark Code wajib diisi untuk validasi</li>
            <li>1 submit hanya untuk 1 video</li>
            <li>Gunakan username TikTok yang terdaftar</li>
          </ul>
        </div>

        {/* Footer */}
        {brand?.waFooter && (
          <p className="text-center text-xs text-gray-400 pb-4">{brand.waFooter}</p>
        )}
      </div>
    </div>
  );
}
