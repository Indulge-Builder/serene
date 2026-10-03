/**
 * promise-tracker.ts — Elaya keeps the promises to members (migration 0255, services/promise-reader.ts).
 *
 * Every minute: the member groups whose chat moved since their last read (a holding line, or new
 * messages in a group that owes something), settled for a minute, are read by Elaya, and their
 * sia.promises rows written. The alerts are sent by the reply-alerts job, which walks the open rows.
 * Runs only while `update_alerts_enabled` is on: no switch, no reading, no cost.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const promiseTrackerTask = schedules.task({
  id: "promise-tracker",
  cron: { pattern: "* * * * *" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    if (Date.now() - new Date(payload.timestamp).getTime() > 45_000) return { skipped: "stale" };
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getReplyAlertSwitches } = await import("@/lib/services/llm-providers-service");
    if (!(await getReplyAlertSwitches()).update) return { skipped: "disabled" };
    const { runPromiseSweep } = await import("@/lib/services/promise-reader");
    const r = await runPromiseSweep({ apply: true, deadlineMs: Date.now() + 100_000 });
    return { due: r.due, read: r.reads.filter((x) => x.status === "read").length, failed: r.reads.filter((x) => x.status === "failed").length, dropped: r.dropped };
  },
});
