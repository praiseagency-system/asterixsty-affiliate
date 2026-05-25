import { NextResponse } from "next/server";
import { disconnectWA, getWAState } from "@/lib/wa-client";

export async function POST() {
  try {
    await disconnectWA();
    return NextResponse.json(getWAState());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
