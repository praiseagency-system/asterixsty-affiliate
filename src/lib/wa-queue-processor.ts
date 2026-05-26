/**
 * Shared WA Queue Processor.
 * Reads pending WaMessageQueue entries and sends via the unified multi-session
 * sender system. Every session (including session 1 / primary) is routed
 * through wa-multi-client.ts — there is no longer a separate legacy path.
 *
 * Called by:
 *   - Scheduler (every 2 minutes, processes a small batch)
 *   - POST /api/wa-queue/process (manual trigger from Broadcast Engine)
 */

import { getPrisma } from "@/lib/prisma";
import { getWAState } from "@/lib/wa-client";
import {
  sendViaMultiSession,
  pickBestSession,
  isAnySessionConnected,
} from "@/lib/wa-multi-client";

export interface ProcessResult {
  processed:   number;
  success:     number;
  failed:      number;
  skipped:     number;
  remaining:   number;
  waConnected: boolean;
  error?:      string;
  /** Suggested ms to wait before the next process call (based on delayMode of item). */
  nextDelayMs:    number;
  /** delayMode of the last processed item ("Fast" | "Normal" | "Safe"). */
  delayMode:      string;
  /** Info about the last processed recipient (for live log). */
  lastRecipient?: { name: string; phone: string; status: "success" | "failed" | "retry" };
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
 * @param limit         Max items to process in this call (default 5).
 * @param respectDelay  If true, sleeps between sends server-side.
 *                      Set false when the client drives timing via nextDelayMs.
 * @param broadcastId   Optional — restrict processing to one broadcast's queue.
 */
export async function processWaQueue(
  limit = 5,
  respectDelay = true,
  broadcastId?: number,
): Promise<ProcessResult> {
  const prisma = getPrisma();
  const waState = getWAState(); // Used only for the legacy waConnected field in result

  const queueWhere = {
    status: { in: ["pending" as const, "retry" as const] },
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    ...(broadcastId ? { broadcastId } : {}),
  };

  const remaining = await prisma.waMessageQueue.count({ where: queueWhere });

  if (!isAnySessionConnected()) {
    return {
      processed:   0,
      success:     0,
      failed:      0,
      skipped:     0,
      remaining,
      waConnected: false,
      nextDelayMs: 0,
      delayMode:   "Normal",
      error: "WhatsApp tidak terhubung. Hubungkan minimal satu akun di Automation Center.",
    };
  }

  const items = await prisma.waMessageQueue.findMany({
    where:   queueWhere,
    orderBy: { createdAt: "asc" },
    take:    limit,
  });

  let success = 0, failed = 0, skipped = 0;

  let lastDelayMs   = 30_000;
  let lastDelayMode = "Normal";
  let lastRecipient: ProcessResult["lastRecipient"] | undefined;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // ── Atomic claim — prevents any other processor from taking this item ──────
    // MUST use updateMany with status filter, not update without filter.
    // If status changed between findMany and this point (e.g. background worker
    // grabbed it), count=0 and we skip. This is the primary dedup guard.
    const claimed = await prisma.waMessageQueue.updateMany({
      where: { id: item.id, status: { in: ["pending", "retry"] } },
      data:  { status: "processing", attempts: item.attempts + 1 },
    });
    if (claimed.count === 0) {
      // Another processor already claimed this item — skip silently
      skipped++;
      continue;
    }

    if (!item.phone) {
      await prisma.waMessageQueue.updateMany({
        where: { id: item.id, status: "processing" },
        data:  { status: "failed", errorReason: "Nomor WA tidak tersedia" },
      });
      failed++;
      lastRecipient = { name: item.recipientName ?? "", phone: "", status: "failed" };
      continue;
    }

    // Secondary safety: re-read sentAt to catch any race that slipped past the claim
    const freshCheck = await prisma.waMessageQueue.findUnique({
      where:  { id: item.id },
      select: { sentAt: true },
    });
    if (freshCheck?.sentAt) {
      // Already sent by another path — release claim without re-sending
      await prisma.waMessageQueue.updateMany({
        where: { id: item.id, status: "processing" },
        data:  { status: "success" },
      });
      success++;
      lastRecipient = { name: item.recipientName ?? "", phone: item.phone, status: "success" };
      continue;
    }

    // ── Resolve sender ─────────────────────────────────────────────────────
    // All sessions (including 1) go through sendViaMultiSession.
    // If the assigned session is unavailable, fall back to any healthy session.
    let result: { ok: boolean; error?: string };
    let usedSessionId: number | null = item.senderSessionId ?? null;

    if (usedSessionId) {
      result = await sendViaMultiSession(usedSessionId, item.phone, item.message);

      // Fallback: assigned session failed → try any healthy session
      if (!result.ok) {
        const fallbackId = await pickBestSession(); // pick from all active sessions
        if (fallbackId && fallbackId !== usedSessionId) {
          const fallbackResult = await sendViaMultiSession(fallbackId, item.phone, item.message);
          if (fallbackResult.ok) {
            result = fallbackResult;
            usedSessionId = fallbackId;
          }
        }
      }
    } else {
      // No session assigned: pick best available
      const bestId = await pickBestSession();
      if (bestId) {
        result = await sendViaMultiSession(bestId, item.phone, item.message);
        usedSessionId = bestId;
      } else {
        result = { ok: false, error: "Tidak ada WhatsApp yang terhubung" };
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    if (result.ok) {
      // Resolve sender phone for logging
      let senderPhone = item.senderPhone || waState.phone || "";
      if (usedSessionId) {
        try {
          const sess = await prisma.whatsappSession.findUnique({
            where:  { id: usedSessionId },
            select: { phone: true },
          });
          if (sess?.phone) senderPhone = sess.phone;
        } catch { /* ignore */ }
      }

      await prisma.waMessageQueue.update({
        where: { id: item.id },
        data:  {
          status:      "success",
          sentAt:      new Date(),
          errorReason: "",
          senderPhone,
          ...(usedSessionId ? { senderSessionId: usedSessionId } : {}),
        },
      });
      success++;
      lastRecipient = { name: item.recipientName ?? "", phone: item.phone, status: "success" };

      // Update parent broadcast sent count
      if (item.broadcastId) {
        await prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalSent: { increment: 1 }, status: "sending" },
        });
      }
    } else {
      const isLastAttempt = item.attempts + 1 >= item.maxAttempts;
      const newStatus = isLastAttempt ? "failed" : "retry";
      await prisma.waMessageQueue.update({
        where: { id: item.id },
        data:  {
          status:      newStatus,
          errorReason: result.error ?? "Send failed",
        },
      });
      failed++;
      lastRecipient = {
        name:   item.recipientName ?? "",
        phone:  item.phone,
        status: newStatus === "failed" ? "failed" : "retry",
      };

      if (item.broadcastId) {
        await prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalFailed: { increment: 1 } },
        });
      }
    }

    // Track delay info from the last processed item
    lastDelayMs   = getDelay(item.delayMode);
    lastDelayMode = item.delayMode;

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
      ...(broadcastId ? { broadcastId } : {}),
    },
  });

  return {
    processed:     items.length,
    success,
    failed,
    skipped,
    remaining:     newRemaining,
    waConnected:   isAnySessionConnected(),
    nextDelayMs:   lastDelayMs,
    delayMode:     lastDelayMode,
    lastRecipient,
  };
}
