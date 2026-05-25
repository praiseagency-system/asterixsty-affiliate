import { NextResponse } from "next/server";
import { syncBannerToGoogleForm } from "@/lib/google-auth";

export async function POST() {
  try {
    const result = await syncBannerToGoogleForm("default");
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
