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
import { processWaQueue } from "@/lib/wa-queue-processor";

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

  // WA Broadcast Queue — every 2 minutes, process up to 3 messages per tick.
  // SKIPPED when the background worker is active (prevents duplicate sends).
  cron.schedule("*/2 * * * *", async () => {
    try {
      // ── Guard: yield to background worker ─────────────────────────────────
      const { getWorkerState } = await import("@/lib/wa-queue-worker");
      if (getWorkerState().active) {
        // Background worker is running — it owns the queue. Don't touch it.
        return;
      }

      const result = await processWaQueue(3, false);
      if (result.processed > 0) {
        console.log(
          `[Scheduler] WA Queue: processed=${result.processed} success=${result.success} failed=${result.failed} remaining=${result.remaining}`
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error processing WA queue:", err);
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
