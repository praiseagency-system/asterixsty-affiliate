import { NextResponse } from "next/server";
import { processWaQueue } from "@/lib/wa-queue-processor";
import { getWorkerState } from "@/lib/wa-queue-worker";

export const dynamic = "force-dynamic";

// POST /api/wa-queue/process?limit=1&broadcastId=123
// Processes up to `limit` pending WA messages.
// Uses respectDelay=false (client controls timing via nextDelayMs in response).
// Optional broadcastId restricts processing to a single broadcast's queue.
//
// BLOCKED when the background worker is active to prevent duplicate sends.
// Use POST /api/wa-queue/worker instead to drive processing.
export async function POST(req: Request) {
  // ── Guard: block when background worker owns the queue ────────────────────
  if (getWorkerState().active) {
    return NextResponse.json(
      {
        error:
          "Background worker sedang aktif. Gunakan Queue Monitor untuk mengontrol pengiriman.",
        workerActive: true,
      },
      { status: 409 },
    );
  }

  const url         = new URL(req.url);
  const limit       = Math.min(parseInt(url.searchParams.get("limit") || "1"), 5);
  const bidRaw      = url.searchParams.get("broadcastId");
  const broadcastId = bidRaw ? parseInt(bidRaw) : undefined;

  try {
    const result = await processWaQueue(limit, false, broadcastId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST wa-queue/process]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
