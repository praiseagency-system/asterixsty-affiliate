import { NextResponse } from "next/server";
import {
  startWorker,
  stopWorker,
  getWorkerState,
} from "@/lib/wa-queue-worker";

export const dynamic = "force-dynamic";

// GET /api/wa-queue/worker — current worker state (poll this every ~2s)
export async function GET() {
  return NextResponse.json(getWorkerState());
}

// POST /api/wa-queue/worker — start the background worker
// Body: { broadcastId?: number }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      broadcastId?: number;
    };
    const result = startWorker(body.broadcastId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST wa-queue/worker]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE /api/wa-queue/worker — request graceful stop
export async function DELETE() {
  const result = stopWorker();
  return NextResponse.json(result);
}
