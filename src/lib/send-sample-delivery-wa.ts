/**
 * Shared utility: send WhatsApp with the submission form link
 * after a sample delivery is created or on manual resend.
 * Logs to ReminderLog on every attempt.
 *
 * Category-aware:
 *   First Collaboration  → "Sample Delivery" template, default form
 *   Campaign Support     → "Sample Delivery — Campaign Support" template, campaign form
 *   Repeat / Restock     → "Sample Delivery — Repeat / Restock" template, default form
 *   Paid Collaboration   → "Sample Delivery — Paid Collaboration" template, default form
 *   Custom Request       → "Sample Delivery — Custom Request" template, no form required
 */
import { prisma } from "@/lib/prisma";
import { getBrandConfig } from "@/lib/brand";

export type WaSendStatus = "sent" | "failed" | "no_phone" | "no_wa";

export const DEFAULT_SAMPLE_DELIVERY_TPL = `Halo kak {username} 👋

Sample untuk produk:
*{produk}*

sudah kami kirim ya ✨

Mohon submit setiap video yang sudah diupload melalui link berikut:

{submission_form_link}

Yang wajib diisi:
• Pilihan Video (1, 2, 3, dst)
• Link video TikTok
• Spark Code
• Catatan tambahan (opsional)

Deadline mengikuti timeline campaign ⏳

Terima kasih 🙌

{footer_branding}`;

function fillMsg(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return out;
}

/** Build the tipeReminder key for a given category */
export function categoryTipeReminder(sampleCategory: string): string {
  return sampleCategory && sampleCategory !== "First Collaboration"
    ? `Sample Delivery — ${sampleCategory}`
    : "Sample Delivery";
}

/**
 * Look up a category-specific template first; fall back to the generic one.
 * e.g. "Reminder Video 1 — Campaign Support" → "Reminder Video 1"
 */
export async function findCategoryTemplate(
  tipeReminder: string,
  category: string,
) {
  if (category && category !== "First Collaboration") {
    const cat = await prisma.reminderTemplate.findFirst({
      where: { tipeReminder: `${tipeReminder} — ${category}`, aktif: true },
    });
    if (cat) return cat;
  }
  return prisma.reminderTemplate.findFirst({
    where: { tipeReminder, aktif: true },
  });
}

export async function sendSampleDeliveryWA(params: {
  deliveryId:       number;
  affiliateUsername: string;
  produk:           string;
  baseUrl:          string;
  logType?:         string;
  googleFormLink?:  string; // personalized prefilled form (default form)
  sampleCategory?:  string; // drives template + form selection
  campaignName?:    string; // for {campaign_name} placeholder
  campaignFormLink?: string; // campaign submission form (Campaign Support)
  picName?:         string; // PIC stored on delivery (overrides affiliate.affiliateSpecialist)
}): Promise<{ waStatus: WaSendStatus; phone: string; submissionLink: string; waError: string }> {
  const {
    deliveryId,
    affiliateUsername,
    produk,
    baseUrl,
    logType      = "Sample Delivery",
    googleFormLink,
    sampleCategory  = "First Collaboration",
    campaignName    = "",
    campaignFormLink = "",
    picName         = "",
  } = params;

  // ── Resolve submission link ───────────────────────────────────────────────
  // Campaign Support → prefer campaign submission form
  // Others          → google (personalized) form → internal /submit-video page
  const submissionLink =
    sampleCategory === "Campaign Support" && campaignFormLink
      ? campaignFormLink
      : googleFormLink || `${baseUrl}/submit-video/${deliveryId}`;

  let waStatus: WaSendStatus = "no_wa";
  let phone   = "";
  let waError = "";

  try {
    // 1. Look up affiliate phone
    const affiliate = await prisma.databaseAffiliate.findFirst({
      where: { tiktokUsername: affiliateUsername },
      select: { noWhatsapp: true },
    });

    if (!affiliate?.noWhatsapp?.trim()) {
      return { waStatus: "no_phone", phone: "", submissionLink, waError: "Nomor WA tidak tersedia" };
    }
    phone = affiliate.noWhatsapp;

    // 2. Check WA connection
    const { sendUnified, isAnySessionConnected } = await import("@/lib/wa-multi-client");
    if (!isAnySessionConnected()) {
      return { waStatus: "no_wa", phone, submissionLink, waError: "WhatsApp tidak terhubung" };
    }

    // 3. Brand config
    const brand = await getBrandConfig();

    // 4. Category-specific template lookup
    //    Try "Sample Delivery — {category}" first; fall back to "Sample Delivery"
    const catTipe = categoryTipeReminder(sampleCategory);
    let tpl = await prisma.reminderTemplate.findFirst({
      where: { tipeReminder: catTipe, aktif: true },
    });
    if (!tpl && catTipe !== "Sample Delivery") {
      tpl = await prisma.reminderTemplate.findFirst({
        where: { tipeReminder: "Sample Delivery", aktif: true },
      });
    }
    if (!tpl) {
      // Auto-seed default template (runs once)
      tpl = await prisma.reminderTemplate.create({
        data: {
          nama:        "Sample Delivery + Form Link",
          tipeReminder:"Sample Delivery",
          isiPesan:    DEFAULT_SAMPLE_DELIVERY_TPL,
          aktif:       true,
        },
      });
    }

    // 5. Fill template variables
    const msg = fillMsg(tpl.isiPesan, {
      username:             `@${affiliateUsername}`,
      produk,
      submission_form_link: submissionLink,
      submission_link:      submissionLink,
      brand_name:           brand.brandName,
      footer_branding:      brand.waFooter,
      footer:               brand.waFooter,
      campaign_name:        campaignName,
      pic:                  picName || "",
    });

    // 6. Send
    const result = await sendUnified(phone, msg);
    waStatus = result.ok ? "sent" : "failed";
    waError  = result.error || "";

    // 7. Log
    await prisma.reminderLog.create({
      data: {
        deliveryId,
        username:     affiliateUsername,
        tipeReminder: logType,
        status:       waStatus,
        phone,
        pesan:        msg,
        errorMsg:     waError,
      },
    });

    return { waStatus, phone, submissionLink, waError };
  } catch (err) {
    waError = String(err);
    console.error(`[${logType}] WA send error:`, err);
    return { waStatus: "failed", phone, submissionLink, waError };
  }
}
