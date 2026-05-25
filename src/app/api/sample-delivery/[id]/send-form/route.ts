import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSampleDeliveryWA } from "@/lib/send-sample-delivery-wa";
import { generatePersonalFormLink } from "@/lib/google-auth";

// POST /api/sample-delivery/[id]/send-form
// Resend the submission form link via WhatsApp to the affiliate.
// Always regenerates a fresh personal prefilled link (fixes stale/empty links).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const delivery = await prisma.sampleDelivery.findUnique({
    where: { id: Number(id) },
    select: { id: true, affiliateUsername: true, produk: true, googleFormLink: true },
  });
  if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const host    = req.headers.get("host") || "localhost:3000";
  const proto   = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  // Always regenerate a fresh personal prefilled link — this fixes deliveries
  // that were created before entry IDs were properly derived, or when the form was changed.
  let googleFormLink = delivery.googleFormLink || "";
  try {
    const freshLink = await generatePersonalFormLink({
      deliveryId: delivery.id,
      username:   delivery.affiliateUsername,
      produk:     delivery.produk,
    });
    if (freshLink) {
      googleFormLink = freshLink;
      // Persist the updated link so the dashboard shows the correct URL
      await prisma.sampleDelivery.update({
        where: { id: delivery.id },
        data:  { googleFormLink: freshLink },
      });
    }
  } catch { /* non-critical */ }

  const { waStatus, phone, submissionLink, waError } = await sendSampleDeliveryWA({
    deliveryId:        delivery.id,
    affiliateUsername: delivery.affiliateUsername,
    produk:            delivery.produk,
    baseUrl,
    logType:           "Sample Delivery (Resend)",
    googleFormLink:    googleFormLink || undefined,
  });

  return NextResponse.json({ ok: true, waStatus, phone, submissionLink, waError });
}
