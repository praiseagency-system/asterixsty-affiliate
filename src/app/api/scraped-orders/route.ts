/**
 * GET /api/scraped-orders
 *
 * Webapp-authenticated endpoint for the Scraped Orders Inbox.
 * Uses resolveWorkspaceId (X-Workspace-ID header / ?workspaceId=) —
 * same pattern as other webapp routes.
 *
 * Query params:
 *   ?status=pending_confirmation|active|cancelled|all  (default: pending_confirmation)
 *   ?platform=tiktok|tokopedia
 *   ?page=1
 *   ?limit=20
 */

import { NextResponse }         from "next/server";
import { prisma }               from "@/lib/prisma";
import { resolveWorkspaceId }   from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wsId = resolveWorkspaceId(req) ?? 1;

  const url          = new URL(req.url);
  const page         = Math.max(1, parseInt(url.searchParams.get("page")    ?? "1"));
  const limit        = Math.min(100, parseInt(url.searchParams.get("limit") ?? "20"));
  const platform     = url.searchParams.get("platform") ?? "";
  const statusParam  = url.searchParams.get("status")   ?? "pending_confirmation";

  const where: Record<string, unknown> = { workspaceId: wsId };
  if (statusParam !== "all") where.status   = statusParam;
  if (platform)              where.platform = platform;

  const [total, orders] = await Promise.all([
    prisma.scrapedOrder.count({ where }),
    prisma.scrapedOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ]);

  // Enrich with DatabaseAffiliate data
  const usernames = [...new Set(orders.map((o) => o.tiktokUsername).filter(Boolean))];
  const affiliates = usernames.length
    ? await prisma.databaseAffiliate.findMany({
        where:  { workspaceId: wsId, tiktokUsername: { in: usernames }, deletedAt: null },
        select: { tiktokUsername: true, status: true, noWhatsapp: true, namaAffiliator: true },
      })
    : [];
  const affiliateMap = Object.fromEntries(affiliates.map((a) => [a.tiktokUsername, a]));

  const data = orders.map((o) => ({
    ...o,
    affiliate_status: affiliateMap[o.tiktokUsername]?.status        ?? null,
    affiliate_phone:  affiliateMap[o.tiktokUsername]?.noWhatsapp    ?? o.creatorPhone,
    affiliate_name:   affiliateMap[o.tiktokUsername]?.namaAffiliator ?? o.creatorName,
  }));

  return NextResponse.json({ success: true, data, total });
}
