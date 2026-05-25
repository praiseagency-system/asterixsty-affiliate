import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if ("status"       in body) data.status       = String(body.status);
    if ("totalSent"    in body) data.totalSent     = Number(body.totalSent)  || 0;
    if ("totalFailed"  in body) data.totalFailed   = Number(body.totalFailed) || 0;
    if ("sentAt"       in body) data.sentAt        = body.sentAt ? new Date(String(body.sentAt)) : null;
    if ("senderNumber" in body) data.senderNumber  = String(body.senderNumber || "").trim();
    if ("name"         in body) data.name          = String(body.name         || "").trim();

    const updated = await prisma.recruitmentBroadcast.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH broadcast]", msg);
    return NextResponse.json({ error: process.env.NODE_ENV === "development" ? `Server error: ${msg}` : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  try {
    await prisma.recruitmentBroadcast.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE broadcast]", msg);
    return NextResponse.json({ error: process.env.NODE_ENV === "development" ? `Server error: ${msg}` : "Internal server error" }, { status: 500 });
  }
}
