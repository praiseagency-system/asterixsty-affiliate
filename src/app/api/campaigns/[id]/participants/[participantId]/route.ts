import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; participantId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { participantId } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const allowed = ["status","videoCount","views","gmvContributed","namaAffiliate","whatsapp","category","specialist","visualTake"] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!(key in body)) continue;
      if (key === "videoCount" || key === "views")   data[key] = Number(body[key]) || 0;
      else if (key === "gmvContributed")              data[key] = Number(body[key]) || 0;
      else                                            data[key] = String(body[key] ?? "").trim();
    }
    const updated = await prisma.campaignParticipant.update({ where: { id: Number(participantId) }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH participant]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { participantId } = await params;
  await prisma.campaignParticipant.delete({ where: { id: Number(participantId) } });
  return NextResponse.json({ ok: true });
}
