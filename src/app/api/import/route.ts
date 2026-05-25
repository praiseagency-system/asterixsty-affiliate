import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periode = url.searchParams.get("periode") || "";
  const type = url.searchParams.get("type") || "bulanan";

  if (!periode) return NextResponse.json({ count: 0 });

  const periodeDate = new Date(periode);
  const start = new Date(periodeDate.getFullYear(), periodeDate.getMonth(), 1);
  const end = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 1);
  // For mingguan: match by exact day (±1 day range); for bulanan: match by month
  const weekEnd = new Date(periodeDate.getTime() + 24 * 60 * 60 * 1000);

  const count = type === "mingguan"
    ? await prisma.dataMingguan.count({ where: { periode: { gte: periodeDate, lt: weekEnd } } })
    : await prisma.dataBulanan.count({ where: { periode: { gte: start, lt: end } } });

  return NextResponse.json({ count });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type, periode, rows, mode = "replace" } = body as {
    type: "mingguan" | "bulanan";
    periode: string;
    rows: Record<string, string | number>[];
    mode?: "replace" | "merge";
  };

  if (!type || !periode || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const periodeDate = new Date(periode);
  const start = new Date(periodeDate.getFullYear(), periodeDate.getMonth(), 1);
  const end = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 1);
  const weekEnd = new Date(periodeDate.getTime() + 24 * 60 * 60 * 1000);

  const num = (v: unknown) => Number(v ?? 0) || 0;
  const int = (v: unknown) => Math.round(num(v));

  const mapped = rows.map((r) => ({
    periode: periodeDate,
    creatorUsername: String(r["Creator username"] || r["creatorUsername"] || ""),
    affiliateGmv: num(r["Affiliate GMV"] ?? r["affiliateGmv"]),
    affiliateLiveGmv: num(r["Affiliate LIVE GMV"] ?? r["affiliateLiveGmv"]),
    affiliateVideoGmv: num(r["Affiliate shoppable video GMV"] ?? r["affiliateVideoGmv"]),
    affiliateProductCardGmv: num(r["Affiliate product card GMV"]),
    affiliateProductsSold: int(r["Affiliate products sold"]),
    itemsSold: int(r["Items sold"] ?? r["itemsSold"]),
    estCommission: num(r["Est. commission"] ?? r["estCommission"]),
    avgOrderValue: num(r["Avg. order value"] ?? r["avgOrderValue"]),
    affiliateOrders: int(r["Affiliate orders"] ?? r["affiliateOrders"]),
    ctr: num(r["CTR"] ?? r["ctr"]),
    productImpressions: int(r["Product impressions"]),
    affiliateLiveStreams: int(r["Affiliate LIVE streams"] ?? r["affiliateLiveStreams"]),
    affiliateShoppableVideos: int(r["Affiliate shoppable videos"] ?? r["affiliateShoppableVideos"]),
    openCollabGmv: num(r["Open collaboration GMV"]),
    affiliateRefundedGmv: num(r["Affiliate refunded GMV"]),
    affiliateItemsRefunded: int(r["Affiliate items refunded"]),
    affiliateFollowers: int(r["Affiliate followers"] ?? r["affiliateFollowers"]),
  })).filter((r) => r.creatorUsername && r.creatorUsername !== "Creator username");

  let deleted = 0;
  if (mode === "replace") {
    if (type === "mingguan") {
      const result = await prisma.dataMingguan.deleteMany({ where: { periode: { gte: periodeDate, lt: weekEnd } } });
      deleted = result.count;
    } else {
      const result = await prisma.dataBulanan.deleteMany({ where: { periode: { gte: start, lt: end } } });
      deleted = result.count;
    }
  }

  const CHUNK = 100;
  try {
    if (type === "mingguan") {
      for (let i = 0; i < mapped.length; i += CHUNK)
        await prisma.dataMingguan.createMany({ data: mapped.slice(i, i + CHUNK) });
    } else {
      for (let i = 0; i < mapped.length; i += CHUNK)
        await prisma.dataBulanan.createMany({ data: mapped.slice(i, i + CHUNK) });
    }
  } catch (err) {
    console.error("Import createMany error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ imported: mapped.length, deleted });
}
