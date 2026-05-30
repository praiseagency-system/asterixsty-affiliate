/**
 * GET /api/scraped-orders
 *
 * Webapp-authenticated endpoint for the Scraped Orders Inbox.
 * Uses resolveWorkspaceId (X-Workspace-ID header / ?workspaceId=).
 *
 * Query params:
 *   ?group=pending|confirmed|cancelled|all   (default: pending)
 *   ?platform=tiktok|tokopedia
 *   ?page=1
 *   ?limit=20
 *
 * Status groups:
 *   pending   → SCRAPED, RESOLVING, READY_CONFIRM, FAILED, pending_confirmation
 *   confirmed → CONFIRMED, SYNCED, active
 *   cancelled → cancelled
 *   all       → no status filter
 */

import { NextResponse }         from "next/server";
import { prisma }               from "@/lib/prisma";
import { resolveWorkspaceId }   from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

const STATUS_GROUPS: Record<string, string[]> = {
  pending:   ["SCRAPED", "RESOLVING", "READY_CONFIRM", "FAILED", "pending_confirmation"],
  confirmed: ["CONFIRMED", "SYNCED", "active"],
  cancelled: ["cancelled"],
};

export async function GET(req: Request) {
  const wsId = resolveWorkspaceId(req) ?? 1;

  const url      = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get("page")    ?? "1"));
  const limit    = Math.min(100, parseInt(url.searchParams.get("limit") ?? "20"));
  const platform = url.searchParams.get("platform") ?? "";
  const group    = url.searchParams.get("group")    ?? "pending";

  const where: Record<string, unknown> = { workspaceId: wsId };
  if (group !== "all") {
    const statuses = STATUS_GROUPS[group];
    if (statuses) where.status = { in: statuses };
  }
  if (platform) where.platform = platform;

  const [total, orders] = await Promise.all([
    prisma.scrapedOrder.count({ where }),
    prisma.scrapedOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ]);

  // Enrich with DatabaseAffiliate data (status, phone, name, profile fields)
  const usernames = [...new Set(orders.map((o) => o.tiktokUsername).filter(Boolean))];
  const affiliates = usernames.length
    ? await prisma.databaseAffiliate.findMany({
        where:  { workspaceId: wsId, tiktokUsername: { in: usernames }, deletedAt: null },
        select: {
          tiktokUsername: true,
          status:         true,
          noWhatsapp:     true,
          namaAffiliator: true,
          mediaPromosiFocus: true,
          visualTake:        true,
          kategoriAffiliate: true,
        },
      })
    : [];
  const affiliateMap = Object.fromEntries(affiliates.map((a) => [a.tiktokUsername, a]));

  const data = orders.map((o) => {
    const aff = affiliateMap[o.tiktokUsername];
    return {
      ...o,
      affiliate_status:           aff?.status              ?? null,
      affiliate_phone:            aff?.noWhatsapp          ?? o.creatorPhone,
      affiliate_name:             aff?.namaAffiliator       ?? o.creatorName,
      // Pre-fill values for confirmation modal Section 2
      affiliate_mediaFocus:       aff?.mediaPromosiFocus   ?? "",
      affiliate_visualTake:       aff?.visualTake          ?? "",
      affiliate_kategoriAffiliate: aff?.kategoriAffiliate  ?? "",
    };
  });

  return NextResponse.json({ success: true, data, total });
}
