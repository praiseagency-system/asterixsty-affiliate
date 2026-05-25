import { NextResponse } from "next/server";
import { connectWA, getWAState } from "@/lib/wa-client";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await connectWA();
    // Small delay so QR state can propagate
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json(getWAState());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
