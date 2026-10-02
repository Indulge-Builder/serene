/**
 * sia-membership.ts — once a day (09:00 IST), check that the standby WhatsApp number
 * and the watcher's own number are in every linked member group
 * (services/sia-membership.ts, migration 0249). The fallback is only real while the
 * standby sits in the groups; this is what notices the day it does not.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const siaMembershipCheckTask = schedules.task({
  id: "sia-membership-check",
  cron: { pattern: "0 9 * * *", timezone: "Asia/Calcutta" },
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const { runMembershipCheck } = await import("@/lib/services/sia-membership");
    const r = await runMembershipCheck({ apply: true });
    console.log("[sia-membership]", JSON.stringify(r));
    return r;
  },
});
