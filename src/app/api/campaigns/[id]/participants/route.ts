import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id }  = await params;
  const url     = new URL(req.url);
  const search  = url.searchParams.get("search")     || "";
  const status  = url.searchParams.get("status")     || "";
  const cat     = url.searchParams.get("category")   || "";
  const spec    = url.searchParams.get("specialist") || "";
  const vt      = url.searchParams.get("visualTake") || "";
  try {
    const where: Record<string, unknown> = { campaignId: Number(id) };
    if (status) where.status     = status;
    if (cat)    where.category   = cat;
    if (spec)   where.specialist = spec;
    if (vt)     where.visualTake = vt;
    if (search) where.OR = [{ tiktokUsername: { contains: search } }, { namaAffiliate: { contains: search } }];
    const participants = await prisma.campaignParticipant.findMany({ where, orderBy: { joinedAt: "desc" } });
    return NextResponse.json(participants);
  } catch (err) {
    console.error("[GET participants]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const username = String(body.tiktokUsername || "").trim();
    if (!username) return NextResponse.json({ error: "tiktokUsername is required" }, { status: 400 });
    const campaign = await prisma.campaign.findUnique({ where: { id: Number(id) }, select: { approvalMode: true } });
    const initialStatus = campaign?.approvalMode === "Manual" ? "Pending" : "Active";
    const participant = await prisma.campaignParticipant.create({
      data: {
        campaignId: Number(id),
        tiktokUsername: username,
        namaAffiliate: String(body.namaAffiliate || "").trim(),
        whatsapp:      String(body.whatsapp       || "").trim(),
        category:      String(body.category       || "").trim(),
        specialist:    String(body.specialist     || "").trim(),
        visualTake:    String(body.visualTake     || "").trim(),
        status:        initialStatus,
      },
    });
    return NextResponse.json(participant, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: "Affiliator sudah terdaftar" }, { status: 409 });
    console.error("[POST participants]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
