/**
 * reply-alerts.ts — the reply clocks' heartbeat (migration 0253, services/reply-alerts.ts).
 *
 * Starts every minute. Each pass alerts whatever is due, then the run sleeps until the NEXT due
 * step inside this minute (a bishop's 60-second mark, a queen's 90) and passes again, so an alert
 * lands within about a second of its moment instead of up to a minute late. With nothing due in
 * the minute, the run ends at once. The clocks themselves are kept by the database trigger; this
 * only reads them. Gated by `reply_alerts_enabled` / `update_alerts_enabled` (seeded false).
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { REPLY_RUN_WINDOW_MS } from "@/lib/constants/reply-clocks";

export const replyAlertsTask = schedules.task({
  id: "reply-alerts",
  cron: { pattern: "* * * * *" },
  maxDuration: 90,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const started = Date.now();
    if (started - new Date(payload.timestamp).getTime() > 45_000) return { skipped: "stale" };
    // Dynamic import — keep the service graph out of the Trigger.dev module scan.
    const { runReplyAlertPass } = await import("@/lib/services/reply-alerts");
    let passes = 0;
    let fired = 0;
    for (;;) {
      const r = await runReplyAlertPass({ apply: true });
      passes++;
      fired += r.fired;
      if (!r.switches.reply && !r.switches.update) return { skipped: "disabled" };
      const end = started + REPLY_RUN_WINDOW_MS;
      if (r.nextDueAt === null || r.nextDueAt > end || passes >= 40) return { passes, fired, running: r.running };
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, r.nextDueAt as number - Date.now()) + 300));
    }
  },
});
