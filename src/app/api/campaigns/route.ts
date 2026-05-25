import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeRewardPool(rewardConfigStr: string): number {
  try {
    const c = JSON.parse(rewardConfigStr) as {
      leaderboard?: Array<{ reward?: number }>;
      consistency?: { enabled?: boolean; rewardAmount?: number };
      milestones?:  Array<{ reward?: number }>;
    };
    let total = 0;
    if (Array.isArray(c.leaderboard))
      total += c.leaderboard.reduce((s, r) => s + (r.reward ?? 0), 0);
    if (c.consistency?.enabled)
      total += c.consistency.rewardAmount ?? 0;
    if (Array.isArray(c.milestones))
      total += c.milestones.reduce((s, m) => s + (m.reward ?? 0), 0);
    return total;
  } catch { return 0; }
}

const picSelect = { select: { id: true, nama: true } } as const;
const productFocusInclude = {
  include: { product: { select: { id: true, nama: true } } },
} as const;

// GET /api/campaigns — list all (non-deleted) campaigns with computed fields
export async function GET(req: Request) {
  const prisma = getPrisma();
  try {
    const url       = new URL(req.url);
    const status    = url.searchParams.get("status") || "";
    const templates = url.searchParams.get("templates") === "1";

    const where: Record<string, unknown> = { deletedAt: null };
    if (status) where.status = status;
    where.isTemplate = templates;

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        picSpecialist: picSelect,
        participants:  {
          where:  { status: "Active" },
          select: { videoCount: true, gmvContributed: true },
        },
        productFocus: productFocusInclude,
      },
    });

    const result = campaigns.map((c) => ({
      ...c,
      totalParticipants: c.participants.length,
      totalVideos:       c.participants.reduce((s, p) => s + p.videoCount, 0),
      totalGmv:          c.participants.reduce((s, p) => s + p.gmvContributed, 0),
      totalRewardPool:   computeRewardPool(c.rewardConfig),
      participants:      undefined,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/campaigns]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/campaigns — create a new campaign
export async function POST(req: Request) {
  const prisma = getPrisma();
  try {
    const body = await req.json() as Record<string, unknown>;

    const nama = String(body.nama || "").trim();
    if (!nama) {
      return NextResponse.json({ error: "Nama campaign wajib diisi" }, { status: 400 });
    }

    const toJsonStr = (v: unknown, fallback = "[]"): string => {
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return JSON.stringify(v);
      return fallback;
    };

    const picSpecialistId = body.picSpecialistId != null && body.picSpecialistId !== ""
      ? Number(body.picSpecialistId)
      : null;

    // productFocusIds — array of product IDs to associate
    const productFocusIds: number[] = Array.isArray(body.productFocusIds)
      ? (body.productFocusIds as unknown[]).map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];

    const campaign = await prisma.campaign.create({
      data: {
        nama,
        slug:                String(body.slug || "").trim(),
        objectives:          toJsonStr(body.objectives),
        deskripsi:           String(body.deskripsi || "").trim(),
        bannerPath:          String(body.bannerPath || "").trim(),
        status:              String(body.status || "Draft"),
        visibility:          String(body.visibility || "Public"),
        affiliateCategories: toJsonStr(body.affiliateCategories),
        visualTake:          toJsonStr(body.visualTake),
        startDate:           body.startDate ? new Date(String(body.startDate)) : null,
        endDate:             body.endDate   ? new Date(String(body.endDate))   : null,
        rewardConfig:        toJsonStr(body.rewardConfig, "{}"),
        rewardDeskripsi:     String(body.rewardDeskripsi || "").trim(),
        maxParticipants:     Number(body.maxParticipants) || 0,
        picSpecialistId:     picSpecialistId && !isNaN(picSpecialistId) ? picSpecialistId : null,
        catatan:             String(body.catatan || "").trim(),
        isTemplate:          body.isTemplate === true || body.isTemplate === "true",
        productFocus: productFocusIds.length > 0
          ? { create: productFocusIds.map((pid) => ({ productId: pid })) }
          : undefined,
      },
      include: {
        picSpecialist: picSelect,
        productFocus: productFocusInclude,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error("[POST /api/campaigns]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
