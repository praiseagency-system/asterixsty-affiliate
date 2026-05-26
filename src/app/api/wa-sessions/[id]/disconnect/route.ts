import { NextResponse } from "next/server";
import { disconnectMultiSession } from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

// POST /api/wa-sessions/[id]/disconnect — all sessions use multi-client
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  try {
    // disconnectMultiSession handles DB update + socket cleanup for all sessions
    await disconnectMultiSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[POST wa-sessions/${id}/disconnect]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
