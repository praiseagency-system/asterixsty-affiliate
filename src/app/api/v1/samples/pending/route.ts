/**
 * GET /api/v1/samples/pending
 *
 * Returns ScrapedOrders for the authenticated workspace.
 * Supports status filtering so the inbox can show all tabs.
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   ?page=1&limit=50&platform=tiktok&status=pending_confirmation
 *
 * Response 200:
 *   { success, data: EnrichedScrapedOrder[], total }
 */

import { NextResponse }   from "next/server";
import { requireLicense } from "@/lib/license-auth";
import { prisma }         from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = await requireLicense(req);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  const url      = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get("page")    ?? "1"));
  const limit    = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50"));
  const platform = url.searchParams.get("platform") ?? "";
  // Default to pending_confirmation; pass "all" to get everything
  const statusParam = url.searchParams.get("status") ?? "pending_confirmation";

  const where: Record<string, unknown> = { workspaceId: ws.id };
  if (statusParam !== "all") {
    where.status = statusParam;
  }
  if (platform) {
    where.platform = platform;
  }

  const [total, orders] = await Promise.all([
    prisma.scrapedOrder.count({ where }),
    prisma.scrapedOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
  ]);

  // Enrich with DatabaseAffiliate status where available
  const usernames = [...new Set(orders.map((o) => o.tiktokUsername).filter(Boolean))];
  const affiliates = usernames.length
    ? await prisma.databaseAffiliate.findMany({
        where:  { workspaceId: ws.id, tiktokUsername: { in: usernames }, deletedAt: null },
        select: { tiktokUsername: true, status: true, noWhatsapp: true, namaAffiliator: true },
      })
    : [];
  const affiliateMap = Object.fromEntries(affiliates.map((a) => [a.tiktokUsername, a]));

  const data = orders.map((o) => ({
    ...o,
    affiliate_status: affiliateMap[o.tiktokUsername]?.status       ?? null,
    affiliate_phone:  affiliateMap[o.tiktokUsername]?.noWhatsapp   ?? o.creatorPhone,
    affiliate_name:   affiliateMap[o.tiktokUsername]?.namaAffiliator ?? o.creatorName,
  }));

  return NextResponse.json({ success: true, data, total });
}
