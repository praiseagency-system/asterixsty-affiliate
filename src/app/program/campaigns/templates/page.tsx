"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { OBJECTIVE_META } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Campaign {
  id: number; nama: string; slug: string;
  objectives: string; deskripsi: string; status: string;
  visibility: string; affiliateCategories: string; visualTake: string;
  rewardConfig: string; rewardDeskripsi: string;
  maxParticipants: number; picSpecialistId: number|null;
  picSpecialist: { id: number; nama: string } | null;
  catatan: string;
  isTemplate: boolean; createdAt: string;
  totalParticipants: number; totalRewardPool: number;
}

interface RewardConfig {
  fixed?:       { enabled: boolean; rewardPerVideo: number; rewardPerLive: number; completionBonus: number };
  leaderboard?: Array<{ reward: number }>;
  consistency?: { enabled: boolean; rewardAmount: number };
  milestones?:  Array<{ reward: number }>;
}

function parseJSON<T>(s: string, fb: T): T { try { return JSON.parse(s) as T; } catch { return fb; } }
function fmtRp(n: number) {
  if (n >= 1_000_000) return `Rp${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp${(n/1_000).toFixed(0)}rb`;
  return `Rp${n}`;
}
function getRewardSummary(cfg: RewardConfig): string[] {
  const parts: string[] = [];
  if (cfg.fixed?.enabled && cfg.fixed.rewardPerVideo > 0) parts.push(`🎥 ${fmtRp(cfg.fixed.rewardPerVideo)}/video`);
  if (cfg.leaderboard?.length) parts.push(`🏆 Top ${cfg.leaderboard.length} Reward`);
  if (cfg.consistency?.enabled && cfg.consistency.rewardAmount > 0) parts.push(`🔥 Consistency`);
  if (cfg.milestones?.length) parts.push(`🎯 ${cfg.milestones.length} Milestone`);
  return parts;
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({ t, onDuplicate }: { t: Campaign; onDuplicate: (id: number) => void }) {
  const objectives = parseJSON<string[]>(t.objectives, []);
  const rewardCfg  = parseJSON<RewardConfig>(t.rewardConfig, {});
  const chips      = getRewardSummary(rewardCfg);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-100 to-gray-100 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="px-2.5 py-1 bg-white text-gray-500 text-xs font-semibold rounded-full border border-gray-200">
            📋 Template
          </span>
          <span className="text-xs text-gray-400">
            {new Date(t.createdAt).toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" })}
          </span>
        </div>
        <h3 className="font-bold text-gray-900 text-sm leading-tight">{t.nama}</h3>
        {t.deskripsi && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.deskripsi}</p>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Objectives */}
        {objectives.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {objectives.slice(0, 3).map((obj) => {
              const m = OBJECTIVE_META[obj] ?? { bg:"bg-gray-100", text:"text-gray-600", icon:"📌" };
              return (
                <span key={obj} className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.bg} ${m.text}`}>
                  {m.icon} {obj}
                </span>
              );
            })}
            {objectives.length > 3 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded-full">+{objectives.length-3}</span>
            )}
          </div>
        )}

        {/* Reward chips */}
        {chips.length > 0 && (
          <div className="space-y-0.5">
            {chips.map((chip) => (
              <span key={chip} className="block text-xs text-indigo-600 font-medium">{chip}</span>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-gray-400 pt-1 border-t border-gray-50 mt-auto">
          {t.maxParticipants > 0 && <span>👥 Max {t.maxParticipants}</span>}
          {t.totalRewardPool > 0 && <span className="text-amber-600 font-semibold">💰 {fmtRp(t.totalRewardPool)}</span>}
          {t.picSpecialist && <span className="ml-auto">PIC: {t.picSpecialist.nama}</span>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/program/campaigns/${t.id}`}
            className="flex-1 py-2 text-center text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Lihat Detail
          </Link>
          <button
            onClick={() => onDuplicate(t.id)}
            className="flex-1 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Duplikat
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Campaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [duping, setDuping]       = useState<number|null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res  = await fetch("/api/campaigns?templates=1");
      const data = await res.json();
      setTemplates(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function handleDuplicate(id: number) {
    setDuping(id);
    try {
      // Fetch the template
      const res  = await fetch(`/api/campaigns/${id}`);
      const orig = await res.json() as Campaign & { participants?: unknown[]; affiliateCategories: string; visualTake: string };

      // Create a copy with "(Copy)" suffix and isTemplate:false
      const body = {
        nama:                `${orig.nama} (Copy)`,
        slug:                `${orig.slug}-copy-${Date.now()}`,
        objectives:          orig.objectives,
        deskripsi:           orig.deskripsi,
        bannerPath:          "",
        status:              "Draft",
        visibility:          orig.visibility,
        affiliateCategories: orig.affiliateCategories,
        visualTake:          orig.visualTake,
        startDate:           null,
        endDate:             null,
        rewardConfig:        orig.rewardConfig,
        rewardDeskripsi:     orig.rewardDeskripsi,
        maxParticipants:     orig.maxParticipants,
        picSpecialistId:     orig.picSpecialistId,
        catatan:             orig.catatan,
        isTemplate:          false,
      };

      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!createRes.ok) throw new Error("Gagal menduplikat");
      const created = await createRes.json() as { id: number };

      // Navigate to the new campaign
      window.location.href = `/program/campaigns/${created.id}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menduplikat template");
    } finally { setDuping(null); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Link href="/program/campaigns" className="hover:text-indigo-600 transition-colors">Campaign Center</Link>
            <span>/</span>
            <span className="text-indigo-600 font-medium">Templates</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Templates 📋</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reuse campaign structure yang sudah terbukti berhasil</p>
        </div>
        <Link
          href="/program/campaigns"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          🎯 Lihat Semua Campaign
        </Link>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-5 mb-6">
        <h3 className="font-semibold text-indigo-800 mb-3">✨ Cara Menggunakan Template</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step:"1", title:"Simpan sebagai Template", desc:'Dari Settings tab campaign, aktifkan toggle "Simpan sebagai Template"' },
            { step:"2", title:"Duplikat Template",        desc:"Klik tombol Duplikat pada template yang ingin digunakan" },
            { step:"3", title:"Edit & Launch",            desc:"Sesuaikan detail campaign baru lalu ubah status menjadi Ongoing" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-semibold text-indigo-800">{item.title}</p>
                <p className="text-xs text-indigo-600/70 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Templates grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse">
              <div className="h-28 bg-gray-100 rounded-t-2xl" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="font-semibold text-gray-700 mb-1">Belum ada template</h3>
          <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
            Buat campaign, lalu aktifkan &quot;Simpan sebagai Template&quot; di tab Settings untuk menyimpannya sebagai template.
          </p>
          <Link
            href="/program/campaigns"
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Buat Campaign Baru
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className={duping === t.id ? "opacity-50 pointer-events-none" : ""}>
              <TemplateCard t={t} onDuplicate={handleDuplicate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
