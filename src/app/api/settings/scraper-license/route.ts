/**
 * GET  /api/settings/scraper-license  — get current workspace license key info
 * POST /api/settings/scraper-license  — regenerate license key (returns new key)
 */

import { NextResponse }          from "next/server";
import { requireWorkspaceMember } from "@/lib/workspace-guard";
import { prisma }                 from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const guard = await requireWorkspaceMember(req, { minRole: "ADMIN" });
  if (guard.error !== null) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const workspace = await prisma.workspace.findUnique({
    where:   { id: guard.workspaceId },
    include: { agency: { select: { name: true } } },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // Latest scrape stats
  const [totalOrders, pendingOrders, lastLog] = await Promise.all([
    prisma.scrapedOrder.count({ where: { workspaceId: workspace.id } }),
    prisma.scrapedOrder.count({ where: { workspaceId: workspace.id, status: "pending_confirmation" } }),
    prisma.scrapeLog.findFirst({
      where:   { workspaceId: workspace.id },
      orderBy: { scrapedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    licenseKey:    workspace.licenseKey ?? "",
    workspaceId:   workspace.name,
    workspaceName: workspace.name,
    brandName:    workspace.agency?.name ?? workspace.name,
    isActive:     true,
    expiryDate:   "2027-12-31",
    stats: {
      totalOrders,
      pendingOrders,
      lastScrapedAt: lastLog?.scrapedAt ?? null,
      lastPlatform:  lastLog?.platform  ?? null,
    },
  });
}

// ── POST (regenerate) ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const guard = await requireWorkspaceMember(req, { minRole: "OWNER" });
  if (guard.error !== null) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const workspace = await prisma.workspace.findUnique({ where: { id: guard.workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // Generate new key: PRAISE-{SLUG}-{TIMESTAMP_HEX}
  const ts      = Date.now().toString(16).toUpperCase();
  const slug    = workspace.slug.toUpperCase().replace(/-/g, "");
  const newKey  = `PRAISE-${slug}-${ts}`;

  const updated = await prisma.workspace.update({
    where: { id: guard.workspaceId },
    data:  { licenseKey: newKey },
  });

  return NextResponse.json({ licenseKey: updated.licenseKey ?? newKey });
}
