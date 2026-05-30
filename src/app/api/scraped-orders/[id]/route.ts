/**
 * PATCH /api/scraped-orders/:id
 *
 * Confirms or cancels a scraped order (webapp-authenticated).
 *
 * Body:
 *   status?:               "CONFIRMED" | "cancelled"
 *   kategoriPengiriman?:   string
 *   targetVideo?:          number
 *   picName?:              string
 *   catatan?:              string
 *   mediaFocus?:           string
 *   visualTake?:           string
 *   kategoriAffiliate?:    string
 *   createSampleDelivery?: boolean   — auto-create SampleDelivery and set status to SYNCED
 *
 * Legacy: status "active" is accepted and mapped to "CONFIRMED".
 */

import { NextResponse }        from "next/server";
import { prisma }              from "@/lib/prisma";
import { resolveWorkspaceId }  from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const wsId    = resolveWorkspaceId(req) ?? 1;
  const { id }  = await params;

  const order = await prisma.scrapedOrder.findUnique({ where: { id: Number(id) } });
  if (!order || order.workspaceId !== wsId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Map legacy "active" → "CONFIRMED"
  if (body.status === "active") body.status = "CONFIRMED";

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if ("status"             in body) updateData.status             = String(body.status);
  if ("kategoriPengiriman" in body) updateData.kategoriPengiriman = String(body.kategoriPengiriman ?? "");
  if ("targetVideo"        in body) updateData.targetVideo        = Number(body.targetVideo) || 0;
  if ("picName"            in body) updateData.picName            = String(body.picName ?? "");
  if ("catatan"            in body) updateData.catatan            = String(body.catatan ?? "");
  if ("mediaFocus"         in body) updateData.mediaFocus         = String(body.mediaFocus ?? "");
  if ("visualTake"         in body) updateData.visualTake         = String(body.visualTake ?? "");
  if ("kategoriAffiliate"  in body) updateData.kategoriAffiliate  = String(body.kategoriAffiliate ?? "");

  const updated = await prisma.scrapedOrder.update({
    where: { id: Number(id) },
    data:  updateData,
  });

  // ── When confirmed: update DatabaseAffiliate profile fields ──────────────────
  if (updated.status === "CONFIRMED" && updated.tiktokUsername) {
    const affPatch: Record<string, string> = {};
    if (updated.mediaFocus)        affPatch.mediaPromosiFocus  = updated.mediaFocus;
    if (updated.visualTake)        affPatch.visualTake         = updated.visualTake;
    if (updated.kategoriAffiliate) affPatch.kategoriAffiliate  = updated.kategoriAffiliate;
    if (Object.keys(affPatch).length > 0) {
      await prisma.databaseAffiliate.updateMany({
        where: { workspaceId: wsId, tiktokUsername: updated.tiktokUsername, deletedAt: null },
        data:  affPatch,
      }).catch((err) => console.error("[ScrapedOrders] Affiliate profile update error:", err));
    }
  }

  // ── Auto-create SampleDelivery + mark SYNCED ──────────────────────────────────
  // Always runs when status becomes CONFIRMED — Send Sample is the operational home.
  if (updated.status === "CONFIRMED") {
    const target = updated.targetVideo || 0;
    await prisma.sampleDelivery.create({
      data: {
        workspaceId:       wsId,
        affiliateUsername: updated.tiktokUsername,
        // Use the most descriptive name available for the "produk" field
        produk:            updated.productName || updated.skuName || updated.productSku || "",
        qtyProduk:         updated.quantity    || 1,
        totalVideoTarget:  target,
        videoCeklis:       JSON.stringify(
          Array.from({ length: target }, (_, i) => ({ label: `Video ${i + 1}`, done: false }))
        ),
        statusProgress:    "Belum Mulai",
        sampleCategory:    updated.kategoriPengiriman || "First Collaboration",
        picName:           updated.picName  || "",
        catatan:           updated.catatan  || "",
        scrapedOrderId:    updated.id,
      },
    }).catch((err) => console.error("[ScrapedOrders] SampleDelivery create error:", err));

    // Advance to SYNCED — order is now tracked in Send Sample
    await prisma.scrapedOrder.update({
      where: { id: updated.id },
      data:  { status: "SYNCED" },
    }).catch(() => {});
    updated.status = "SYNCED";
  }

  return NextResponse.json({ success: true, data: updated });
}
