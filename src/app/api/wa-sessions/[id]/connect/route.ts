import { NextResponse } from "next/server";
import { connectMultiSession, getMultiSessionState } from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

// POST /api/wa-sessions/[id]/connect — all sessions (including 1) use multi-client
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  try {
    await connectMultiSession(id);
    // Small delay so QR state can propagate
    await new Promise<void>((r) => setTimeout(r, 300));
    const state = getMultiSessionState(id);
    return NextResponse.json(
      state ?? { sessionId: id, status: "DISCONNECTED", qrDataUrl: null, phone: null, connectedAt: null, error: null }
    );
  } catch (err) {
    console.error(`[POST wa-sessions/${id}/connect]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
