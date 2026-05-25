/**
 * Scheduler — runs the reminder engine + WA queue on a cron schedule.
 * Call initScheduler() once from instrumentation.ts.
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

  // WA Broadcast Queue — every 2 minutes, process up to 3 messages per tick
  // (respects per-message delay internally, so only processes if WA is connected)
  cron.schedule("*/2 * * * *", async () => {
    try {
      const result = await processWaQueue(3, false); // no extra sleep in scheduler tick
      if (result.processed > 0) {
        console.log(
          `[Scheduler] WA Queue: processed=${result.processed} success=${result.success} failed=${result.failed} remaining=${result.remaining}`
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error processing WA queue:", err);
    }
  });

  console.log("[Scheduler] Started: reminder (30min) + WA queue (2min).");
}
