"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

interface BrandConfig {
  brandName: string;
  primaryColor: string;
  formHeader: string;
  waFooter: string;
  logoPath: string;
}

function SuccessContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const deliveryId = params.id as string;
  const videoNumber = searchParams.get("vn") ?? "?";

  const [brand, setBrand] = useState<BrandConfig | null>(null);

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then(setBrand)
      .catch(() => {});
  }, []);

  const primaryColor = brand?.primaryColor || "#6d28d9";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="text-white py-6" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-lg mx-auto px-4 flex items-center gap-3">
          {brand?.logoPath && (
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden">
              <Image src={brand.logoPath} alt={brand.brandName} width={36} height={36} className="object-contain" unoptimized />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold opacity-80 uppercase tracking-widest">{brand?.brandName || "BRAND"}</p>
            <p className="text-sm font-medium opacity-90">{brand?.formHeader || "Form Submit Video"}</p>
          </div>
        </div>
      </div>

      {/* Success content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center max-w-sm w-full">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">Video Berhasil Dikumpulkan!</h2>
          <p className="text-sm text-gray-500 mb-1">Video {videoNumber} sudah kami terima.</p>
          <p className="text-sm text-gray-500 mb-6">Terima kasih sudah submit ya 🙌</p>

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 mb-5">
            Checklist video otomatis diperbarui di sistem kami.
          </div>

          <Link
            href={`/submit-video/${deliveryId}`}
            className="block w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Submit Video Lain
          </Link>
        </div>
      </div>

      {brand?.waFooter && (
        <p className="text-center text-xs text-gray-400 pb-6">{brand.waFooter}</p>
      )}
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}
