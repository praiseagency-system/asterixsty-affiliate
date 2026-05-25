import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MO_FULL_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function weekOfMonth(d: Date): number { return Math.ceil(d.getDate() / 7); }

function dayRange(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return { start: s, end: new Date(s.getTime() + 86_400_000) };
}

type KpiRow = {
  creatorUsername: string;
  affiliateGmv: number; affiliateLiveGmv: number;
  affiliateVideoGmv: number; affiliateOrders: number; estCommission: number;
};

function aggregateKpi(rows: KpiRow[]) {
  const totalGmv        = rows.reduce((s, r) => s + r.affiliateGmv, 0);
  const gmvLive         = rows.reduce((s, r) => s + r.affiliateLiveGmv, 0);
  const gmvVideo        = rows.reduce((s, r) => s + r.affiliateVideoGmv, 0);
  const totalOrders     = rows.reduce((s, r) => s + r.affiliateOrders, 0);
  const totalCommission = rows.reduce((s, r) => s + r.estCommission, 0);
  const activeSet       = new Set(rows.filter((r) => r.affiliateGmv > 50_000).map((r) => r.creatorUsername));
  const creatorAktif    = activeSet.size;
  const avgGmvPerCreator = creatorAktif > 0 ? totalGmv / creatorAktif : 0;
  return { totalGmv, gmvLive, gmvVideo, totalOrders, totalCommission, creatorAktif, avgGmvPerCreator };
}

function mapRow(r: {
  creatorUsername: string; affiliateGmv: number; affiliateLiveGmv: number;
  affiliateVideoGmv: number; affiliateOrders: number; estCommission: number;
}): KpiRow {
  return {
    creatorUsername: r.creatorUsername,
    affiliateGmv: r.affiliateGmv, affiliateLiveGmv: r.affiliateLiveGmv,
    affiliateVideoGmv: r.affiliateVideoGmv, affiliateOrders: r.affiliateOrders,
    estCommission: r.estCommission,
  };
}

