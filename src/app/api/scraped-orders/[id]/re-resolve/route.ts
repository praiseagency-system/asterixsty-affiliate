/**
 * POST /api/scraped-orders/:id/re-resolve
 *
 * Resets a FAILED order back to SCRAPED so the extension can
 * attempt detail enrichment again on the next scrape session.
 */

import { NextResponse }        from "next/server";
import { prisma }              from "@/lib/prisma";
import { resolveWorkspaceId }  from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const wsId   = resolveWorkspaceId(req) ?? 1;
  const { id } = await params;

  const order = await prisma.scrapedOrder.findUnique({ where: { id: Number(id) } });
  if (!order || order.workspaceId !== wsId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (order.status !== "FAILED") {
    return NextResponse.json({ error: "Only FAILED orders can be re-resolved" }, { status: 400 });
  }

  const updated = await prisma.scrapedOrder.update({
    where: { id: Number(id) },
    data:  { status: "SCRAPED", resolveAttempts: 0, resolveError: "" },
  });

  return NextResponse.json({ success: true, data: updated });
}
