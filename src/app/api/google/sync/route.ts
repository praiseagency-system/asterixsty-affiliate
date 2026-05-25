import { NextResponse } from "next/server";
import { syncFormResponses } from "@/lib/google-auth";

// POST /api/google/sync → read Forms API responses and update submissions + checklists
export async function POST(req: Request) {
  try {
    const body    = await req.json().catch(() => ({})) as { brandId?: string };
    const brandId = (body?.brandId || "default").trim();
    const result  = await syncFormResponses(brandId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
