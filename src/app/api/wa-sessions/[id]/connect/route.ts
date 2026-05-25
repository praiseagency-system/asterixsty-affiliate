import { NextResponse } from "next/server";
import { connectWA, getWAState } from "@/lib/wa-client";
import { connectMultiSession, getMultiSessionState, type WaMultiState } from "@/lib/wa-multi-client";

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

// POST /api/wa-sessions/[id]/connect
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  try {
    if (id === 1) {
      await connectWA();
      await new Promise<void>((r) => setTimeout(r, 300));
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

    await connectMultiSession(id);
    await new Promise<void>((r) => setTimeout(r, 300));
    const state = getMultiSessionState(id);
    return NextResponse.json(state ?? { sessionId: id, status: "DISCONNECTED", qrDataUrl: null, phone: null, connectedAt: null, error: null });
  } catch (err) {
    console.error(`[POST wa-sessions/${id}/connect]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
