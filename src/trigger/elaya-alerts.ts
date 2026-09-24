/**
 * elaya-alerts.ts — the live alert sweep's heartbeat (migration 0235, services/elaya-alerts.ts).
 *
 * Every five minutes: a member waiting too long, a Freshdesk ticket escalating, a chat turning sour,
 * or Elaya herself going silent on a message. Founders hear the first three at once; the tech
 * responders hear the fourth. Gated by the `elaya_alerts_enabled` row in elaya_settings (seeded
 * false): flipping it is the on/off, no deploy. One run at a time; a run that starts late leaves.
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { ALERT_RUN_BUDGET_MS } from "@/lib/constants/elaya-jobs";

export const elayaAlertsTask = schedules.task({
  id: "elaya-alerts",
  cron: { pattern: "*/5 * * * *" },
  maxDuration: 280,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 240_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getElayaAlertsEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getElayaAlertsEnabled())) return { skipped: "disabled" };
    const { runAlertSweep } = await import("@/lib/services/elaya-alerts");
    return runAlertSweep({ apply: true, deadlineMs: ALERT_RUN_BUDGET_MS });
  },
});
