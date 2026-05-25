import { NextResponse } from "next/server";
import { processWaQueue } from "@/lib/wa-queue-processor";

export const dynamic = "force-dynamic";

// POST /api/wa-queue/process?limit=1
// Processes up to `limit` pending WA messages.
// Uses respectDelay=false (client controls timing by calling multiple times).
export async function POST(req: Request) {
  const url   = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1"), 5);

  try {
    const result = await processWaQueue(limit, false);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST wa-queue/process]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
