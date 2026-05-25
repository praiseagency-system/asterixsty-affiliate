import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Status computation ────────────────────────────────────────────────────
export function computeStatus(
  currentGmv: number,
  targetGmv: number,
  startDate: Date,
  endDate: Date,
  manualStatus?: string
): "UPCOMING" | "ONGOING" | "ACHIEVED" | "FAILED" | "EXPIRED" {
  if (manualStatus && ["UPCOMING","ONGOING","ACHIEVED","FAILED","EXPIRED"].includes(manualStatus)) {
    return manualStatus as "UPCOMING" | "ONGOING" | "ACHIEVED" | "FAILED" | "EXPIRED";
  }
  if (currentGmv >= targetGmv && targetGmv > 0) return "ACHIEVED";
  const now = new Date();
  if (now < startDate) return "UPCOMING";
  if (now <= endDate) return "ONGOING";
  const daysSinceEnd = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceEnd <= 30 ? "FAILED" : "EXPIRED";
}

// ─── Auto GMV from monitoring data ────────────────────────────────────────
async function fetchCurrentGmv(
  username: string,
  periodeTipe: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const where = {
    creatorUsername: username,
    periode: { gte: startDate, lte: endDate },
  };
  if (periodeTipe === "Mingguan") {
    const agg = await prisma.dataMingguan.aggregate({ where, _sum: { affiliateGmv: true } });
    return agg._sum.affiliateGmv ?? 0;
  }
  const agg = await prisma.dataBulanan.aggregate({ where, _sum: { affiliateGmv: true } });
  return agg._sum.affiliateGmv ?? 0;
}

// ─── GET /api/affiliate-program ────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const filterStatus = url.searchParams.get("status") || "";
  const filterPic    = url.searchParams.get("pic")    || "";
  const search       = url.searchParams.get("search") || "";
  const page         = parseInt(url.searchParams.get("page")  || "1");
  const limit        = parseInt(url.searchParams.get("limit") || "50");

  const programs = await prisma.affiliateProgram.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    programs.map(async (p) => {
      const currentGmv = await fetchCurrentGmv(p.tiktokUsername, p.periodeTipe, p.startDate, p.endDate);
      const status = computeStatus(currentGmv, p.targetGmv, p.startDate, p.endDate, p.manualStatus);
      const progressPct = p.targetGmv > 0 ? Math.min(100, (currentGmv / p.targetGmv) * 100) : 0;
      const now = new Date();
      const daysLeft = now <= p.endDate
        ? Math.ceil((p.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        ...p,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        agreementUploadedAt: p.agreementUploadedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        deletedAt: p.deletedAt?.toISOString() ?? null,
        currentGmv,
        status,
        progressPct,
        daysLeft,
      };
    })
  );

  let rows = enriched;
  if (search)       rows = rows.filter((r) => r.tiktokUsername.toLowerCase().includes(search.toLowerCase()) || r.namaAffiliator.toLowerCase().includes(search.toLowerCase()) || r.namaProgram.toLowerCase().includes(search.toLowerCase()));
  if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
  if (filterPic)    rows = rows.filter((r) => r.pic.toLowerCase().includes(filterPic.toLowerCase()));

  const summary = {
    totalAktif:    enriched.filter((r) => ["ONGOING","ACHIEVED"].includes(r.status)).length,
    achieved:      enriched.filter((r) => r.status === "ACHIEVED").length,
    ongoing:       enriched.filter((r) => r.status === "ONGOING").length,
    failed:        enriched.filter((r) => r.status === "FAILED").length,
    upcoming:      enriched.filter((r) => r.status === "UPCOMING").length,
    totalCashReward: enriched.filter((r) => r.status === "ACHIEVED").reduce((s, r) => s + r.benefitCash, 0),
  };

  const total     = rows.length;
  const paginated = rows.slice((page - 1) * limit, page * limit);
  return NextResponse.json({ items: paginated, total, summary });
}

// ─── POST /api/affiliate-program ───────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json();
  const {
    tiktokUsername, namaAffiliator = "", namaProgram = "",
    periodeTipe = "Bulanan", startDate, endDate,
    targetGmv = 0, targetVideo = 0, targetLive = 0, targetOrders = 0,
    benefitKomisi = "", benefitCash = 0, benefitBestSeller = false,
    benefitBonusProduk = "", benefitExclusive = false,
    pic = "", catatan = "",
  } = body;

  if (!tiktokUsername || !startDate || !endDate) {
    return NextResponse.json({ error: "tiktokUsername, startDate, endDate wajib diisi" }, { status: 400 });
  }

  const program = await prisma.affiliateProgram.create({
    data: {
      tiktokUsername, namaAffiliator, namaProgram, periodeTipe,
      startDate: new Date(startDate), endDate: new Date(endDate),
      targetGmv, targetVideo, targetLive, targetOrders,
      benefitKomisi, benefitCash, benefitBestSeller, benefitBonusProduk, benefitExclusive,
      pic, catatan,
    },
  });
  return NextResponse.json(program, { status: 201 });
}
