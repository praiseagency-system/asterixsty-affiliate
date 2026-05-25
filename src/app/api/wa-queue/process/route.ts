import { NextResponse } from "next/server";
import { processWaQueue } from "@/lib/wa-queue-processor";

export const dynamic = "force-dynamic";

// POST /api/wa-queue/process?limit=1&broadcastId=123
// Processes up to `limit` pending WA messages.
// Uses respectDelay=false (client controls timing via nextDelayMs in response).
// Optional broadcastId restricts processing to a single broadcast's queue.
export async function POST(req: Request) {
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
