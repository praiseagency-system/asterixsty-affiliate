import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ rewardId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { rewardId } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("status" in body) data.status  = String(body.status);
    if ("notes"  in body) data.notes   = String(body.notes || "").trim();
    if ("amount" in body) data.amount  = Number(body.amount) || 0;
    if (body.status === "Paid")  data.paidAt = new Date();
    if (body.status !== "Paid")  data.paidAt = null;

    const updated = await prisma.rewardDistribution.update({
      where: { id: Number(rewardId) },
      data,
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH reward]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { rewardId } = await params;
  await prisma.rewardDistribution.delete({ where: { id: Number(rewardId) } });
  return NextResponse.json({ ok: true });
}
