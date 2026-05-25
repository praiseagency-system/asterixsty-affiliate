import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { getOrCreateIntegration } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// GET /api/google/integration → returns integration info (no decrypted secrets)
export async function GET(req: Request) {
  const url     = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "default";

  try {
    const g = await getOrCreateIntegration(brandId);
    return NextResponse.json({
      brandId:        g.brandId,
      clientId:       g.clientId,
      hasSecret:      !!g.encryptedClientSecret,
      status:         g.status,
      connectedEmail: g.connectedEmail,
      googleFormId:   g.googleFormId,
      googleFormPublicId: g.googleFormPublicId,
      googleFormTitle: g.googleFormTitle,
      googleSheetId:  g.googleSheetId,
      googleSheetName: g.googleSheetName,
      lastSyncAt:     g.lastSyncAt,
      connectedAt:    g.connectedAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/google/integration → save clientId + encrypted clientSecret
export async function POST(req: Request) {
  try {
    const body = await req.json() as { clientId?: string; clientSecret?: string; brandId?: string };
    const brandId      = (body.brandId || "default").trim();
    const clientId     = (body.clientId || "").trim();
    const clientSecret = (body.clientSecret || "").trim();

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const data: Record<string, string> = { clientId };
    if (clientSecret) {
      data.encryptedClientSecret = await encrypt(clientSecret);
    }

    await prisma.googleIntegration.upsert({
      where:  { brandId },
      update: data,
      create: { brandId, ...data },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
