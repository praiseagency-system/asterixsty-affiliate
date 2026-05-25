import { getPrisma } from "@/lib/prisma";

export interface ScoreInput {
  gmvPer30Hari: number;
  qtyProdukTerjual: number;
  rataRataViews: number;
  kejelasanGambar: string;   // visual quality
  visualisasiProduk: string; // describe quality
  audioSuara: string;        // audio quality
  jenisVisualTake: string;
  qtyVideoPerProduk: number;
}

export interface ScoreOutput {
  skorGmv: number;
  skorQty: number;
  skorViews: number;
  skorKualitas: number;
  overallResult: number;
  worthIt: string;
  sampleDecision: string;
}

// ─── Quality point map ────────────────────────────────────────────────────────
const QUALITY_MAP: Record<string, number> = {
  "Sangat Bagus": 3,
  "Bagus": 2,
  "Kurang": 1,
};

// ─── Default thresholds (used when ScoreConfig table is empty) ────────────────
const DEFAULTS = {
  gmv:   [{ min: 1_000_000, point: 3 }, { min: 300_000, point: 2 }, { min: 50_000, point: 1 }],
  qty:   [{ min: 100,       point: 3 }, { min: 50,      point: 2 }, { min: 1,      point: 1 }],
  views: [{ min: 10_000,   point: 3 }, { min: 1_000,   point: 2 }, { min: 0,      point: 1 }],
};

// ─── Load thresholds from ScoreConfig DB ─────────────────────────────────────
async function loadThresholds() {
  const prisma = getPrisma();
  const rows = await prisma.scoreConfig.findMany({ orderBy: [{ komponen: "asc" }, { minValue: "desc" }] });

  function parse(komponen: string, defaults: { min: number; point: number }[]) {
    const found = rows.filter((r) => r.komponen === komponen);
    if (found.length === 0) return defaults;
    return found
      .sort((a, b) => b.minValue - a.minValue)
      .map((r) => ({ min: r.minValue, point: r.level }));
  }

  return {
    gmv:   parse("gmv",   DEFAULTS.gmv),
    qty:   parse("qty",   DEFAULTS.qty),
    views: parse("views", DEFAULTS.views),
  };
}

function scoreFromThreshold(value: number, thresholds: { min: number; point: number }[]): number {
  for (const t of thresholds) {
    if (value >= t.min) return t.point;
  }
  return 0;
}

// ─── Worth It Engine ──────────────────────────────────────────────────────────
function calcWorthIt(
  jenisVisualTake: string,
  qtyVideo: number,
  gmv: number,
  overallResult: number,
): string {
  const take = jenisVisualTake.toLowerCase();

  // Visual take based rules
  if (take.includes("inframe")) {
    if (qtyVideo >= 2 || (qtyVideo >= 1 && gmv >= 100_000_000)) return "Worth It";
    return "Tidak Worth It";
  }
  if (take.includes("shake")) {
    if (qtyVideo >= 5) return "Worth It";
    return "Tidak Worth It";
  }
  if (take.includes("review")) {
    if (qtyVideo >= 2) return "Worth It";
    return "Tidak Worth It";
  }

  // Fallback: score-based
  if (overallResult >= 8) return "Worth It";
  if (overallResult >= 6) return "Pertimbangkan";
  return "Tidak Worth It";
}

// ─── Sample Decision Engine ───────────────────────────────────────────────────
function calcSampleDecision(
  worthIt: string,
  overallResult: number,
  gmv: number,
): string {
  if (worthIt !== "Worth It") return "Tidak Layak";
  if (overallResult >= 10 || (overallResult >= 8 && gmv >= 100_000_000)) return "Layak Sample 2";
  if (overallResult >= 8) return "Layak Sample 1";
  return "Tidak Layak";
}

// ─── Main scoring function ────────────────────────────────────────────────────
export async function calcListingScore(input: ScoreInput): Promise<ScoreOutput> {
  const thresholds = await loadThresholds();

  const skorGmv   = scoreFromThreshold(input.gmvPer30Hari,     thresholds.gmv);
  const skorQty   = scoreFromThreshold(input.qtyProdukTerjual,  thresholds.qty);
  const skorViews = scoreFromThreshold(input.rataRataViews,     thresholds.views);

  // Content quality with weights: visual 35%, describe 40%, audio 25%
  const qVisual   = QUALITY_MAP[input.kejelasanGambar]   ?? 0;
  const qDescribe = QUALITY_MAP[input.visualisasiProduk] ?? 0;
  const qAudio    = QUALITY_MAP[input.audioSuara]        ?? 0;

  let skorKualitas = 0;
  if (qVisual > 0 || qDescribe > 0 || qAudio > 0) {
    skorKualitas = qVisual * 0.35 + qDescribe * 0.40 + qAudio * 0.25;
  }

  // Overall: (gmv*0.45 + qty*0.25 + views*0.10 + kualitas*0.20) * 10/3
  const overallResult = parseFloat(
    ((skorGmv * 0.45 + skorQty * 0.25 + skorViews * 0.10 + skorKualitas * 0.20) * (10 / 3)).toFixed(2)
  );

  const worthIt        = calcWorthIt(input.jenisVisualTake, input.qtyVideoPerProduk, input.gmvPer30Hari, overallResult);
  const sampleDecision = calcSampleDecision(worthIt, overallResult, input.gmvPer30Hari);

  return { skorGmv, skorQty, skorViews, skorKualitas, overallResult, worthIt, sampleDecision };
}
