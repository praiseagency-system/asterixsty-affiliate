import { NextResponse } from "next/server";
import { getValidToken, getOrCreateIntegration } from "@/lib/google-auth";

// GET /api/google/status → full connection state + config
export async function GET(req: Request) {
  const url     = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "default";

  try {
    const g = await getOrCreateIntegration(brandId);

    const hasCredentials = !!(g.clientId && g.encryptedClientSecret);

    if (!hasCredentials) {
      return NextResponse.json({
        hasCredentials: false,
        configured:     false,
        connected:      false,
        tokenExpired:   false,
        status:         g.status,
      });
    }

    if (!g.encryptedAccessToken) {
      return NextResponse.json({
        hasCredentials,
        configured:     true,
        connected:      false,
        tokenExpired:   false,
        status:         g.status,
        clientId:       g.clientId,
      });
    }

    const token       = await getValidToken(brandId);
    const tokenExpired = !token;

    let entryIds: Record<string, string> = {};
    let questionIds: Record<string, string> = {};
    try { entryIds    = JSON.parse(g.formEntryIds    || "{}"); } catch { /* ignore */ }
    try { questionIds = JSON.parse(g.formQuestionIds || "{}"); } catch { /* ignore */ }

    return NextResponse.json({
      hasCredentials,
      configured:      true,
      connected:       !!token,
      tokenExpired,
      status:          tokenExpired ? "expired" : g.status,
      email:           g.connectedEmail,
      connectedEmail:  g.connectedEmail,
      googleFormId:    g.googleFormId,
      googleFormPublicId: g.googleFormPublicId,
      googleFormTitle: g.googleFormTitle,
      googleSheetId:   g.googleSheetId,
      googleSheetName: g.googleSheetName,
      entryIds,
      questionIds,
      lastSyncAt:      g.lastSyncAt,
      connectedAt:     g.connectedAt,
      clientId:        g.clientId,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
