/**
 * Shared WA Queue Processor.
 * Reads pending WaMessageQueue entries and sends them via the existing
 * sendWAMessage function from wa-client (same session used for reminders).
 *
 * Called by:
 *   - Scheduler (every 2 minutes, processes a small batch)
 *   - POST /api/wa-queue/process (manual trigger from Broadcast Engine)
 */

import { getPrisma } from "@/lib/prisma";
import { sendWAMessage, getWAState } from "@/lib/wa-client";

export interface ProcessResult {
  processed: number;
  success:   number;
  failed:    number;
  skipped:   number;
  remaining: number;
  waConnected: boolean;
  error?: string;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** ms delay between sends, based on delayMode of the item */
function getDelay(mode: string): number {
  if (mode === "Fast")   return 10_000 + Math.random() * 15_000;  // 10–25 s
  if (mode === "Safe")   return 60_000 + Math.random() * 60_000;  // 60–120 s
  return 30_000 + Math.random() * 30_000;                          // 30–60 s (Normal)
}

/**
 * Process up to `limit` pending queue items.
 * If respectDelay is true, sleeps between sends (use false for quick tests).
 */
export async function processWaQueue(
  limit = 5,
  respectDelay = true,
): Promise<ProcessResult> {
  const prisma = getPrisma();
  const state = getWAState();

  const remaining = await prisma.waMessageQueue.count({
    where: {
      status: { in: ["pending", "retry"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
  });

  if (!state || state.status !== "connected") {
    return {
      processed: 0, success: 0, failed: 0, skipped: 0,
      remaining,
      waConnected: false,
      error: "WhatsApp tidak terhubung. Hubungkan WA terlebih dahulu di Automation Center.",
    };
  }

  const items = await prisma.waMessageQueue.findMany({
    where: {
      status: { in: ["pending", "retry"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let success = 0, failed = 0, skipped = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item.phone) {
      await prisma.waMessageQueue.update({
        where: { id: item.id },
        data: { status: "failed", errorReason: "Nomor WA tidak tersedia", attempts: item.attempts + 1 },
      });
      failed++;
      continue;
    }

    // Mark as processing
    await prisma.waMessageQueue.update({
      where: { id: item.id },
      data:  { status: "processing", attempts: item.attempts + 1 },
    });

    const result = await sendWAMessage(item.phone, item.message);

    if (result.ok) {
      await prisma.waMessageQueue.update({
        where: { id: item.id },
        data:  { status: "success", sentAt: new Date(), errorReason: "" },
      });
      success++;

      // Update parent broadcast sent count
      if (item.broadcastId) {
        await prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalSent: { increment: 1 }, status: "sending" },
        });
      }
    } else {
      const isLastAttempt = item.attempts + 1 >= item.maxAttempts;
      await prisma.waMessageQueue.update({
        where: { id: item.id },
        data:  {
          status:      isLastAttempt ? "failed" : "retry",
          errorReason: result.error ?? "Send failed",
        },
      });
      failed++;

      if (item.broadcastId) {
        await prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalFailed: { increment: 1 } },
        });
      }
    }

    // Delay before next message (skip for last item)
    if (respectDelay && i < items.length - 1) {
      await delay(getDelay(item.delayMode));
    }
  }

  // Update broadcast status to "done" if queue empty
  const broadcastIds = [...new Set(items.map((i) => i.broadcastId).filter(Boolean))] as number[];
  for (const bid of broadcastIds) {
    const pendingCount = await prisma.waMessageQueue.count({
      where: { broadcastId: bid, status: { in: ["pending", "retry", "processing"] } },
    });
    if (pendingCount === 0) {
      await prisma.recruitmentBroadcast.update({
        where: { id: bid },
        data:  { status: "done", sentAt: new Date() },
      });
    }
  }

  const newRemaining = await prisma.waMessageQueue.count({
    where: {
      status: { in: ["pending", "retry"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
  });

  return {
    processed: items.length,
    success,
    failed,
    skipped,
    remaining: newRemaining,
    waConnected: true,
  };
}
