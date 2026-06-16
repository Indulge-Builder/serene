/**
 * usage-rollup.ts — the usage_daily rollup (adoption tracking, migration 0126).
 *
 * TWO scheduled Trigger.dev tasks (Option 2: both write the SAME usage_daily
 * table via the SAME idempotent UPSERT core — rollupUsageForDays):
 *
 *   rollupUsageTodayTask  — every 15 min, re-rolls TODAY (IST) so the dashboard
 *                           shows near-current active minutes without waiting
 *                           for the nightly pass. (The dashboard ALSO recomputes
 *                           today live from raw ticks in the RPC, so this mainly
 *                           keeps usage_daily warm and consistent.)
 *
 *   rollupUsageNightlyTask — once nightly, rolls the PRIOR IST day to its final
 *                           value (all of yesterday's ticks have landed), THEN
 *                           prunes raw usage_heartbeats older than 30 days (the
 *                           rollup has already captured them; usage_daily is
 *                           never pruned).
 *
 * Idempotency: rollupUsageForDays RECOMPUTES active_minutes from the raw ticks
 * (COUNT DISTINCT minute-bucket) and UPSERTs on the (day,user_id,domain) PK —
 * it OVERWRITES, never increments. Running either task twice yields identical
 * usage_daily rows. The two tasks may even overlap on "today" near midnight
 * boundaries with no double-count: same recompute, same UPSERT.
 *
 * IST dates are derived via istDateString() in usage-service — never re-fork
 * the IST offset math here.
 */

import { schedules } from "@trigger.dev/sdk/v3";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Re-roll TODAY (IST) every 15 minutes. */
export const rollupUsageTodayTask = schedules.task({
  id: "rollup-usage-today",
  // "Asia/Calcutta" (not "Asia/Kolkata") — Trigger.dev's cloud validator only accepts the
  // alias canonicalised by Intl.supportedValuesOf('timeZone'). Same UTC+5:30 zone.
  cron: { pattern: "*/15 * * * *", timezone: "Asia/Calcutta" },
  maxDuration: 120,
  run: async () => {
    const { rollupUsageForDays, istDateString } = await import(
      "@/lib/services/usage-service"
    );

    const today = istDateString(new Date());
    const written = await rollupUsageForDays([today]);

    console.log(`[usage-rollup/today] day=${today} rows=${written}`);
    return { day: today, rows: written };
  },
});

/**
 * Nightly: finalise the PRIOR IST day, then prune old raw ticks.
 * 00:20 IST (18:50 UTC) — a 20-min cushion past midnight so the last few ticks
 * of the day have been snapshotted before the final roll.
 */
export const rollupUsageNightlyTask = schedules.task({
  id: "rollup-usage-nightly",
  // "Asia/Calcutta" (not "Asia/Kolkata") — see rollupUsageTodayTask. Same UTC+5:30 zone.
  cron: { pattern: "20 0 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 300,
  run: async () => {
    const { rollupUsageForDays, pruneOldHeartbeats, istDateString } = await import(
      "@/lib/services/usage-service"
    );

    // Roll BOTH yesterday (final) and today (in case this run straddles the
    // boundary) — idempotent, so the small overlap is free insurance.
    const now = new Date();
    const yesterday = istDateString(new Date(now.getTime() - DAY_MS));
    const today = istDateString(now);
    const rows = await rollupUsageForDays([yesterday, today]);

    // Prune raw ticks older than 30 days — usage_daily already holds them.
    await pruneOldHeartbeats(30);

    console.log(
      `[usage-rollup/nightly] finalised=${yesterday} also=${today} rows=${rows} pruned>30d`,
    );
    return { finalised: yesterday, rows };
  },
});
