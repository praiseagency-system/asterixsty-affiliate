/**
 * Next.js Instrumentation Hook — runs once on server startup.
 * Initializes WA client (auto-reconnect if session exists) and cron scheduler.
 * Also starts background Google Form auto-sync every 2 minutes.
 */
export async function register() {
  // Only run on Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initScheduler } = await import("@/lib/scheduler");
  const { connectWA } = await import("@/lib/wa-client");

  initScheduler();

  // Auto-reconnect WA if a session file exists
  const fs = await import("fs");
  const path = await import("path");
  const sessionDir = path.join(process.cwd(), ".wa-session");
  if (fs.existsSync(sessionDir)) {
    try {
      await connectWA();
    } catch (err) {
      console.warn("[Instrumentation] WA auto-connect failed:", err);
    }
  }

  // ── Google Form background auto-sync ───────────────────────────────────────
  // Start after 60s delay so the app and DB connections are fully ready.
  // Syncs every 2 minutes; errors are caught and logged, never crash the server.
  setTimeout(() => {
    const SYNC_INTERVAL_MS = 2 * 60 * 1000;
    console.log("[AutoSync] Google Form background sync started (every 2 min)");

    const runSync = async () => {
      try {
        const { syncFormResponses } = await import("@/lib/google-auth");
        const result = await syncFormResponses("default");
        if (result.synced > 0) {
          console.log(`[AutoSync] ✓ ${result.synced} new submission(s) synced, ${result.skipped} skipped`);
        }
        if (result.errors.length > 0) {
          console.warn(`[AutoSync] ${result.errors.length} response(s) could not be processed`);
        }
      } catch (err) {
        // Non-fatal: log but never crash the server
        console.warn("[AutoSync] Error (will retry next interval):", err);
      }
    };

    setInterval(runSync, SYNC_INTERVAL_MS);
  }, 60_000);
}
