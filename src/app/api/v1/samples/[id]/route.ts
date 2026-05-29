/**
 * PATCH /api/v1/samples/:id
 *
 * PIC confirms a pending scraped order:
 *   - Updates kategoriPengiriman, targetVideo, picName, catatan
 *   - Changes status: pending_confirmation → active
 *   - Optionally auto-creates a SampleDelivery in the main system
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   Body: {
 *     status?:               "active" | "cancelled",
 *     kategoriPengiriman?:   string,
 *     targetVideo?:          number,
 *     picName?:              string,
 *     catatan?:              string,
 *     createSampleDelivery?: boolean  // if true, auto-creates SampleDelivery
 *   }
 *
 * DELETE /api/v1/samples/:id
 *   Cancel / remove a scraped order.
 */

import { NextResponse }   from "next/server";
import { requireLicense } from "@/lib/license-auth";
import { prisma }         from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const ws = await requireLicense(req);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  const { id } = await params;
  const order   = await prisma.scrapedOrder.findUnique({ where: { id: Number(id) } });
  if (!order || order.workspaceId !== ws.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if ("status"              in body) updateData.status              = String(body.status);
  if ("kategoriPengiriman"  in body) updateData.kategoriPengiriman  = String(body.kategoriPengiriman  ?? "");
  if ("targetVideo"         in body) updateData.targetVideo         = Number(body.targetVideo)         || 0;
  if ("picName"             in body) updateData.picName             = String(body.picName             ?? "");
  if ("catatan"             in body) updateData.catatan             = String(body.catatan             ?? "");

  const updated = await prisma.scrapedOrder.update({
    where: { id: Number(id) },
    data:  updateData,
  });

  // ── Auto-create SampleDelivery when PIC confirms ──────────────────────────
  if (body.createSampleDelivery && updated.status === "active") {
    await prisma.sampleDelivery.create({
      data: {
        workspaceId:      ws.id,
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
      },
    }).catch((err) => console.error("[Samples] SampleDelivery create error:", err));
  }

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const ws = await requireLicense(req);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  const { id } = await params;
  const order   = await prisma.scrapedOrder.findUnique({ where: { id: Number(id) } });
  if (!order || order.workspaceId !== ws.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scrapedOrder.update({
    where: { id: Number(id) },
    data:  { status: "cancelled" },
  });

  return NextResponse.json({ success: true });
}
