import { NextResponse } from "next/server";
import { getOAuthUrl, isConfigured } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// GET /api/google/auth → returns { url } to redirect browser to for OAuth
export async function GET(req: Request) {
  const url     = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "default";

  const host      = req.headers.get("host") || "localhost:3000";
  const proto     = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/google/callback`;

  const configured = await isConfigured(brandId);
  if (!configured) {
    return NextResponse.json(
      { error: "Google credentials not configured. Please save Client ID and Secret first." },
      { status: 400 },
    );
  }

  try {
    const oauthUrl = await getOAuthUrl(redirectUri, brandId);
    return NextResponse.json({ url: oauthUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
