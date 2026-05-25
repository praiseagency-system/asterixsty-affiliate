"use client";

export default function ProgramAnalyticsPage() {
  const metrics = [
    { icon: "🎯", label: "Campaign Performance",  desc: "ROI, conversion rate, dan efektivitas tiap campaign" },
    { icon: "👥", label: "Affiliator Insights",   desc: "Performa individu dan segmentasi affiliator" },
    { icon: "📹", label: "Content Analytics",      desc: "Video performance, viral rate, dan engagement" },
    { icon: "💰", label: "Revenue Attribution",    desc: "GMV kontribusi campaign vs non-campaign" },
    { icon: "📈", label: "Growth Tracking",        desc: "Pertumbuhan jumlah affiliator aktif per bulan" },
    { icon: "🔮", label: "Predictive Insights",    desc: "Prediksi performa berdasarkan data historis" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span>Program Center</span>
          <span>/</span>
          <span className="text-indigo-600 font-medium">Analytics</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Program Analytics 📈</h1>
        <p className="text-sm text-gray-500 mt-0.5">Analisis mendalam performa seluruh program affiliate</p>
      </div>

      {/* Metric preview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 hover:border-indigo-200 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-xl shrink-0">
              {m.icon}
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{m.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Coming Soon */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col items-center justify-center py-20 text-center px-8">
          <div className="w-20 h-20 bg-violet-50 rounded-2xl flex items-center justify-center text-4xl mb-5">
            📈
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Unified Program Analytics</h2>
          <p className="text-gray-500 max-w-md leading-relaxed mb-6">
            Dashboard analitik terpadu yang menggabungkan data dari semua campaign, tiered program,
            dan monitoring mingguan/bulanan dalam satu pandangan holistik.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            {["Interactive Charts", "Date Range Filter", "Export CSV", "Comparison Mode"].map((feat) => (
              <span key={feat} className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full">
                {feat}
              </span>
            ))}
          </div>
          <span className="mt-8 px-4 py-2 bg-amber-50 text-amber-700 text-sm font-semibold rounded-full border border-amber-200">
            🚧 Dalam Pengembangan
          </span>
        </div>
      </div>
    </div>
  );
}
