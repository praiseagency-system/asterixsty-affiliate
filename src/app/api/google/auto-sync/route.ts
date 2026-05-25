import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFormResponses } from "@/lib/google-auth";

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * GET /api/google/auto-sync
 * Lightweight endpoint called by the client every 2 minutes.
 * - If Google Form is not configured/connected → returns { ok: false, reason }
 * - If last sync was < 2 minutes ago → returns { ok: true, fresh: true } (no-op)
 * - Otherwise → runs sync and returns { ok: true, synced, skipped, errors, lastSyncAt }
 *
 * This enables zero-click realtime sync: client polls, server decides when to sync.
 */
export async function GET(req: Request) {
  const url     = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "default";

  try {
    const g = await prisma.googleIntegration.findUnique({ where: { brandId } });

    // Not configured or disconnected — return early without syncing
    if (!g?.googleFormId) {
      return NextResponse.json({
        ok: false,
        reason: "form_not_configured",
        lastSyncAt: null,
      });
    }
    if (g.status !== "connected") {
      return NextResponse.json({
        ok: false,
        reason: "not_connected",
        lastSyncAt: g.lastSyncAt,
      });
    }

    // Check if a sync is needed (last sync was > SYNC_INTERVAL_MS ago)
    const lastSyncAt  = g.lastSyncAt;
    const msAgo       = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : Infinity;
    const needsSync   = msAgo > SYNC_INTERVAL_MS;

    if (!needsSync) {
      return NextResponse.json({
        ok:      true,
        fresh:   true,
        synced:  0,
        skipped: 0,
        errors:  [],
        lastSyncAt,
      });
    }

    // Run sync
    const result = await syncFormResponses(brandId);

    // Re-read lastSyncAt (updated inside syncFormResponses)
    const updated = await prisma.googleIntegration.findUnique({
      where:  { brandId },
      select: { lastSyncAt: true },
    });

    return NextResponse.json({
      ok:      true,
      fresh:   false,
      lastSyncAt: updated?.lastSyncAt ?? new Date(),
      ...result,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
