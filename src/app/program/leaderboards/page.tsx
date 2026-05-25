"use client";

import Link from "next/link";

export default function LeaderboardsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span>Program Center</span>
          <span>/</span>
          <span className="text-indigo-600 font-medium">Leaderboards</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Leaderboards 📊</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ranking affiliator terbaik lintas campaign</p>
      </div>

      {/* Coming Soon */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center text-4xl mb-5">
            📊
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Global Leaderboard</h2>
          <p className="text-gray-500 max-w-md leading-relaxed mb-6">
            Tampilkan ranking affiliator terbaik dari semua campaign yang sedang berjalan.
            Ukur performa berdasarkan GMV, jumlah video, dan konsistensi.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            {["GMV Total", "Video Count", "Campaign Wins", "Consistency Score"].map((feat) => (
              <span key={feat} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
                {feat}
              </span>
            ))}
          </div>
          <span className="mt-8 px-4 py-2 bg-amber-50 text-amber-700 text-sm font-semibold rounded-full border border-amber-200">
            🚧 Dalam Pengembangan
          </span>
          <Link
            href="/program/campaigns"
            className="mt-4 text-sm text-indigo-600 hover:underline"
          >
            Lihat Leaderboard per Campaign →
          </Link>
        </div>
      </div>
    </div>
  );
}
