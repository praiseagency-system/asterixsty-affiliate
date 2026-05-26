/**
 * WA Queue Background Worker — Server-side singleton.
 *
 * Runs as a persistent async loop inside the Node.js process.
 * Survives page refreshes because it lives on `global.__queueWorker`.
 *
 * Features:
 *  - One-item-at-a-time processing (WAITING → PROCESSING → SENT/FAILED/RETRY)
 *  - Interruptible sleep between sends (checks stopRequested every 500ms)
 *  - Anti-duplicate: atomically claims each item before sending
 *  - Auto-recovery on restart via resetStaleProcessing()
 *  - Detailed logs (last 100 entries)
 *  - Fallback sender: if assigned session fails, tries best available session
 *  - Stall-safe: if loop crashes, active is set false and error is recorded
 */

import { getPrisma } from "@/lib/prisma";
import {
  sendViaMultiSession,
  pickBestSession,
  isAnySessionConnected,
} from "@/lib/wa-multi-client";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WorkerLog {
  ts:        string; // ISO
  type:      "info" | "success" | "failed" | "retry" | "warn" | "done";
  message:   string;
  name?:     string;
  phone?:    string;
  sessionId?: number;
  waitSec?:  number;
}

export interface WorkerState {
  active:       boolean;
  broadcastId:  number | null;
  currentItem:  { id: number; recipientName: string; phone: string } | null;
  nextSendAt:   string | null; // ISO — when the next send is scheduled
  logs:         WorkerLog[];
  stats:        { processed: number; success: number; failed: number; retry: number };
  startedAt:    string | null; // ISO
  stoppedAt:    string | null; // ISO
  error:        string | null;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface GlobalWorker {
  state:         WorkerState;
  stopRequested: boolean;
  loopPromise:   Promise<void> | null;
}

declare const global: typeof globalThis & { __queueWorker?: GlobalWorker };

// ─── Singleton accessor ───────────────────────────────────────────────────────

function getWorker(): GlobalWorker {
  if (!global.__queueWorker) {
    global.__queueWorker = {
      state: {
        active:      false,
        broadcastId: null,
        currentItem: null,
        nextSendAt:  null,
        logs:        [],
        stats:       { processed: 0, success: 0, failed: 0, retry: 0 },
        startedAt:   null,
        stoppedAt:   null,
        error:       null,
      },
      stopRequested: false,
      loopPromise:   null,
    };
  }
  return global.__queueWorker;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addLog(log: WorkerLog) {
  const w = getWorker();
  w.state.logs = [log, ...w.state.logs].slice(0, 100);
}

/** ms delay between sends, based on item delayMode */
function getDelay(mode: string): number {
  if (mode === "Fast") return 10_000 + Math.random() * 15_000; // 10–25 s
  if (mode === "Safe") return 60_000 + Math.random() * 60_000; // 60–120 s
  return 30_000 + Math.random() * 30_000;                       // 30–60 s (Normal)
}

/**
 * Interruptible sleep. Polls every 500ms to check stopRequested.
 * Returns true if sleep completed normally, false if interrupted.
 */
async function interruptibleSleep(
  ms: number,
  check: () => boolean,
): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return false;
    await new Promise<void>((r) =>
      setTimeout(r, Math.min(500, end - Date.now())),
    );
  }
  return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getWorkerState(): WorkerState {
  const w = getWorker();
  return { ...w.state, logs: [...w.state.logs] };
}

/**
 * Reset queue items stuck in "processing".
 * Two modes:
 *   1. On startup: reset ALL processing items (server restarted, locks are stale).
 *   2. Periodic: reset items stuck in processing for > staleMinutes (worker crash mid-send).
 *
 * Called from instrumentation.ts on startup and from the scheduler periodically.
 */
export async function resetStaleProcessing(staleMinutes = 0): Promise<number> {
  const prisma = getPrisma();
  try {
    const where =
      staleMinutes > 0
        ? {
            status:    "processing" as const,
            updatedAt: { lt: new Date(Date.now() - staleMinutes * 60 * 1000) },
          }
        : { status: "processing" as const };

    const result = await prisma.waMessageQueue.updateMany({
      where,
      data: {
        status:      "pending",
        errorReason:
          staleMinutes > 0
            ? `Reset: lock stale setelah ${staleMinutes} menit`
            : "Reset oleh server restart",
      },
    });
    if (result.count > 0) {
      console.log(
        `[QueueWorker] Reset ${result.count} stale processing item(s) → pending`,
      );
    }
    return result.count;
  } catch (err) {
    console.error("[QueueWorker] resetStaleProcessing error:", err);
    return 0;
  }
}

export function startWorker(
  broadcastId?: number,
): { ok: boolean; error?: string } {
  const w = getWorker();
  if (w.state.active) {
    return { ok: false, error: "Worker sudah berjalan" };
  }

  w.stopRequested = false;
  w.state = {
    active:      true,
    broadcastId: broadcastId ?? null,
    currentItem: null,
    nextSendAt:  null,
    logs:        [],
    stats:       { processed: 0, success: 0, failed: 0, retry: 0 },
    startedAt:   new Date().toISOString(),
    stoppedAt:   null,
    error:       null,
  };

  w.loopPromise = workerLoop(broadcastId ?? null).catch((err: unknown) => {
    console.error("[QueueWorker] Loop crashed:", err);
    const w2 = getWorker();
    w2.state.active    = false;
    w2.state.error     = String(err);
    w2.state.stoppedAt = new Date().toISOString();
    w2.loopPromise     = null;
    addLog({
      ts:      new Date().toISOString(),
      type:    "warn",
      message: `Worker crashed: ${String(err)}`,
    });
  });

  return { ok: true };
}

export function stopWorker(): { ok: boolean } {
  const w = getWorker();
  w.stopRequested = true;
  return { ok: true };
}

// ─── Main worker loop ─────────────────────────────────────────────────────────

async function workerLoop(broadcastId: number | null): Promise<void> {
  const w      = getWorker();
  const prisma = getPrisma();

  addLog({
    ts:      new Date().toISOString(),
    type:    "info",
    message: broadcastId
      ? `Worker dimulai untuk broadcast #${broadcastId}`
      : "Worker dimulai (semua broadcast)",
  });

  while (!w.stopRequested) {
    // ── WA connectivity check ────────────────────────────────────────────────
    if (!isAnySessionConnected()) {
      addLog({
        ts:      new Date().toISOString(),
        type:    "warn",
        message: "WhatsApp tidak terhubung — menunggu 30 detik...",
      });
      w.state.currentItem = null;
      w.state.nextSendAt  = new Date(Date.now() + 30_000).toISOString();
      const ok = await interruptibleSleep(30_000, () => w.stopRequested);
      if (!ok) break;
      w.state.nextSendAt = null;
      continue;
    }

    // ── Find next item ───────────────────────────────────────────────────────
    const queueWhere = {
      status: { in: ["pending" as const, "retry" as const] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      ...(broadcastId ? { broadcastId } : {}),
    };

    let item: {
      id:              number;
      broadcastId:     number | null;
      phone:           string | null;
      message:         string;
      recipientName:   string | null;
      tiktokUsername:  string | null;
      delayMode:       string;
      attempts:        number;
      maxAttempts:     number;
      senderSessionId: number | null;
      senderPhone:     string | null;
    } | null = null;

    try {
      item = await prisma.waMessageQueue.findFirst({
        where:   queueWhere,
        orderBy: { createdAt: "asc" },
      });
    } catch (err) {
      addLog({
        ts:      new Date().toISOString(),
        type:    "warn",
        message: `DB error saat cari item: ${String(err)}`,
      });
      await interruptibleSleep(5_000, () => w.stopRequested);
      continue;
    }

    // ── Queue empty — all done ───────────────────────────────────────────────
    if (!item) {
      addLog({
        ts:      new Date().toISOString(),
        type:    "done",
        message: broadcastId
          ? `Semua pesan broadcast #${broadcastId} selesai dikirim ✓`
          : "Antrian kosong — worker berhenti",
      });

      // Mark broadcast done if all items are finished
      if (broadcastId) {
        try {
          const pendingCount = await prisma.waMessageQueue.count({
            where: {
              broadcastId,
              status: { in: ["pending", "retry", "processing"] },
            },
          });
          if (pendingCount === 0) {
            await prisma.recruitmentBroadcast.update({
              where: { id: broadcastId },
              data:  { status: "done", sentAt: new Date() },
            });
          }
        } catch { /* ignore */ }
      }

      break;
    }

    // ── Atomically claim the item (anti-duplicate) ───────────────────────────
    let claimed: { count: number } = { count: 0 };
    try {
      claimed = await prisma.waMessageQueue.updateMany({
        where: { id: item.id, status: { in: ["pending", "retry"] } },
        data:  { status: "processing", attempts: item.attempts + 1 },
      });
    } catch (err) {
      addLog({
        ts:      new Date().toISOString(),
        type:    "warn",
        message: `Gagal claim item #${item.id}: ${String(err)}`,
      });
      continue;
    }

    if (claimed.count === 0) {
      // Another process already claimed it — skip
      continue;
    }

    // ── Secondary safety: re-read sentAt after claim ─────────────────────────
    // Guards against rare race where item was processed by another path between
    // the findFirst and our updateMany claim.
    try {
      const freshCheck = await prisma.waMessageQueue.findUnique({
        where:  { id: item.id },
        select: { sentAt: true },
      });
      if (freshCheck?.sentAt) {
        // Already sent — release our "processing" claim back to "success"
        await prisma.waMessageQueue.updateMany({
          where: { id: item.id, status: "processing" },
          data:  { status: "success" },
        });
        w.state.currentItem = null;
        continue;
      }
    } catch { /* ignore — proceed with send */ }

    // ── Process item ─────────────────────────────────────────────────────────
    const recipientName = item.recipientName ?? item.tiktokUsername ?? "Unknown";
    w.state.currentItem = {
      id:            item.id,
      recipientName,
      phone:         item.phone ?? "",
    };
    w.state.stats.processed++;

    // Missing phone
    if (!item.phone) {
      try {
        await prisma.waMessageQueue.update({
          where: { id: item.id },
          data:  { status: "failed", errorReason: "Nomor WA tidak tersedia" },
        });
      } catch { /* ignore */ }
      w.state.stats.failed++;
      addLog({
        ts:      new Date().toISOString(),
        type:    "failed",
        message: `${recipientName} — nomor WA tidak tersedia`,
        name:    recipientName,
        phone:   "",
      });
      w.state.currentItem = null;
      continue;
    }

    // ── Send message ─────────────────────────────────────────────────────────
    let sendResult: { ok: boolean; error?: string } = { ok: false, error: "Tidak ada sesi" };
    let usedSessionId: number | null = item.senderSessionId ?? null;

    try {
      if (usedSessionId) {
        sendResult = await sendViaMultiSession(usedSessionId, item.phone, item.message);

        // Fallback: assigned session failed → try any healthy session
        if (!sendResult.ok) {
          const fallbackId = await pickBestSession();
          if (fallbackId && fallbackId !== usedSessionId) {
            const fb = await sendViaMultiSession(fallbackId, item.phone, item.message);
            if (fb.ok) {
              sendResult    = fb;
              usedSessionId = fallbackId;
            }
          }
        }
      } else {
        // No preferred session — pick best available
        const bestId = await pickBestSession();
        if (bestId) {
          sendResult    = await sendViaMultiSession(bestId, item.phone, item.message);
          usedSessionId = bestId;
        } else {
          sendResult = { ok: false, error: "Tidak ada WhatsApp yang terhubung" };
        }
      }
    } catch (err) {
      sendResult = { ok: false, error: String(err) };
    }

    // ── Handle result ─────────────────────────────────────────────────────────
    if (sendResult.ok) {
      // Resolve actual sender phone for the log
      let senderPhone = item.senderPhone ?? "";
      if (usedSessionId) {
        try {
          const sess = await prisma.whatsappSession.findUnique({
            where:  { id: usedSessionId },
            select: { phone: true },
          });
          if (sess?.phone) senderPhone = sess.phone;
        } catch { /* ignore */ }
      }

      try {
        await prisma.waMessageQueue.update({
          where: { id: item.id },
          data: {
            status:      "success",
            sentAt:      new Date(),
            errorReason: "",
            senderPhone,
            ...(usedSessionId ? { senderSessionId: usedSessionId } : {}),
          },
        });
      } catch { /* ignore */ }

      w.state.stats.success++;

      if (item.broadcastId) {
        prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalSent: { increment: 1 }, status: "sending" },
        }).catch(() => { /* ignore */ });
      }

      const delayMs  = getDelay(item.delayMode);
      const waitSec  = Math.round(delayMs / 1000);

      addLog({
        ts:        new Date().toISOString(),
        type:      "success",
        message:   `${recipientName} — terkirim via sesi #${usedSessionId ?? "?"}`,
        name:      recipientName,
        phone:     item.phone,
        sessionId: usedSessionId ?? undefined,
        waitSec,
      });

      w.state.currentItem = null;
      w.state.nextSendAt  = new Date(Date.now() + delayMs).toISOString();

      const completed = await interruptibleSleep(delayMs, () => w.stopRequested);
      if (!completed) break;

    } else {
      // Send failed
      const isLastAttempt = item.attempts + 1 >= item.maxAttempts;
      const newStatus     = isLastAttempt ? "failed" : "retry";

      try {
        await prisma.waMessageQueue.update({
          where: { id: item.id },
          data:  { status: newStatus, errorReason: sendResult.error ?? "Send failed" },
        });
      } catch { /* ignore */ }

      if (item.broadcastId && isLastAttempt) {
        prisma.recruitmentBroadcast.update({
          where: { id: item.broadcastId },
          data:  { totalFailed: { increment: 1 } },
        }).catch(() => { /* ignore */ });
      }

      if (isLastAttempt) {
        w.state.stats.failed++;
        addLog({
          ts:      new Date().toISOString(),
          type:    "failed",
          message: `${recipientName} — gagal (maks percobaan): ${sendResult.error ?? ""}`,
          name:    recipientName,
          phone:   item.phone,
        });
      } else {
        w.state.stats.retry++;
        addLog({
          ts:      new Date().toISOString(),
          type:    "retry",
          message: `${recipientName} — retry ${item.attempts + 1}/${item.maxAttempts}: ${sendResult.error ?? ""}`,
          name:    recipientName,
          phone:   item.phone,
        });
      }

      w.state.currentItem = null;

      // Short pause after failure before processing next
      if (!w.stopRequested) {
        w.state.nextSendAt = new Date(Date.now() + 5_000).toISOString();
        await interruptibleSleep(5_000, () => w.stopRequested);
      }
    }

    w.state.nextSendAt = null;
  }

  // ── Worker stopped ────────────────────────────────────────────────────────
  const w2 = getWorker();
  w2.state.active      = false;
  w2.state.currentItem = null;
  w2.state.nextSendAt  = null;
  w2.state.stoppedAt   = new Date().toISOString();
  w2.loopPromise       = null;

  if (w2.stopRequested) {
    addLog({
      ts:      new Date().toISOString(),
      type:    "info",
      message: "Worker dihentikan oleh pengguna",
    });
  }
}
