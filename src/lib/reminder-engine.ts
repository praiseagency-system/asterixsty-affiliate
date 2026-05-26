/**
 * Reminder Engine — reads deliveries, computes which reminders to send,
 * fills templates, sends via WhatsApp, and logs results.
 */
import { prisma } from "@/lib/prisma";
import { sendUnified, isAnySessionConnected } from "@/lib/wa-multi-client";
import type { DeadlineConfig } from "@/app/api/admin/config/route";

// ── Deadline helpers (mirrors sample-delivery/page.tsx) ───────────────────────
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

// ── Get automation config from AppConfig ──────────────────────────────────────
async function getAutomationConfig(): Promise<{
  automationEnabled: boolean;
  waAutomationEnabled: boolean;
  overdueWarningEnabled: boolean;
}> {
  const rows = await prisma.appConfig.findMany({
    where: {
      key: { in: ["automationEnabled", "waAutomationEnabled", "overdueWarningEnabled"] },
    },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    automationEnabled:    map.automationEnabled !== "false",
    waAutomationEnabled:  map.waAutomationEnabled !== "false",
    overdueWarningEnabled: map.overdueWarningEnabled !== "false",
  };
}

// ── Get deadline config ────────────────────────────────────────────────────────
async function getDeadlineConfig(): Promise<DeadlineConfig> {
  const DEFAULTS: DeadlineConfig = {
    durasiPengiriman: 5,
    durasiVideo1: 3,
    durasiVideo2: 3,
    durasiVideo3: 4,
    finalWarningDelay: 5,
    reminderOverdue: true,
  };
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: Object.keys(DEFAULTS) } },
  });
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

// ── Duplicate prevention helpers ──────────────────────────────────────────────
async function alreadySentAllTime(
  deliveryId: number,
  tipeReminder: string
): Promise<boolean> {
  const count = await prisma.reminderLog.count({
    where: { deliveryId, tipeReminder, status: "sent" },
  });
  return count > 0;
}

async function alreadySentToday(
  deliveryId: number,
  tipeReminder: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const count = await prisma.reminderLog.count({
    where: {
      deliveryId,
      tipeReminder,
      status: "sent",
      createdAt: { gte: today, lt: tomorrow },
    },
  });
  return count > 0;
}

// ── Find best active template for a reminder type ─────────────────────────────
async function findTemplate(tipeReminder: string) {
  return prisma.reminderTemplate.findFirst({
    where: { tipeReminder, aktif: true },
    orderBy: { updatedAt: "desc" },
  });
}

// ── Log a reminder attempt ────────────────────────────────────────────────────
async function logReminder(data: {
  deliveryId: number;
  username: string;
  tipeReminder: string;
  status: "sent" | "failed" | "skipped";
  phone: string;
  pesan: string;
  errorMsg: string;
  pic: string;
}) {
  await prisma.reminderLog.create({ data });
}

