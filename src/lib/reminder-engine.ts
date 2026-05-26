/**
 * Reminder Engine — reads deliveries, computes which reminders to send,
 * fills templates, sends via WhatsApp, and logs results.
 *
 * Category behavior:
 *   First Collaboration  → all reminders active (onboarding flow)
 *   Campaign Support     → all reminders active, use campaign form link
 *   Repeat / Restock     → video reminders only (skip Reminder Pengiriman)
 *   Paid Collaboration   → NO automation (skip entirely)
 *   Custom Request       → NO automation (skip entirely)
 */
import { prisma } from "@/lib/prisma";
import { sendUnified, isAnySessionConnected } from "@/lib/wa-multi-client";
import { findCategoryTemplate } from "@/lib/send-sample-delivery-wa";
import type { DeadlineConfig } from "@/app/api/admin/config/route";

// ── Deadline helpers ───────────────────────────────────────────────────────────
function deadlineDays(stageIdx: number, cfg: DeadlineConfig): number {
  if (stageIdx === 0) return 0;
  if (stageIdx === 1) return cfg.durasiPengiriman;
  const afterV1 = cfg.durasiPengiriman + cfg.durasiVideo1;
  if (stageIdx === 2) return afterV1;
  const afterV2 = afterV1 + cfg.durasiVideo2;
  if (stageIdx === 3) return afterV2;
  return afterV2 + cfg.durasiVideo3;
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Template variable substitution ────────────────────────────────────────────
function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function submissionUrl(deliveryId: number): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/submit-video/${deliveryId}`;
}

const GFORM_BASE = "https://docs.google.com/forms/d/e";

/** Resolve the best submission form link for a delivery, honoring category. */
async function resolveFormLink(
  deliveryId:       number,
  sampleCategory:   string,
  relatedCampaignId: number | null,
): Promise<{ formLink: string; campaignName: string }> {
  // Default: internal submit page
  const defaultLink = submissionUrl(deliveryId);

  if (sampleCategory === "Campaign Support" && relatedCampaignId) {
    try {
      const [cf, camp] = await Promise.all([
        prisma.campaignForm.findUnique({
          where: { campaignId: relatedCampaignId },
          select: { subFormPublicId: true },
        }),
        prisma.campaign.findUnique({
          where: { id: relatedCampaignId },
          select: { nama: true },
        }),
      ]);
      const formLink = cf?.subFormPublicId
        ? `${GFORM_BASE}/${cf.subFormPublicId}/viewform`
        : defaultLink;
      return { formLink, campaignName: camp?.nama ?? "" };
    } catch {
      return { formLink: defaultLink, campaignName: "" };
    }
  }

  return { formLink: defaultLink, campaignName: "" };
}

// ── Automation config ─────────────────────────────────────────────────────────
async function getAutomationConfig(): Promise<{
  automationEnabled: boolean;
  waAutomationEnabled: boolean;
  overdueWarningEnabled: boolean;
}> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ["automationEnabled", "waAutomationEnabled", "overdueWarningEnabled"] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    automationEnabled:     map.automationEnabled    !== "false",
    waAutomationEnabled:   map.waAutomationEnabled  !== "false",
    overdueWarningEnabled: map.overdueWarningEnabled !== "false",
  };
}

async function getDeadlineConfig(): Promise<DeadlineConfig> {
  const DEFAULTS: DeadlineConfig = {
    durasiPengiriman: 5,
    durasiVideo1: 3,
    durasiVideo2: 3,
    durasiVideo3: 4,
    finalWarningDelay: 5,
    reminderOverdue: true,
  };
  const rows = await prisma.appConfig.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    durasiPengiriman:  Number(map.durasiPengiriman  ?? DEFAULTS.durasiPengiriman),
    durasiVideo1:      Number(map.durasiVideo1      ?? DEFAULTS.durasiVideo1),
    durasiVideo2:      Number(map.durasiVideo2      ?? DEFAULTS.durasiVideo2),
    durasiVideo3:      Number(map.durasiVideo3      ?? DEFAULTS.durasiVideo3),
    finalWarningDelay: Number(map.finalWarningDelay ?? DEFAULTS.finalWarningDelay),
    reminderOverdue:   map.reminderOverdue !== undefined ? map.reminderOverdue === "true" : DEFAULTS.reminderOverdue,
  };
}

// ── Duplicate prevention ──────────────────────────────────────────────────────
async function alreadySentAllTime(deliveryId: number, tipeReminder: string): Promise<boolean> {
  return (await prisma.reminderLog.count({
    where: { deliveryId, tipeReminder, status: "sent" },
  })) > 0;
}

async function alreadySentToday(deliveryId: number, tipeReminder: string): Promise<boolean> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  return (await prisma.reminderLog.count({
    where: { deliveryId, tipeReminder, status: "sent", createdAt: { gte: today, lt: tomorrow } },
  })) > 0;
}

async function logReminder(data: {
  deliveryId: number; username: string; tipeReminder: string;
  status: "sent" | "failed" | "skipped"; phone: string; pesan: string;
  errorMsg: string; pic: string;
}) {
  await prisma.reminderLog.create({ data });
}

// ── Main engine ───────────────────────────────────────────────────────────────
export interface ReminderRunResult {
  processed: number; sent: number; skipped: number; failed: number; errors: string[];
}

export async function runReminderEngine(): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const automationCfg = await getAutomationConfig();
  if (!automationCfg.automationEnabled || !automationCfg.waAutomationEnabled) return result;

  if (!isAnySessionConnected()) {
    result.errors.push("WhatsApp tidak terhubung, reminder ditunda.");
    return result;
  }

  const cfg = await getDeadlineConfig();

  const deliveries = await prisma.sampleDelivery.findMany({
    where: { deletedAt: null },
    orderBy: { tanggalKirim: "asc" },
  });

  for (const delivery of deliveries) {
    result.processed++;

    // ── Category-based automation gate ──────────────────────────────────────
    const category = delivery.sampleCategory || "First Collaboration";

    // Paid Collaboration and Custom Request: NO automation whatsoever
    if (category === "Paid Collaboration" || category === "Custom Request") {
      result.skipped++;
      continue;
    }

    // Affiliate info
    const affiliate = await prisma.databaseAffiliate.findFirst({
      where: { tiktokUsername: delivery.affiliateUsername, deletedAt: null },
    });
    const phone = affiliate?.noWhatsapp ?? "";
    // PIC priority: stored on delivery → affiliate.affiliateSpecialist → empty
    const pic   = delivery.picName || affiliate?.affiliateSpecialist || "";

    if (!phone) { result.skipped++; continue; }

    const daysSinceSend  = daysSince(new Date(delivery.tanggalKirim));
    const videoCeklis: { label: string; done: boolean }[] = (() => {
      try { return JSON.parse(delivery.videoCeklis); } catch { return []; }
    })();
    const totalVideoDone  = videoCeklis.filter((v) => v.done).length;
    const totalVideoTarget = delivery.totalVideoTarget;

    if (totalVideoDone >= totalVideoTarget && totalVideoTarget > 0) { result.skipped++; continue; }

    // ── Resolve form link & campaign name (category-aware) ───────────────────
    const { formLink, campaignName } = await resolveFormLink(
      delivery.id,
      category,
      delivery.relatedCampaignId ?? null,
    );

    // ── Build template vars (shared base) ────────────────────────────────────
    const baseVars = (extra: Record<string, string> = {}): Record<string, string> => ({
      username:       delivery.affiliateUsername,
      produk:         delivery.produk,
      deadline:       "",
      video_ke:       "",
      hari_terlambat: "",
      submission_link: formLink,
      pic,
      campaign_name:  campaignName,
      ...extra,
    });

    // ── Overdue calculation ───────────────────────────────────────────────────
    let expectedDone = 0;
    for (let i = 1; i <= Math.min(totalVideoTarget, 3); i++) {
      if (daysSinceSend >= deadlineDays(i + 1, cfg)) expectedDone = i;
    }
    const overdue = Math.max(0, expectedDone - totalVideoDone);
    const shippingDeadline = deadlineDays(1, cfg);
    const finalDeadlineDays = deadlineDays(Math.min(totalVideoTarget, 3) + 1, cfg);
    const daysPastFinal = daysSinceSend - finalDeadlineDays;

    // ── Reminder Pengiriman ───────────────────────────────────────────────────
    // Repeat / Restock: skip — no onboarding reminder, creator already knows the flow
    if (
      category !== "Repeat / Restock" &&
      daysSinceSend >= shippingDeadline &&
      totalVideoDone === 0
    ) {
      const tipe = "Reminder Pengiriman";
      if (!(await alreadySentAllTime(delivery.id, tipe))) {
        const template = await findCategoryTemplate(tipe, category);
        if (template) {
          const pesan = fillTemplate(template.isiPesan, baseVars({
            deadline: `${shippingDeadline} hari`,
          }));
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({ deliveryId: delivery.id, username: delivery.affiliateUsername, tipeReminder: tipe, status: ok ? "sent" : "failed", phone, pesan, errorMsg: error ?? "", pic });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          continue;
        }
      }
    }

    // ── Reminder Video N ──────────────────────────────────────────────────────
    for (let n = 1; n <= Math.min(totalVideoTarget, 3); n++) {
      const videoDeadline = deadlineDays(n + 1, cfg);
      const tipe = `Reminder Video ${n}`;

      const alreadySubmitted = await prisma.videoSubmission.findUnique({
        where: { sampleDeliveryId_videoNumber: { sampleDeliveryId: delivery.id, videoNumber: n } },
      });

      if (
        daysSinceSend >= videoDeadline &&
        totalVideoDone < n &&
        !alreadySubmitted &&
        !(await alreadySentAllTime(delivery.id, tipe))
      ) {
        const template = await findCategoryTemplate(tipe, category);
        if (template) {
          const pesan = fillTemplate(template.isiPesan, baseVars({
            deadline: `${videoDeadline} hari`,
            video_ke: String(n),
            submission_link: formLink,
          }));
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({ deliveryId: delivery.id, username: delivery.affiliateUsername, tipeReminder: tipe, status: ok ? "sent" : "failed", phone, pesan, errorMsg: error ?? "", pic });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          break;
        }
      }
    }

    // ── Reminder Terlambat ────────────────────────────────────────────────────
    if (
      automationCfg.overdueWarningEnabled &&
      cfg.reminderOverdue &&
      overdue > 0 &&
      daysPastFinal > 0 &&
      daysPastFinal <= cfg.finalWarningDelay
    ) {
      const tipe = "Reminder Terlambat";
      if (!(await alreadySentToday(delivery.id, tipe))) {
        const template = await findCategoryTemplate(tipe, category);
        if (template) {
          const pesan = fillTemplate(template.isiPesan, baseVars({
            deadline:       `${finalDeadlineDays} hari`,
            video_ke:       String(totalVideoDone + 1),
            hari_terlambat: String(daysPastFinal),
            submission_link: formLink,
          }));
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({ deliveryId: delivery.id, username: delivery.affiliateUsername, tipeReminder: tipe, status: ok ? "sent" : "failed", phone, pesan, errorMsg: error ?? "", pic });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          continue;
        }
      }
    }

    // ── Final Warning ─────────────────────────────────────────────────────────
    if (
      automationCfg.overdueWarningEnabled &&
      cfg.reminderOverdue &&
      daysPastFinal > cfg.finalWarningDelay
    ) {
      const tipe = "Final Warning";
      if (!(await alreadySentToday(delivery.id, tipe))) {
        const template = await findCategoryTemplate(tipe, category);
        if (template) {
          const pesan = fillTemplate(template.isiPesan, baseVars({
            deadline:       `${finalDeadlineDays} hari`,
            video_ke:       String(totalVideoDone + 1),
            hari_terlambat: String(daysPastFinal),
            submission_link: formLink,
          }));
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({ deliveryId: delivery.id, username: delivery.affiliateUsername, tipeReminder: tipe, status: ok ? "sent" : "failed", phone, pesan, errorMsg: error ?? "", pic });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
        }
      }
    }
  }

  return result;
}

export { todayStr };