async function sumHppSample(hppMap: Record<string, number>, start: Date, end: Date): Promise<number> {
  const rows = await prisma.sampleDelivery.findMany({
    where: { deletedAt: null, tanggalKirim: { gte: start, lt: end } },
    select: { produk: true, qtyProduk: true },
  });
  let total = 0;
  for (const r of rows) {
    if (r.produk) {
      const hpp = hppMap[r.produk.toLowerCase()];
      if (hpp) total += hpp * r.qtyProduk;
    }
  }
  return total;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  let year  = url.searchParams.get("year")  ? parseInt(url.searchParams.get("year")!)  : null;
  let month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : null;
  const week   = url.searchParams.get("week")   ? parseInt(url.searchParams.get("week")!)  : null;
  const yearly = url.searchParams.get("yearly") === "true";

  // Legacy ?periode=ISO compat
  const legacyPeriode = url.searchParams.get("periode");
  if (legacyPeriode && !year) {
    const d = new Date(legacyPeriode);
    year  = d.getFullYear();
    month = d.getMonth() + 1;
  }

  // ── 1. Discover available periods ──────────────────────────────────────────
  const [bulananPeriodes, minyuanPeriodes] = await Promise.all([
    prisma.dataBulanan.findMany({
      select: { periode: true },
      distinct: ["periode"],
      orderBy: { periode: "desc" },
    }),
    prisma.dataMingguan.findMany({
      select: { periode: true },
      distinct: ["periode"],
      orderBy: { periode: "asc" },
    }),
  ]);

  const availableYears = [
    ...new Set(bulananPeriodes.map((p) => p.periode.getFullYear())),
  ].sort((a, b) => b - a);

  if (!year) year = availableYears[0] ?? new Date().getFullYear();

  const availableMonths = [
    ...new Set(
      bulananPeriodes
        .filter((p) => p.periode.getFullYear() === year!)
        .map((p) => p.periode.getMonth() + 1)
    ),
  ].sort((a, b) => a - b);

  // In yearly mode, don't auto-resolve month
  if (!yearly && !month) {
    month = availableMonths[availableMonths.length - 1] ?? new Date().getMonth() + 1;
  }

  const weeksForMonth = month
    ? [
        ...new Set(
          minyuanPeriodes
            .filter(
              (p) =>
                p.periode.getFullYear() === year! &&
                p.periode.getMonth() + 1 === month!
            )
            .map((p) => weekOfMonth(p.periode))
        ),
      ].sort()
    : [];

  // ── 2. Date ranges ─────────────────────────────────────────────────────────
  const yearStart  = new Date(year!, 0, 1);
  const yearEnd    = new Date(year! + 1, 0, 1);
  const monthStart = month ? new Date(year!, month - 1, 1) : yearStart;
  const monthEnd   = month ? new Date(year!, month, 1)     : yearEnd;

  // ── 3. Mode & current KPI rows ─────────────────────────────────────────────
  const isYearlyMode = yearly;
  let isWeeklyMode = false;
  let kpiRows: KpiRow[] = [];

  if (isYearlyMode) {
    // Full year from DataBulanan
    const rows = await prisma.dataBulanan.findMany({
      where: { periode: { gte: yearStart, lt: yearEnd } },
    });
    kpiRows = rows.map(mapRow);
  } else if (week && month && weeksForMonth.includes(week)) {
    // Weekly mode: DataMingguan
    isWeeklyMode = true;
    const weekDate = minyuanPeriodes.find(
      (p) =>
        p.periode.getFullYear() === year! &&
        p.periode.getMonth() + 1 === month! &&
        weekOfMonth(p.periode) === week
    )?.periode;
    if (weekDate) {
      const { start, end } = dayRange(weekDate);
      const rows = await prisma.dataMingguan.findMany({ where: { periode: { gte: start, lt: end } } });
      kpiRows = rows.map(mapRow);
    }
  } else {
    // Monthly mode: DataBulanan
    const rows = await prisma.dataBulanan.findMany({
      where: { periode: { gte: monthStart, lt: monthEnd } },
    });
    kpiRows = rows.map(mapRow);
  }

  // ── 4. Previous period rows ────────────────────────────────────────────────
  let prevKpiRows: KpiRow[] = [];
  let comparisonLabel = "";
  let prevSampleStart = monthStart;
  let prevSampleEnd   = monthEnd;

  if (isYearlyMode) {
    const pStart = new Date(year! - 1, 0, 1);
    const pEnd   = new Date(year!, 0, 1);
    const rows   = await prisma.dataBulanan.findMany({ where: { periode: { gte: pStart, lt: pEnd } } });
    prevKpiRows     = rows.map(mapRow);
    comparisonLabel = `vs ${year! - 1}`;
    prevSampleStart = pStart;
    prevSampleEnd   = pEnd;
  } else if (isWeeklyMode && week && month) {
    // Find week immediately before current in minyuanPeriodes
    const curWeekDate = minyuanPeriodes.find(
      (p) =>
        p.periode.getFullYear() === year! &&
        p.periode.getMonth() + 1 === month &&
        weekOfMonth(p.periode) === week
    )?.periode;
    const prevWeekDate = curWeekDate
      ? minyuanPeriodes
          .map((p) => p.periode)
          .filter((d) => d < curWeekDate)
          .sort((a, b) => b.getTime() - a.getTime())[0]
      : undefined;
    if (prevWeekDate) {
      const { start, end } = dayRange(prevWeekDate);
      const rows = await prisma.dataMingguan.findMany({ where: { periode: { gte: start, lt: end } } });
      prevKpiRows = rows.map(mapRow);
      const pWk = weekOfMonth(prevWeekDate);
      const pMo = prevWeekDate.getMonth() + 1;
      const pYr = prevWeekDate.getFullYear();
      comparisonLabel = (pMo !== month || pYr !== year)
        ? `vs Week ${pWk} · ${MO_FULL_ID[pMo - 1]} ${pYr}`
        : `vs Week ${pWk}`;
      prevSampleStart = new Date(pYr, pMo - 1, 1);
      prevSampleEnd   = new Date(pYr, pMo, 1);
    }
  } else if (month) {
    // Previous calendar month
    const pYear  = month === 1 ? year! - 1 : year!;
    const pMonth = month === 1 ? 12 : month - 1;
    const pStart = new Date(pYear, pMonth - 1, 1);
    const pEnd   = new Date(pYear, pMonth, 1);
    const rows   = await prisma.dataBulanan.findMany({ where: { periode: { gte: pStart, lt: pEnd } } });
    prevKpiRows     = rows.map(mapRow);
    comparisonLabel = `vs ${MO_FULL_ID[pMonth - 1]} ${pYear}`;
    prevSampleStart = pStart;
    prevSampleEnd   = pEnd;
  }

  // ── 5. Aggregate KPIs ──────────────────────────────────────────────────────
  const kpi     = aggregateKpi(kpiRows);
  const prevKpi = aggregateKpi(prevKpiRows);

  // ── 6. Top 10 ──────────────────────────────────────────────────────────────
  const gmvByCreator: Record<string, number> = {};
  for (const r of kpiRows) {
    gmvByCreator[r.creatorUsername] = (gmvByCreator[r.creatorUsername] ?? 0) + r.affiliateGmv;
  }
  const top10Raw = Object.entries(gmvByCreator).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // ── 7. Hall of Fame ────────────────────────────────────────────────────────
  const allBulanan = await prisma.dataBulanan.findMany({
    select: { creatorUsername: true, affiliateGmv: true },
  });
  const lifetimeGmv: Record<string, number> = {};
  for (const r of allBulanan) {
    lifetimeGmv[r.creatorUsername] = (lifetimeGmv[r.creatorUsername] ?? 0) + r.affiliateGmv;
  }
  const hofRaw = Object.entries(lifetimeGmv).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // ── 8. Visual Take lookup ──────────────────────────────────────────────────
  const usernamesForVT = [...new Set([...top10Raw.map(([u]) => u), ...hofRaw.map(([u]) => u)])];
  const vtRows = await prisma.databaseAffiliate.findMany({
    where: { tiktokUsername: { in: usernamesForVT } },
    select: { tiktokUsername: true, visualTake: true },
  });
  const vtMap: Record<string, string> = {};
  for (const r of vtRows) { if (r.visualTake) vtMap[r.tiktokUsername] = r.visualTake; }

  const top10 = top10Raw.map(([username, affiliateGmv]) => ({
    creatorUsername: username, affiliateGmv, visualTake: vtMap[username] ?? "",
  }));
  const hallOfFame = hofRaw.map(([username, gmv]) => ({
    username, gmv, visualTake: vtMap[username] ?? "",
  }));

  // ── 9. Trend (monthly, scoped to selected year) ────────────────────────────
  const trend = await prisma.dataBulanan.groupBy({
    by: ["periode"],
    _sum: { affiliateGmv: true, affiliateLiveGmv: true, affiliateVideoGmv: true, affiliateOrders: true },
    _count: { creatorUsername: true },
    where: { periode: { gte: yearStart, lt: yearEnd } },
    orderBy: { periode: "asc" },
  });

  // ── 10. Financial ──────────────────────────────────────────────────────────
  const products = await prisma.product.findMany();
  const hppMap: Record<string, number> = {};
  for (const p of products) hppMap[p.nama.toLowerCase()] = p.hpp;

  const hppCurrent = await sumHppSample(hppMap, monthStart, monthEnd);
  const curBiaya   = kpi.totalCommission + hppCurrent;
  const financial  = {
    totalCommission: kpi.totalCommission,
    totalHppSample:  hppCurrent,
    totalBiayaMarketing: curBiaya,
    acos: kpi.totalGmv > 0 ? (curBiaya / kpi.totalGmv) * 100 : 0,
    roi:  curBiaya    > 0  ? (kpi.totalGmv / curBiaya)  * 100 : 0,
  };

  let prevFinancial = null;
  if (comparisonLabel) {
    const hppPrev  = await sumHppSample(hppMap, prevSampleStart, prevSampleEnd);
    const prevBiaya = prevKpi.totalCommission + hppPrev;
    prevFinancial = {
      totalCommission: prevKpi.totalCommission,
      totalHppSample:  hppPrev,
      totalBiayaMarketing: prevBiaya,
      acos: prevKpi.totalGmv > 0 ? (prevBiaya / prevKpi.totalGmv) * 100 : 0,
      roi:  prevBiaya        > 0 ? (prevKpi.totalGmv / prevBiaya)  * 100 : 0,
    };
  }

  // ── 11. Funnel ─────────────────────────────────────────────────────────────
  const [listingBulanIni, totalDatabase, databaseAktif] = await Promise.all([
    prisma.listingAffiliate.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.databaseAffiliate.count(),
    prisma.databaseAffiliate.count({ where: { status: "Aktif" } }),
  ]);

  return NextResponse.json({
    kpi, prevKpi, comparisonLabel,
    top10, trend, hallOfFame,
    financial, prevFinancial,
    isWeeklyMode, isYearlyMode,
    funnel: { listingBulanIni, totalDatabase, databaseAktif },
    selectedYear:   year,
    selectedMonth:  month,   // null when isYearlyMode
    selectedWeek:   week,
    availableYears,
    availableMonths,
    availableWeeks: weeksForMonth,
    periodes: bulananPeriodes.map((p) => p.periode),
  });
}
