/**
 * desk-sender.ts — the desks outbox heartbeat (migration 0248, services/desk-sender.ts).
 *
 * Every minute: speak the queued desk_outbox rows on the table speakers through Voice Monkey and
 * settle them. The announcement action already tries once inside after(); this is the retry, and
 * the only path for the sweep's alerts and Elaya's reminders. Gated by `desks_enabled` (seeded
 * false). One run at a time; a run that starts late leaves.
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { DESK_SENDER_RUN_BUDGET_MS } from "@/lib/constants/desks";

export const deskSenderTask = schedules.task({
  id: "desk-sender",
  cron: { pattern: "* * * * *" },
  maxDuration: 90,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 50_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getDesksSettings } = await import("@/lib/services/llm-providers-service");
    if (!(await getDesksSettings()).enabled) return { skipped: "disabled" };
    const { runDeskSender } = await import("@/lib/services/desk-sender");
    return runDeskSender({ deadlineMs: DESK_SENDER_RUN_BUDGET_MS });
  },
});
