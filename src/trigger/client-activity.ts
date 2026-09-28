/**
 * client-activity.ts — the Jokers' Activity recount (migration 0250).
 *
 * Every five minutes (owner, 2026-09-28): refresh who is on our team, then recount today and
 * yesterday for every linked member group, so a client who writes shows as Active within five
 * minutes. Every night at 04:00 IST: recount the last 30 days, so a phone linked to a Serene account
 * late also corrects the past. Counting only, no model, no cost.
 *
 * ON unless the `client_activity_enabled` row in elaya_settings says exactly false. One run at a
 * time; a run that starts late leaves at once (a cycle longer than its schedule only grows a queue).
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { CLIENT_ACTIVITY_CRON, CLIENT_ACTIVITY_NIGHTLY_DAYS } from "@/lib/constants/joker-engagement";

async function recount(daysBack: number) {
  // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
  const { getClientActivityEnabled } = await import("@/lib/services/llm-providers-service");
  if (!(await getClientActivityEnabled())) return { skipped: "disabled" };
  const { refreshClientActivity } = await import("@/lib/services/client-activity-service");
  const { istDay, addDays } = await import("@/lib/utils/client-activity");
  const today = istDay(new Date());
  const from = addDays(today, -daysBack);
  const r = await refreshClientActivity(from, today);
  const line = { from, to: today, ...r };
  console.log("[client-activity] run", JSON.stringify(line));
  return line;
}

export const clientActivityTask = schedules.task({
  id: "client-activity",
  cron: { pattern: CLIENT_ACTIVITY_CRON },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 120_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    return recount(1);
  },
});

export const clientActivityNightlyTask = schedules.task({
  id: "client-activity-nightly",
  cron: { pattern: "0 4 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  run: async () => recount(CLIENT_ACTIVITY_NIGHTLY_DAYS - 1),
});
