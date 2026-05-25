import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStatusInfo } from "@/lib/format";
import { getTierBadgeDB, getScoreDB } from "@/lib/tier";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periode = url.searchParams.get("periode");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const search = url.searchParams.get("search") || "";
  const filterTier = url.searchParams.get("tier") || "";
  const filterStatus = url.searchParams.get("status") || "";
  const filterProgram = url.searchParams.get("program") || "";
  const gmvMin = parseFloat(url.searchParams.get("gmvMin") || "0") || 0;
  const gmvMax = parseFloat(url.searchParams.get("gmvMax") || "0") || 0;

  const periodes = await prisma.dataBulanan.findMany({
    select: { periode: true },
    distinct: ["periode"],
    orderBy: { periode: "desc" },
  });

  let targetPeriode = periodes[0]?.periode;
  if (periode) targetPeriode = new Date(periode);

  if (!targetPeriode) return NextResponse.json({ items: [], total: 0, periodes: [], summary: null });

  const start = new Date(targetPeriode.getFullYear(), targetPeriode.getMonth(), 1);
  const end = new Date(targetPeriode.getFullYear(), targetPeriode.getMonth() + 1, 1);

  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const prevEnd = new Date(start);

  const [currentData, prevData, dbAffiliates, sampleDeliveries] = await Promise.all([
    prisma.dataBulanan.findMany({ where: { periode: { gte: start, lt: end }, affiliateGmv: { gt: 50_000 } } }),
    prisma.dataBulanan.findMany({ where: { periode: { gte: prevStart, lt: prevEnd }, affiliateGmv: { gt: 50_000 } } }),
    prisma.databaseAffiliate.findMany({
      select: { tiktokUsername: true, namaAffiliator: true, samplePertama: true, tanggalKirimSample: true, affiliateSpecialist: true },
    }),
    prisma.sampleDelivery.findMany({
      where: { deletedAt: null },
      select: { affiliateUsername: true, produk: true },
      orderBy: { tanggalKirim: "asc" },
    }),
  ]);

  // Build map: username (lowercase) → unique product names in order
  const sampleMap: Record<string, string[]> = {};
  for (const d of sampleDeliveries) {
    const key = d.affiliateUsername.toLowerCase();
    if (!sampleMap[key]) sampleMap[key] = [];
    if (d.produk && !sampleMap[key].includes(d.produk)) sampleMap[key].push(d.produk);
  }

  const prevMap: Record<string, (typeof prevData)[0]> = {};
  for (const r of prevData) prevMap[r.creatorUsername] = r;

  const dbMap: Record<string, (typeof dbAffiliates)[0]> = {};
  for (const a of dbAffiliates) dbMap[a.tiktokUsername.toLowerCase()] = a;

  const rawRows = await Promise.all(
    currentData.map(async (r) => {
      const prev = prevMap[r.creatorUsername];
      const deltaGmv = prev ? r.affiliateGmv - prev.affiliateGmv : null;
      const { tier, label: program, color: tierColor } = await getTierBadgeDB(r.affiliateGmv);
      const score = await getScoreDB({
        gmv: r.affiliateGmv,
        itemsSold: r.itemsSold,
        videos: r.affiliateShoppableVideos,
        liveStreams: r.affiliateLiveStreams,
      });
      const status = getStatusInfo(score);
      const db = dbMap[r.creatorUsername.toLowerCase()];
      return {
        username: r.creatorUsername,
        followers: r.affiliateFollowers,
        gmvTotal: r.affiliateGmv,
        deltaGmv,
        deltaLive: prev ? r.affiliateLiveGmv - prev.affiliateLiveGmv : null,
        deltaVideo: prev ? r.affiliateVideoGmv - prev.affiliateVideoGmv : null,
        deltaOrders: prev ? r.affiliateOrders - prev.affiliateOrders : null,
        deltaItems: prev ? r.itemsSold - prev.itemsSold : null,
        deltaLiveStreams: prev ? r.affiliateLiveStreams - prev.affiliateLiveStreams : null,
        deltaVideos: prev ? r.affiliateShoppableVideos - prev.affiliateShoppableVideos : null,
        gmvLive: r.affiliateLiveGmv,
        gmvVideo: r.affiliateVideoGmv,
        orders: r.affiliateOrders,
        itemsSold: r.itemsSold,
        liveStreams: r.affiliateLiveStreams,
        videos: r.affiliateShoppableVideos,
        ctr: r.ctr,
        avgOrder: r.avgOrderValue,
        tier,
        tierColor,
        program,
        score,
        status: status.label,
        statusColor: status.color,
        saranProgram: program,
        pic: db?.affiliateSpecialist || "",
        inDatabase: !!db,
        sampleTerkirim: !!(db?.samplePertama),
        tglKirimSample: db?.tanggalKirimSample ?? null,
        produkSample: db?.samplePertama || "",
        sampleProducts: sampleMap[r.creatorUsername.toLowerCase()] ?? [],
        no: 0,
      };
    })
  );

  let rows = rawRows;

  // Filters
  if (search) rows = rows.filter((r) => r.username.toLowerCase().includes(search.toLowerCase()));
  if (filterTier) rows = rows.filter((r) => r.tier === filterTier);
  if (filterProgram) rows = rows.filter((r) => r.program === filterProgram);
  if (filterStatus) rows = rows.filter((r) => r.status.includes(filterStatus));
  if (gmvMin > 0) rows = rows.filter((r) => r.gmvTotal >= gmvMin);
  if (gmvMax > 0) rows = rows.filter((r) => r.gmvTotal <= gmvMax);

  rows.sort((a, b) => b.gmvTotal - a.gmvTotal);
  rows = rows.map((r, i) => ({ ...r, no: i + 1 }));

  const total = rows.length;
  const paginated = rows.slice((page - 1) * limit, page * limit);

  const summary = {
    totalGmv: rows.reduce((s, r) => s + r.gmvTotal, 0),
    gmvLive: rows.reduce((s, r) => s + r.gmvLive, 0),
    gmvVideo: rows.reduce((s, r) => s + r.gmvVideo, 0),
    creatorAktif: rows.filter((r) => r.gmvTotal > 0).length,
    totalOrders: rows.reduce((s, r) => s + r.orders, 0),
  };

  const prevSummary = prevData.length > 0 ? {
    totalGmv: prevData.reduce((s, r) => s + r.affiliateGmv, 0),
    gmvLive: prevData.reduce((s, r) => s + r.affiliateLiveGmv, 0),
    gmvVideo: prevData.reduce((s, r) => s + r.affiliateVideoGmv, 0),
    creatorAktif: prevData.length,
    totalOrders: prevData.reduce((s, r) => s + r.affiliateOrders, 0),
  } : null;

  return NextResponse.json({
    items: paginated,
    total,
    summary,
    prevSummary,
    periodes: periodes.map((p) => p.periode),
  });
}
