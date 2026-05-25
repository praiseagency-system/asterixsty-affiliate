import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getWAState } from "@/lib/wa-client";
import { getMultiSessionState, type WaMultiState } from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

function legacyStatusToMulti(status: string): WaMultiState["status"] {
  switch (status) {
    case "connected":    return "CONNECTED";
    case "connecting":   return "CONNECTING";
    case "qr_ready":     return "QR_READY";
    case "reconnecting": return "RECONNECTING";
    default:             return "DISCONNECTED";
  }
}

// GET /api/wa-sessions/[id]/status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  try {
    if (id === 1) {
      const s = getWAState();
      return NextResponse.json({
        sessionId:   1,
        status:      legacyStatusToMulti(s.status),
        qrDataUrl:   s.qrDataUrl,
        phone:       s.phone,
        connectedAt: s.connectedAt,
        error:       s.error,
      });
    }

    const mem = getMultiSessionState(id);
    if (mem) {
      return NextResponse.json(mem);
    }

    // Fallback to DB if not in memory
    const prisma  = getPrisma();
    const session = await prisma.whatsappSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      sessionId:   session.id,
      status:      session.status as WaMultiState["status"],
      qrDataUrl:   null,
      phone:       session.phone,
      connectedAt: null,
      error:       null,
    });
  } catch (err) {
    console.error(`[GET wa-sessions/${id}/status]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
