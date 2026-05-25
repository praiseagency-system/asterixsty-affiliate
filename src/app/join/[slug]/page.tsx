"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { OBJECTIVE_META, VISUAL_TAKE } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RewardConfig {
  fixed?:       { enabled: boolean; rewardPerVideo: number; rewardPerLive: number; completionBonus: number };
  leaderboard?: Array<{ id: string; rank: number; label: string; reward: number; ruleType: string }>;
  consistency?: { enabled: boolean; minUpload: number; rewardAmount: number };
  milestones?:  Array<{ id: string; type: string; target: number; reward: number }>;
}

interface CampaignInfo {
  id: number; nama: string; deskripsi: string; bannerPath: string;
  status: string; objectives: string; affiliateCategories: string; visualTake: string;
  rewardConfig: string; rewardDeskripsi: string;
  maxParticipants: number; startDate: string | null; endDate: string | null;
  participantCount: number; isFull: boolean; approvalMode: string;
}

type JoinStep = "info" | "form" | "success" | "pending";

function parseJSON<T>(s: string, fb: T): T { try { return JSON.parse(s) as T; } catch { return fb; } }
function fmtRp(n: number) {
  if (n >= 1_000_000) return `Rp${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp${(n/1_000).toFixed(0)}rb`;
  return `Rp${n}`;
}
function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Reward Preview ───────────────────────────────────────────────────────────
function RewardPreview({ config, deskripsi }: { config: RewardConfig; deskripsi: string }) {
  const items: { icon: string; label: string; value: string }[] = [];
  if (config.fixed?.enabled && config.fixed.rewardPerVideo > 0)
    items.push({ icon: "🎥", label: "Per Video", value: fmtRp(config.fixed.rewardPerVideo) });
  if (config.leaderboard?.length)
    config.leaderboard.slice(0, 3).forEach((r, i) =>
      items.push({ icon: ["🥇","🥈","🥉"][i] ?? "🏅", label: r.label, value: fmtRp(r.reward) }));
  if (config.consistency?.enabled && config.consistency.rewardAmount > 0)
    items.push({ icon: "🔥", label: `Upload min ${config.consistency.minUpload} video`, value: fmtRp(config.consistency.rewardAmount) });
  if (config.milestones?.length)
    items.push({ icon: "🎯", label: `${config.milestones.length} milestone reward`, value: "Check campaign" });
  if (items.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
      <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">🏆 Reward Campaign</h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-amber-700">{item.icon} {item.label}</span>
            <span className="font-bold text-amber-900">{item.value}</span>
          </div>
        ))}
      </div>
      {deskripsi && <p className="text-xs text-amber-600 mt-3 pt-3 border-t border-amber-200">{deskripsi}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PublicJoinPage() {
  const params = useParams();
  const slug   = params?.slug as string;

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [step, setStep]         = useState<JoinStep>("info");

  // Form state
  const [form, setForm] = useState({
    tiktokUsername: "",
    namaAffiliate:  "",
    whatsapp:       "",
    category:       "",
    visualTake:     "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState("");

  useEffect(() => {
    fetch(`/api/join/${slug}`)
      .then(async (r) => {
        const d = await r.json() as CampaignInfo & { error?: string };
        if (!r.ok) { setError(d.error ?? "Tidak ditemukan"); return; }
        setCampaign(d);
      })
      .catch(() => setError("Gagal memuat campaign"))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tiktokUsername.trim()) { setFormError("TikTok username wajib diisi"); return; }
    setSubmitting(true); setFormError("");
    try {
      const res  = await fetch(`/api/join/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok?: boolean; status?: string; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Gagal bergabung"); return; }
      setStep(data.status === "Pending" ? "pending" : "success");
    } catch {
      setFormError("Koneksi gagal, coba lagi");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-bold text-gray-800 text-lg mb-2">Campaign Tidak Ditemukan</h2>
          <p className="text-sm text-gray-500">{error || "Link campaign tidak valid atau sudah berakhir."}</p>
        </div>
      </div>
    );
  }

  const objectives  = parseJSON<string[]>(campaign.objectives, []);
  const categories  = parseJSON<string[]>(campaign.affiliateCategories, []);
  const rewardCfg   = parseJSON<RewardConfig>(campaign.rewardConfig, {});

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="font-bold text-gray-800 text-xl mb-2">Berhasil Bergabung!</h2>
          <p className="text-sm text-gray-500 mb-4">
            Selamat datang di campaign <strong>{campaign.nama}</strong>!
            Tim kami akan segera menghubungi kamu.
          </p>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700">
            ✅ Status kamu: <strong>Active</strong>
          </div>
        </div>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="font-bold text-gray-800 text-xl mb-2">Menunggu Persetujuan</h2>
          <p className="text-sm text-gray-500 mb-4">
            Pendaftaran kamu di campaign <strong>{campaign.nama}</strong> sedang menunggu persetujuan specialist kami.
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
            ⏳ Status kamu: <strong>Pending Approval</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      {/* Banner */}
      <div className={`relative h-48 sm:h-64 ${campaign.bannerPath ? "" : "bg-gradient-to-r from-indigo-600 to-violet-600"}`}>
        {campaign.bannerPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.bannerPath} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 0%, transparent 50%)" }} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5">
          <span className="inline-block px-2.5 py-1 bg-white/20 text-white text-xs font-semibold rounded-full backdrop-blur-sm mb-2">
            🎯 Campaign
          </span>
          <h1 className="text-2xl font-bold text-white leading-tight">{campaign.nama}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Campaign info */}
        {campaign.isFull && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-semibold text-center">
            ⚠️ Slot peserta sudah penuh
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Mulai",   value: formatDate(campaign.startDate) },
            { label: "Berakhir", value: formatDate(campaign.endDate)  },
            { label: "Peserta", value: campaign.maxParticipants > 0 ? `${campaign.participantCount}/${campaign.maxParticipants}` : `${campaign.participantCount}` },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{s.label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5 leading-tight">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {campaign.deskripsi && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-2">📝 Tentang Campaign</h3>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{campaign.deskripsi}</p>
          </div>
        )}

        {/* Objectives */}
        {objectives.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-2.5">🎯 Campaign Objectives</h3>
            <div className="flex flex-wrap gap-1.5">
              {objectives.map((obj) => {
                const m = OBJECTIVE_META[obj] ?? { bg:"bg-gray-100", text:"text-gray-600", icon:"📌" };
                return (
                  <span key={obj} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
                    {m.icon} {obj}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Reward */}
        <RewardPreview config={rewardCfg} deskripsi={campaign.rewardDeskripsi} />

        {/* Join Form */}
        {step === "info" && (
          <button
            disabled={campaign.isFull}
            onClick={() => setStep("form")}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-base hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-200"
          >
            {campaign.isFull ? "Slot Penuh" : "🚀 Bergabung Sekarang"}
          </button>
        )}

        {step === "form" && (
          <form onSubmit={handleJoin} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-bold text-gray-800">📋 Data Pendaftaran</h3>
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{formError}</div>
            )}

            {[
              { key:"tiktokUsername", label:"TikTok Username *",  placeholder:"@username",       type:"text" },
              { key:"namaAffiliate",  label:"Nama Lengkap",       placeholder:"Nama kamu",       type:"text" },
              { key:"whatsapp",       label:"Nomor WhatsApp",     placeholder:"08xxxxxxxxxx",    type:"tel"  },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            ))}

            {categories.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Kategori Konten</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">Pilih kategori…</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Jenis Visual Take</label>
              <select
                value={form.visualTake}
                onChange={(e) => setForm((p) => ({ ...p, visualTake: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">Pilih visual take…</option>
                {VISUAL_TAKE.map((vt) => <option key={vt}>{vt}</option>)}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep("info")}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Mendaftar…
                  </span>
                ) : "✅ Daftar Sekarang"}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Powered by Asterixsty Affiliate Platform
        </p>
      </div>
    </div>
  );
}
