import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

// GET /api/wa-queue?broadcastId=&status=&limit=100
export async function GET(req: Request) {
  const prisma = getPrisma();
  const url         = new URL(req.url);
  const broadcastId = url.searchParams.get("broadcastId") || "";
  const status      = url.searchParams.get("status")      || "";
  const limit       = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

  try {
    const where: Record<string, unknown> = {};
    if (broadcastId) where.broadcastId = Number(broadcastId);
    if (status)      where.status      = status;

    const [items, counts] = await Promise.all([
      prisma.waMessageQueue.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: limit,
      }),
      prisma.waMessageQueue.groupBy({
        by: ["status"],
        where: broadcastId ? { broadcastId: Number(broadcastId) } : {},
        _count: { id: true },
      }),
    ]);

    const summary: Record<string, number> = {
      pending: 0, processing: 0, success: 0, failed: 0, retry: 0,
    };
    for (const c of counts) {
      summary[c.status] = (c._count as { id: number }).id;
    }

    return NextResponse.json({ items, summary });
  } catch (err) {
    console.error("[GET wa-queue]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/wa-queue?broadcastId=xx — clear queue for a broadcast
export async function DELETE(req: Request) {
  const prisma = getPrisma();
  const url         = new URL(req.url);
  const broadcastId = url.searchParams.get("broadcastId");
  try {
    if (broadcastId) {
      await prisma.waMessageQueue.deleteMany({ where: { broadcastId: Number(broadcastId) } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE wa-queue]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
