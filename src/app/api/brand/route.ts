import { NextResponse } from "next/server";
import { getBrandConfig, saveBrandConfig } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getBrandConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: Request) {
  const body = await req.json();
  await saveBrandConfig(body);
  return NextResponse.json({ ok: true });
}
