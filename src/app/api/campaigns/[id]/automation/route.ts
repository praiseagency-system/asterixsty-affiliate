import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const c = await prisma.campaign.findUnique({
      where:  { id: Number(id) },
      select: { automationConfig: true, approvalMode: true },
    });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let config = {};
    try { config = JSON.parse(c.automationConfig); } catch { /* ignore */ }
    return NextResponse.json({ config, approvalMode: c.approvalMode });
  } catch (err) {
    console.error("[GET automation]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if ("automationConfig" in body) {
      patch.automationConfig = typeof body.automationConfig === "string"
        ? body.automationConfig
        : JSON.stringify(body.automationConfig);
    }
    if ("approvalMode" in body) patch.approvalMode = String(body.approvalMode);
    const updated = await prisma.campaign.update({ where: { id: Number(id) }, data: patch });
    return NextResponse.json({ ok: true, automationConfig: updated.automationConfig, approvalMode: updated.approvalMode });
  } catch (err) {
    console.error("[PATCH automation]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
