import { NextResponse } from "next/server";
import { getWAState } from "@/lib/wa-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getWAState();
  return NextResponse.json(state);
}
