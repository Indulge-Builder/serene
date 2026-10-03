/**
 * hands-router.ts — the many-jobs side of the Hands line (services/hands-router.ts, 2026-10-03).
 * Every minute: close the chats of finished jobs, send the jobs waiting for a slot, and place the
 * agent's replies the connector could not file. Runs only while `hands_enabled` is on.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const handsRouterTask = schedules.task({
  id: "hands-router",
  cron: { pattern: "* * * * *" },
  maxDuration: 90,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    if (Date.now() - new Date(payload.timestamp).getTime() > 45_000) return { skipped: "stale" };
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getHandsSettings } = await import("@/lib/services/llm-providers-service");
    if (!(await getHandsSettings()).enabled) return { skipped: "disabled" };
    const { runHandsRouter } = await import("@/lib/services/hands-router");
    return runHandsRouter({ apply: true });
  },
});
