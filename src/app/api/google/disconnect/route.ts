import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/google/disconnect → clears stored tokens, keeps credentials
export async function DELETE(req: Request) {
  const url     = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "default";

  try {
    await prisma.googleIntegration.upsert({
      where:  { brandId },
      update: {
        encryptedAccessToken:  "",
        encryptedRefreshToken: "",
        tokenExpiry:           null,
        connectedEmail:        "",
        connectedAt:           null,
        status:                "disconnected",
      },
      create: { brandId, status: "disconnected" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
