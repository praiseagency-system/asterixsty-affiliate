/**
 * Shared utility: send WhatsApp with the submission form link
 * after a sample delivery is created or on manual resend.
 * Logs to ReminderLog on every attempt.
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

export async function sendSampleDeliveryWA(params: {
  deliveryId: number;
  affiliateUsername: string;
  produk: string;
  baseUrl: string;
  logType?: string;
  googleFormLink?: string; // if set, used instead of internal /submit-video link
}): Promise<{ waStatus: WaSendStatus; phone: string; submissionLink: string; waError: string }> {
  const { deliveryId, affiliateUsername, produk, baseUrl, logType = "Sample Delivery", googleFormLink } = params;
  // Prefer Google Form link; fall back to internal page
  const submissionLink = googleFormLink || `${baseUrl}/submit-video/${deliveryId}`;

  let waStatus: WaSendStatus = "no_wa";
  let phone = "";
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

    // 2. Check WA connection (dynamic import avoids edge-runtime issues)
    const { sendWAMessage, getWAState } = await import("@/lib/wa-client");
    if (getWAState().status !== "connected") {
      return { waStatus: "no_wa", phone, submissionLink, waError: "WhatsApp tidak terhubung" };
    }

    // 3. Get brand config
    const brand = await getBrandConfig();

    // 4. Find or auto-create "Sample Delivery" template
    let tpl = await prisma.reminderTemplate.findFirst({
      where: { tipeReminder: "Sample Delivery", aktif: true },
    });
    if (!tpl) {
      // Auto-seed default template (runs once)
      tpl = await prisma.reminderTemplate.create({
        data: {
          nama: "Sample Delivery + Form Link",
          tipeReminder: "Sample Delivery",
          isiPesan: DEFAULT_SAMPLE_DELIVERY_TPL,
          aktif: true,
        },
      });
    }

    // 5. Fill template variables
    const msg = fillMsg(tpl.isiPesan, {
      username: `@${affiliateUsername}`,
      produk,
      submission_form_link: submissionLink,
      submission_link: submissionLink,
      brand_name: brand.brandName,
      footer_branding: brand.waFooter,
      footer: brand.waFooter,
    });

    // 6. Send
    const result = await sendWAMessage(phone, msg);
    waStatus = result.ok ? "sent" : "failed";
    waError = result.error || "";

    // 7. Log to ReminderLog
    await prisma.reminderLog.create({
      data: {
        deliveryId,
        username: affiliateUsername,
        tipeReminder: logType,
        status: waStatus,
        phone,
        pesan: msg,
        errorMsg: waError,
      },
    });

    return { waStatus, phone, submissionLink, waError };
  } catch (err) {
    waError = String(err);
    console.error(`[${logType}] WA send error:`, err);
    return { waStatus: "failed", phone, submissionLink, waError };
  }
}
