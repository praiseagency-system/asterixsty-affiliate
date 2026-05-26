/**
 * Scheduler — runs the reminder engine + WA queue on a cron schedule.
 * Call initScheduler() once from instrumentation.ts.
 *
 * IMPORTANT: The scheduler's queue tick is a FALLBACK for when the background
 * worker is not running (e.g. no active broadcast). When the background worker
 * is active, the scheduler skips queue processing to prevent duplicate sends.
 */
import cron from "node-cron";
import { runReminderEngine } from "@/lib/reminder-engine";

declare global {
  // eslint-disable-next-line no-var
  var __schedulerInitialized: boolean;
}

export function initScheduler() {
  if (global.__schedulerInitialized) return;
  global.__schedulerInitialized = true;

  // Reminder engine — every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await runReminderEngine();
      if (result.sent > 0 || result.failed > 0) {
        console.log(
          `[Scheduler] Reminder run: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error running reminder engine:", err);
    }
  });

  // WA Queue Watchdog — every 2 minutes.
  // Does NOT process items directly (that causes parallel sends with no delay).
  // Instead: checks if pending items exist and auto-starts the background worker.
  // The worker handles one-at-a-time delivery with proper random delays.
  cron.schedule("*/2 * * * *", async () => {
    try {
      const { getWorkerState, startWorker } = await import("@/lib/wa-queue-worker");
      if (getWorkerState().active) return; // Worker is already running — nothing to do

      const { getPrisma } = await import("@/lib/prisma");
      const prisma        = getPrisma();
      const pendingCount  = await prisma.waMessageQueue.count({
        where: {
          status: { in: ["pending", "retry"] },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
      });

      if (pendingCount > 0) {
        console.log(`[Scheduler] Watchdog: ${pendingCount} pending item(s) — auto-starting worker`);
        startWorker(); // Worker processes sequentially with real inter-message delay
      }
    } catch (err) {
      console.error("[Scheduler] Queue watchdog error:", err);
    }
  });

  // Stale lock cleanup — every 15 minutes.
  // Resets items stuck in "processing" for > 10 minutes (covers worker crash
  // scenarios where the server did NOT restart so instrumentation didn't fire).
  cron.schedule("*/15 * * * *", async () => {
    try {
      const { resetStaleProcessing } = await import("@/lib/wa-queue-worker");
      await resetStaleProcessing(10); // stale after 10 minutes
    } catch (err) {
      console.error("[Scheduler] Error cleaning stale locks:", err);
    }
  });

  console.log("[Scheduler] Started: reminder (30min) + WA queue (2min) + stale lock cleanup (15min).");
}
