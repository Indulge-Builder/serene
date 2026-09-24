/**
 * elaya-labels-refresh.ts — the nightly label top-up (services/elaya-deep-read.ts, planLabelRefresh).
 *
 * 05:30 IST, before the morning brief: every label set a founder asked about in the last
 * LABELS_REFRESH_DAYS gets one refresh job that reads only the rows it has not judged yet (the
 * last few days, through the plan's refresh_sql) and writes the verdicts back. Nothing is sent to
 * anyone; the point is that "how many health-and-wellness tickets this week" is a plain
 * query_database question the next morning, and a repeat deep read reuses every verdict.
 * ON unless the `elaya_labels_refresh_enabled` row says false. The runs themselves go through the
 * ordinary deep-read task, two at a time.
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { startDeepReadJob } from "./elaya-deep-read";

export const elayaLabelsRefreshTask = schedules.task({
  id: "elaya-labels-refresh",
  cron: { pattern: "30 5 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getElayaLabelsRefreshEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getElayaLabelsRefreshEnabled())) return { skipped: "disabled" };
    const { planLabelRefresh } = await import("@/lib/services/elaya-deep-read");
    const planned = await planLabelRefresh();
    let fired = 0;
    for (const jobId of planned.jobIds) {
      try {
        await startDeepReadJob(jobId);
        fired++;
      } catch (e) {
        console.error("[elaya-labels-refresh] could not fire job", jobId, e instanceof Error ? e.message : e);
      }
    }
    return { fired, queued: planned.jobIds.length, skipped: planned.skipped };
  },
});
