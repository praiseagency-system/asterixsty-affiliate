import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET — list broadcast logs for this campaign
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const logs = await prisma.broadcastLog.findMany({
      where:   { campaignId: Number(id) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(logs);
  } catch (err) {
    console.error("[GET broadcast]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create a broadcast (queued/immediate)
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json() as {
      message: string;
      targetType: string;
      scheduledAt?: string | null;
    };

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });
    }

    // Count recipients based on targetType
    const campaignId = Number(id);
    let where: Record<string, unknown> = { campaignId };
    if (body.targetType === "Active")      where.status     = "Active";
    if (body.targetType === "BelumUpload") { where.status = "Active"; where.videoCount = 0; }
    if (body.targetType === "Completed")   where.status = "Completed";

    const count = await prisma.campaignParticipant.count({ where });

    const log = await prisma.broadcastLog.create({
      data: {
        campaignId,
        message:     body.message.trim(),
        targetType:  body.targetType || "All",
        totalSent:   count,
        status:      body.scheduledAt ? "pending" : "done",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        sentAt:      body.scheduledAt ? null : new Date(),
      },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    console.error("[POST broadcast]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
