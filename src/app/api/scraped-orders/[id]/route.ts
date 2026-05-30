/**
 * PATCH /api/scraped-orders/:id
 *
 * Webapp-authenticated endpoint to confirm or cancel a scraped order.
 * Uses resolveWorkspaceId — same pattern as other webapp routes.
 *
 * Body: {
 *   status?:               "active" | "cancelled",
 *   kategoriPengiriman?:   string,
 *   targetVideo?:          number,
 *   picName?:              string,
 *   catatan?:              string,
 *   createSampleDelivery?: boolean  — auto-create SampleDelivery entry
 * }
 */

import { NextResponse }        from "next/server";
import { prisma }              from "@/lib/prisma";
import { resolveWorkspaceId }  from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const wsId  = resolveWorkspaceId(req) ?? 1;
  const { id } = await params;

  const order = await prisma.scrapedOrder.findUnique({ where: { id: Number(id) } });
  if (!order || order.workspaceId !== wsId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if ("status"             in body) updateData.status             = String(body.status);
  if ("kategoriPengiriman" in body) updateData.kategoriPengiriman = String(body.kategoriPengiriman ?? "");
  if ("targetVideo"        in body) updateData.targetVideo        = Number(body.targetVideo) || 0;
  if ("picName"            in body) updateData.picName            = String(body.picName ?? "");
  if ("catatan"            in body) updateData.catatan            = String(body.catatan ?? "");

  const updated = await prisma.scrapedOrder.update({
    where: { id: Number(id) },
    data:  updateData,
  });

  // Auto-create SampleDelivery when status moves to "active"
  if (body.createSampleDelivery && updated.status === "active") {
    await prisma.sampleDelivery.create({
      data: {
        workspaceId:       wsId,
        affiliateUsername: updated.tiktokUsername,
        produk:            updated.productName,
        totalVideoTarget:  updated.targetVideo,
        sampleCategory:    updated.kategoriPengiriman || "First Collaboration",
        picName:           updated.picName,
        catatan:           updated.catatan,
        videoCeklis:       JSON.stringify(
          Array.from({ length: updated.targetVideo }, (_, i) => ({
            label: `Video ${i + 1}`,
            done:  false,
          }))
        ),
        statusProgress: "Belum Mulai",
        scrapedOrderId: updated.id,
      },
    }).catch((err) => console.error("[ScrapedOrders] SampleDelivery create error:", err));
  }

  return NextResponse.json({ success: true, data: updated });
}
