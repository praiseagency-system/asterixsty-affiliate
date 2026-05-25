import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTierBadgeDB } from "@/lib/tier";

function dayRange(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periode = url.searchParams.get("periode"); // exact week ISO date
  const limit = parseInt(url.searchParams.get("limit") || "500");
  const search = url.searchParams.get("search") || "";
  const filterProgram = url.searchParams.get("program") || "";

  // All available week dates, sorted newest first
  const allPeriodeRows = await prisma.dataMingguan.findMany({
    select: { periode: true },
    distinct: ["periode"],
    orderBy: { periode: "desc" },
  });
  const allDates = allPeriodeRows.map((p) => p.periode);

  if (allDates.length === 0)
    return NextResponse.json({ items: [], total: 0, periodes: [], summary: null });

  // Resolve target date: find matching date from DB list
  let targetDate = allDates[0];
  if (periode) {
    const requested = new Date(periode);
    const match = allDates.find((d) => {
      // Compare year/month/day ignoring time
      return d.getFullYear() === requested.getFullYear()
        && d.getMonth() === requested.getMonth()
        && d.getDate() === requested.getDate();
    });
    if (match) targetDate = match;
  }

  // Find previous week = the period just before targetDate in the sorted list
  const targetIdx = allDates.findIndex((d) =>
    d.getFullYear() === targetDate.getFullYear()
    && d.getMonth() === targetDate.getMonth()
    && d.getDate() === targetDate.getDate()
  );
  const prevDate = targetIdx >= 0 && targetIdx + 1 < allDates.length
    ? allDates[targetIdx + 1]
    : null;

  const { start: curStart, end: curEnd } = dayRange(targetDate);
  const [currentData, prevData] = await Promise.all([
    prisma.dataMingguan.findMany({
      where: { periode: { gte: curStart, lt: curEnd }, affiliateGmv: { gt: 50_000 } },
    }),
    prevDate
      ? prisma.dataMingguan.findMany({
          where: { periode: { gte: dayRange(prevDate).start, lt: dayRange(prevDate).end } },
        })
      : Promise.resolve([]),
  ]);

  // Build prev lookup by username
  const prevMap: Record<string, (typeof prevData)[0]> = {};
  for (const r of prevData) prevMap[r.creatorUsername] = r;

  const rawRows = await Promise.all(
    currentData.map(async (r) => {
      const prev = prevMap[r.creatorUsername];
      const { label: program } = await getTierBadgeDB(r.affiliateGmv);
      return {
        username: r.creatorUsername,
        gmvTotal: r.affiliateGmv,
        deltaGmv: prev != null ? r.affiliateGmv - prev.affiliateGmv : null,
        deltaLive: prev != null ? r.affiliateLiveGmv - prev.affiliateLiveGmv : null,
        deltaVideo: prev != null ? r.affiliateVideoGmv - prev.affiliateVideoGmv : null,
        deltaOrders: prev != null ? r.affiliateOrders - prev.affiliateOrders : null,
        deltaItems: prev != null ? r.itemsSold - prev.itemsSold : null,
        deltaLiveStreams: prev != null ? r.affiliateLiveStreams - prev.affiliateLiveStreams : null,
        deltaVideos: prev != null ? r.affiliateShoppableVideos - prev.affiliateShoppableVideos : null,
        gmvLive: r.affiliateLiveGmv,
        gmvVideo: r.affiliateVideoGmv,
        orders: r.affiliateOrders,
        itemsSold: r.itemsSold,
        liveStreams: r.affiliateLiveStreams,
        videos: r.affiliateShoppableVideos,
        ctr: r.ctr,
        avgOrder: r.avgOrderValue,
        saranProgram: program,
        periode: r.periode,
        no: 0,
      };
    })
  );

  let rows = rawRows;
  if (search) rows = rows.filter((r) => r.username.toLowerCase().includes(search.toLowerCase()));
  if (filterProgram) rows = rows.filter((r) => r.saranProgram === filterProgram);

  rows.sort((a, b) => b.gmvTotal - a.gmvTotal);
  rows = rows.map((r, i) => ({ ...r, no: i + 1 }));

  const summary = {
    totalGmv: rows.reduce((s, r) => s + r.gmvTotal, 0),
    gmvLive: rows.reduce((s, r) => s + r.gmvLive, 0),
    gmvVideo: rows.reduce((s, r) => s + r.gmvVideo, 0),
    creatorAktif: rows.length,
    totalOrders: rows.reduce((s, r) => s + r.orders, 0),
  };

  const prevActive = prevData.filter((r) => r.affiliateGmv > 50_000);
  const prevSummary = prevData.length > 0 ? {
    totalGmv: prevActive.reduce((s, r) => s + r.affiliateGmv, 0),
    gmvLive: prevActive.reduce((s, r) => s + r.affiliateLiveGmv, 0),
    gmvVideo: prevActive.reduce((s, r) => s + r.affiliateVideoGmv, 0),
    creatorAktif: prevActive.length,
    totalOrders: prevActive.reduce((s, r) => s + r.affiliateOrders, 0),
  } : null;

  return NextResponse.json({
    items: rows.slice(0, limit),
    total: rows.length,
    summary,
    prevSummary,
    periodes: allDates.map((d) => d.toISOString()),
    currentPeriode: targetDate.toISOString(),
    prevPeriode: prevDate?.toISOString() ?? null,
  });
}
