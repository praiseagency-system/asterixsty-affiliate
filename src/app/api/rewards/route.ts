import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/rewards?campaignId=&status=&username=
export async function GET(req: Request) {
  const url        = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId") || "";
  const status     = url.searchParams.get("status")     || "";
  const username   = url.searchParams.get("username")   || "";

  try {
    const where: Record<string, unknown> = {};
    if (campaignId) where.campaignId     = Number(campaignId);
    if (status)     where.status         = status;
    if (username)   where.tiktokUsername = { contains: username };

    const distributions = await prisma.rewardDistribution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { campaign: { select: { id: true, nama: true } } },
    });
    return NextResponse.json(distributions);
  } catch (err) {
    console.error("[GET rewards]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/rewards — create reward distribution entry
export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const dist = await prisma.rewardDistribution.create({
      data: {
        campaignId:    Number(body.campaignId),
        tiktokUsername: String(body.tiktokUsername || "").trim(),
        namaAffiliate: String(body.namaAffiliate   || "").trim(),
        rewardType:    String(body.rewardType       || "").trim(),
        rewardLabel:   String(body.rewardLabel      || "").trim(),
        amount:        Number(body.amount)           || 0,
        status:        String(body.status            || "Pending"),
        notes:         String(body.notes             || "").trim(),
      },
    });
    return NextResponse.json(dist, { status: 201 });
  } catch (err) {
    console.error("[POST rewards]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
