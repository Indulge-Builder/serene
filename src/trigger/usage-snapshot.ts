/**
 * usage-snapshot.ts — the 1-minute active-presence snapshot (adoption tracking,
 * migration 0126).
 *
 * ONE scheduled Trigger.dev task. Every minute it reads the LIVE Redis presence
 * keys (which the client heartbeat SETs only while active — visible + recently
 * interacted) and appends one usage_heartbeats row per active user. This is the
 * ONLY writer of usage_heartbeats — the request/heartbeat path never touches
 * Postgres (that would be a write storm at 300 users; the hot path is one Redis
 * SET). The rollup job later turns these ticks into usage_daily.
 *
 * Idempotency: each tick is an independent append of "who was active in the
 * last interval". A duplicate run in the same minute would add at most one
 * extra row per user for that minute — and the rollup counts DISTINCT
 * minute-buckets, so a same-minute duplicate collapses to the same active
 * minute. No dedup key needed; Trigger.dev also dedups the scheduled tick.
 */

import { schedules } from "@trigger.dev/sdk/v3";

export const snapshotUsagePresenceTask = schedules.task({
  id: "snapshot-usage-presence",
  // Every minute. The presence keys carry a 150s TTL, so a user who stops
  // beating disappears from this scan within ~1–2 ticks of going idle/hidden.
  cron: "* * * * *",
  maxDuration: 60,
  run: async () => {
    // Dynamic import — keep server-only modules out of the Trigger.dev scan.
    const { listLivePresence, insertUsageHeartbeats } = await import(
      "@/lib/services/usage-service"
    );

    const live = await listLivePresence();
    if (live.length === 0) {
      return { active: 0, inserted: 0 };
    }

    const inserted = await insertUsageHeartbeats(
      live.map((p) => ({ user_id: p.userId, domain: p.domain })),
    );

    console.log(
      `[usage-snapshot] active=${live.length} inserted=${inserted}`,
    );
    return { active: live.length, inserted };
  },
});
