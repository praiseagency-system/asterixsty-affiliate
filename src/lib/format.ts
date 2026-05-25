export function formatRupiah(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} Jt`;
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} rb`;
  return `Rp ${value.toLocaleString("id-ID")}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("id-ID");
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// CTR is stored as a plain percentage number (e.g. 13 = 13%), not a decimal.
export function formatCtr(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

export function getTierBadge(gmv: number): { tier: string; program: string } {
  if (gmv >= 10_000_000) return { tier: "A", program: "Elite" };
  if (gmv >= 5_000_000) return { tier: "B", program: "Growth" };
  return { tier: "C", program: "Entry" };
}

export function getStatusInfo(score: number): { label: string; action: string; color: string } {
  if (score >= 8) return { label: "⭐ SCALE", action: "Prioritas sample & boost", color: "text-yellow-600 bg-yellow-50" };
  if (score >= 5) return { label: "📈 PUSH", action: "Follow up aktif", color: "text-blue-600 bg-blue-50" };
  return { label: "👀 MONITOR", action: "Evaluasi konten", color: "text-gray-600 bg-gray-100" };
}

export function calcScore(data: {
  gmvPer30Hari: number;
  qtyProdukTerjual: number;
  rataRataViews: number;
  kejelasanGambar?: string;
  visualisasiProduk?: string;
  audioSuara?: string;
}): { skorGmv: number; skorQty: number; skorViews: number; skorKualitas: number; overall: number } {
  const kualitasMap: Record<string, number> = {
    "Sangat Bagus": 3,
    "Bagus": 2,
    "Kurang": 1,
  };

  const skorGmv =
    data.gmvPer30Hari >= 10_000_000 ? 3 :
    data.gmvPer30Hari >= 5_000_000 ? 3 :
    data.gmvPer30Hari >= 1_000_000 ? 3 :
    data.gmvPer30Hari >= 300_000 ? 2 :
    data.gmvPer30Hari >= 50_000 ? 1 : 0;

  const skorQty =
    data.qtyProdukTerjual >= 100 ? 3 :
    data.qtyProdukTerjual >= 50 ? 2 :
    data.qtyProdukTerjual >= 1 ? 1 : 0;

  const skorViews =
    data.rataRataViews >= 50_000 ? 3 :
    data.rataRataViews >= 10_000 ? 3 :
    data.rataRataViews >= 5_000 ? 3 :
    data.rataRataViews >= 1_000 ? 2 : 1;

  const k1 = kualitasMap[data.kejelasanGambar ?? ""] ?? 0;
  const k2 = kualitasMap[data.visualisasiProduk ?? ""] ?? 0;
  const k3 = kualitasMap[data.audioSuara ?? ""] ?? 0;
  const totalK = (k1 > 0 || k2 > 0 || k3 > 0) ? ((k1 + k2 + k3) / 3) : 0;
  const skorKualitas = totalK;

  const overall = skorGmv + skorQty + skorViews + skorKualitas;

  return { skorGmv, skorQty, skorViews, skorKualitas, overall };
}
