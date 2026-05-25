import { prisma } from "@/lib/prisma";

export interface TierEntry {
  tier: string;
  label: string;
  minGmv: number;
  color: string;
}

export interface ScoreEntry {
  komponen: string;
  minValue: number;
  poin: number;
}

let _tierCache: TierEntry[] | null = null;
let _cacheTs = 0;
const CACHE_TTL = 60_000;

// Monitoring score logic from Apps Script — kept separate from listing score DB config
const MONITORING_SCORE: ScoreEntry[] = [
  { komponen: "gmv",        minValue: 10_000_000, poin: 6 },
  { komponen: "gmv",        minValue: 5_000_000,  poin: 5 },
  { komponen: "gmv",        minValue: 1_000_000,  poin: 4 },
  { komponen: "gmv",        minValue: 300_000,    poin: 2 },
  { komponen: "gmv",        minValue: 0,          poin: 1 },
  { komponen: "items sold", minValue: 100,        poin: 2 },
  { komponen: "items sold", minValue: 50,         poin: 1 },
  { komponen: "total video",minValue: 5,          poin: 1 },
  { komponen: "live stream",minValue: 1,          poin: 1 },
];

async function loadTierConfig(): Promise<TierEntry[]> {
  const now = Date.now();
  if (_tierCache && now - _cacheTs < CACHE_TTL) return _tierCache;
  const rows = await prisma.tierConfig.findMany({ orderBy: { minGmv: "desc" } });
  if (rows.length === 0) {
    _tierCache = [
      { tier: "A", label: "Elite",  minGmv: 10_000_000, color: "#7B2D8B" },
      { tier: "B", label: "Growth", minGmv: 5_000_000,  color: "#375623" },
      { tier: "C", label: "Entry",  minGmv: 0,          color: "#2D6A9F" },
    ];
  } else {
    _tierCache = rows.map((r) => ({
      tier: r.tier, label: r.label, minGmv: r.minGmv, color: r.color || "#2D6A9F",
    }));
  }
  _cacheTs = now;
  return _tierCache!;
}

export async function getTierBadgeDB(gmv: number): Promise<{ tier: string; label: string; color: string }> {
  const config = await loadTierConfig();
  for (const c of config) {
    if (gmv >= c.minGmv) return { tier: c.tier, label: c.label, color: c.color };
  }
  const last = config[config.length - 1];
  return { tier: last.tier, label: last.label, color: last.color };
}

export async function getScoreDB(data: {
  gmv: number; itemsSold: number; videos: number; liveStreams: number;
}): Promise<number> {
  const calc = (komponen: string, value: number): number => {
    const entries = MONITORING_SCORE
      .filter((c) => c.komponen === komponen)
      .sort((a, b) => b.minValue - a.minValue);
    for (const e of entries) {
      if (value >= e.minValue) return e.poin;
    }
    return 0;
  };

  const score =
    calc("gmv", data.gmv) +
    calc("items sold", data.itemsSold) +
    calc("total video", data.videos) +
    calc("live stream", data.liveStreams);

  return Math.min(score, 10);
}

export async function getAllTierConfig(): Promise<TierEntry[]> {
  return loadTierConfig();
}

export function invalidateCache() {
  _tierCache = null;
  _cacheTs = 0;
}
