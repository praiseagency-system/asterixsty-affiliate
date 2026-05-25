import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// GET /api/google/callback?code=...&state=...
// Handles Google OAuth redirect. Saves encrypted tokens and redirects to /google-integration.
export async function GET(req: Request) {
  const url     = new URL(req.url);
  const code    = url.searchParams.get("code");
  const error   = url.searchParams.get("error");
  const brandId = url.searchParams.get("state") || "default";

  const host    = req.headers.get("host") || "localhost:3000";
  const proto   = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  const redirectUri = `${baseUrl}/api/google/callback`;
  const failUrl     = `${baseUrl}/google-integration?status=error`;
  const successUrl  = `${baseUrl}/google-integration?status=success`;

  if (error || !code) {
    return NextResponse.redirect(`${failUrl}&reason=${encodeURIComponent(error || "no_code")}`);
  }

  try {
    await exchangeCode(code, redirectUri, brandId);
    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("[Google OAuth callback]", err);
    return NextResponse.redirect(`${failUrl}&reason=token_exchange`);
  }
}