// ── Main engine ───────────────────────────────────────────────────────────────
export interface ReminderRunResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function runReminderEngine(): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // 1. Check automation flags
  const automationCfg = await getAutomationConfig();
  if (!automationCfg.automationEnabled || !automationCfg.waAutomationEnabled) {
    return result;
  }

  // 2. Check WA connection — any session must be connected
  if (!isAnySessionConnected()) {
    result.errors.push("WhatsApp tidak terhubung, reminder ditunda.");
    return result;
  }

  // 3. Load deadline config
  const cfg = await getDeadlineConfig();

  // 4. Load all active deliveries (not deleted, not fully done)
  const deliveries = await prisma.sampleDelivery.findMany({
    where: { deletedAt: null },
    orderBy: { tanggalKirim: "asc" },
  });

  for (const delivery of deliveries) {
    result.processed++;

    // Get affiliate info for phone & pic
    const affiliate = await prisma.databaseAffiliate.findFirst({
      where: { tiktokUsername: delivery.affiliateUsername, deletedAt: null },
    });

    const phone = affiliate?.noWhatsapp ?? "";
    const pic   = affiliate?.affiliateSpecialist ?? "";

    if (!phone) {
      result.skipped++;
      continue;
    }

    const daysSinceSend = daysSince(new Date(delivery.tanggalKirim));
    const videoCeklis: { label: string; done: boolean }[] = (() => {
      try {
        return JSON.parse(delivery.videoCeklis);
      } catch {
        return [];
      }
    })();
    const totalVideoDone = videoCeklis.filter((v) => v.done).length;
    const totalVideoTarget = delivery.totalVideoTarget;

    // Skip if fully completed
    if (totalVideoDone >= totalVideoTarget && totalVideoTarget > 0) {
      result.skipped++;
      continue;
    }

    // ── Determine overdue ──────────────────────────────────────────────────
    // Find current expected stage: how many videos should be done by now?
    let expectedDone = 0;
    for (let i = 1; i <= Math.min(totalVideoTarget, 3); i++) {
      if (daysSinceSend >= deadlineDays(i + 1, cfg)) expectedDone = i;
    }
    const overdue = Math.max(0, expectedDone - totalVideoDone);

    // Also check if still in shipping window
    const shippingDeadline = deadlineDays(1, cfg);
    const inShipping = daysSinceSend < shippingDeadline;

    // Compute days past final deadline
    const finalDeadlineDays = deadlineDays(
      Math.min(totalVideoTarget, 3) + 1,
      cfg
    );
    const daysPastFinal = daysSinceSend - finalDeadlineDays;

    // ── Reminder Pengiriman ────────────────────────────────────────────────
    // Send on deadline day (durasiPengiriman) if no videos done yet
    if (
      daysSinceSend >= shippingDeadline &&
      totalVideoDone === 0 &&
      inShipping === false
    ) {
      if (!(await alreadySentAllTime(delivery.id, "Reminder Pengiriman"))) {
        const template = await findTemplate("Reminder Pengiriman");
        if (template) {
          const pesan = fillTemplate(template.isiPesan, {
            username: delivery.affiliateUsername,
            produk:   delivery.produk,
            deadline: `${shippingDeadline} hari`,
            pic,
            video_ke: "",
            hari_terlambat: "",
            submission_link: submissionUrl(delivery.id),
          });
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({
            deliveryId: delivery.id,
            username: delivery.affiliateUsername,
            tipeReminder: "Reminder Pengiriman",
            status: ok ? "sent" : "failed",
            phone,
            pesan,
            errorMsg: error ?? "",
            pic,
          });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          continue;
        }
      }
    }

    // ── Reminder Video N (one-time, on deadline day) ───────────────────────
    for (let n = 1; n <= Math.min(totalVideoTarget, 3); n++) {
      const videoDeadline = deadlineDays(n + 1, cfg);
      const tipeReminder = `Reminder Video ${n}`;

      // Check if video was submitted via form
      const alreadySubmitted = await prisma.videoSubmission.findUnique({
        where: { sampleDeliveryId_videoNumber: { sampleDeliveryId: delivery.id, videoNumber: n } },
      });

      // Trigger when we're on or past deadline for video N, but video N not yet done/submitted
      if (
        daysSinceSend >= videoDeadline &&
        totalVideoDone < n &&
        !alreadySubmitted &&
        !(await alreadySentAllTime(delivery.id, tipeReminder))
      ) {
        const template = await findTemplate(tipeReminder);
        if (template) {
          const pesan = fillTemplate(template.isiPesan, {
            username: delivery.affiliateUsername,
            produk:   delivery.produk,
            deadline: `${videoDeadline} hari`,
            video_ke: String(n),
            pic,
            hari_terlambat: "",
          });
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({
            deliveryId: delivery.id,
            username: delivery.affiliateUsername,
            tipeReminder,
            status: ok ? "sent" : "failed",
            phone,
            pesan,
            errorMsg: error ?? "",
            pic,
          });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          break; // Only one video reminder per run per delivery
        }
      }
    }

    // ── Reminder Terlambat (daily, overdue 1..finalWarningDelay) ──────────
    if (
      automationCfg.overdueWarningEnabled &&
      cfg.reminderOverdue &&
      overdue > 0 &&
      daysPastFinal > 0 &&
      daysPastFinal <= cfg.finalWarningDelay
    ) {
      if (!(await alreadySentToday(delivery.id, "Reminder Terlambat"))) {
        const template = await findTemplate("Reminder Terlambat");
        if (template) {
          const pesan = fillTemplate(template.isiPesan, {
            username: delivery.affiliateUsername,
            produk:   delivery.produk,
            deadline: `${finalDeadlineDays} hari`,
            video_ke: String(totalVideoDone + 1),
            pic,
            hari_terlambat: String(daysPastFinal),
            submission_link: submissionUrl(delivery.id),
          });
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({
            deliveryId: delivery.id,
            username: delivery.affiliateUsername,
            tipeReminder: "Reminder Terlambat",
            status: ok ? "sent" : "failed",
            phone,
            pesan,
            errorMsg: error ?? "",
            pic,
          });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
          continue;
        }
      }
    }

    // ── Final Warning (daily, overdue > finalWarningDelay) ────────────────
    if (
      automationCfg.overdueWarningEnabled &&
      cfg.reminderOverdue &&
      daysPastFinal > cfg.finalWarningDelay
    ) {
      if (!(await alreadySentToday(delivery.id, "Final Warning"))) {
        const template = await findTemplate("Final Warning");
        if (template) {
          const pesan = fillTemplate(template.isiPesan, {
            username: delivery.affiliateUsername,
            produk:   delivery.produk,
            deadline: `${finalDeadlineDays} hari`,
            video_ke: String(totalVideoDone + 1),
            pic,
            hari_terlambat: String(daysPastFinal),
            submission_link: submissionUrl(delivery.id),
          });
          const { ok, error } = await sendUnified(phone, pesan);
          await logReminder({
            deliveryId: delivery.id,
            username: delivery.affiliateUsername,
            tipeReminder: "Final Warning",
            status: ok ? "sent" : "failed",
            phone,
            pesan,
            errorMsg: error ?? "",
            pic,
          });
          if (ok) result.sent++;
          else { result.failed++; if (error) result.errors.push(error); }
        }
      }
    }
  }

  return result;
}

// Export today helper for API use
export { todayStr };
