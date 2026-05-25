import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { disconnectWA } from "@/lib/wa-client";
import { disconnectMultiSession } from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

// POST /api/wa-sessions/[id]/disconnect
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id     = Number(idStr);
  const prisma = getPrisma();

  try {
    if (id === 1) {
      await disconnectWA();
    } else {
      await disconnectMultiSession(id);
    }

    try {
      await prisma.whatsappSession.update({
        where: { id },
        data:  { status: "DISCONNECTED" },
      });
    } catch { /* session may not exist in DB */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[POST wa-sessions/${id}/disconnect]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
