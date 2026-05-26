import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSampleDeliveryWA } from "@/lib/send-sample-delivery-wa";
import { generatePersonalFormLink } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

const GFORM = "https://docs.google.com/forms/d/e";

// POST /api/sample-delivery/[id]/send-form
// Resend the submission form link via WhatsApp to the affiliate.
// Respects sampleCategory — Campaign Support uses the campaign's submission form.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const delivery = await prisma.sampleDelivery.findUnique({
    where: { id: Number(id) },
    select: {
      id: true, affiliateUsername: true, produk: true, googleFormLink: true,
      sampleCategory: true, relatedCampaignId: true,
    },
  });
  if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const host    = req.headers.get("host") || "localhost:3000";
  const proto   = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  const sampleCategory = delivery.sampleCategory || "First Collaboration";

  // ── Resolve campaign-specific form link ──────────────────────────────────
  let campaignFormLink = "";
  let campaignName     = "";
  if (sampleCategory === "Campaign Support" && delivery.relatedCampaignId) {
    try {
      const [cf, camp] = await Promise.all([
        prisma.campaignForm.findUnique({
          where: { campaignId: delivery.relatedCampaignId },
          select: { subFormPublicId: true },
        }),
        prisma.campaign.findUnique({
          where: { id: delivery.relatedCampaignId },
          select: { nama: true },
        }),
      ]);
      if (cf?.subFormPublicId) campaignFormLink = `${GFORM}/${cf.subFormPublicId}/viewform`;
      if (camp?.nama)          campaignName     = camp.nama;
    } catch { /* non-critical */ }
  }

  // ── Regenerate default Google Form link (for non-Campaign-Support or fallback) ──
  let googleFormLink = delivery.googleFormLink || "";
  if (!campaignFormLink) {
    try {
      const freshLink = await generatePersonalFormLink({
        deliveryId: delivery.id,
        username:   delivery.affiliateUsername,
        produk:     delivery.produk,
      });
      if (freshLink) {
        googleFormLink = freshLink;
        await prisma.sampleDelivery.update({ where: { id: delivery.id }, data: { googleFormLink: freshLink } });
      }
    } catch { /* non-critical */ }
  }

  const { waStatus, phone, submissionLink, waError } = await sendSampleDeliveryWA({
    deliveryId:        delivery.id,
    affiliateUsername: delivery.affiliateUsername,
    produk:            delivery.produk,
    baseUrl,
    logType:           "Sample Delivery (Resend)",
    googleFormLink:    googleFormLink || undefined,
    sampleCategory,
    campaignName,
    campaignFormLink,
  });

  return NextResponse.json({ ok: true, waStatus, phone, submissionLink, waError });
}
