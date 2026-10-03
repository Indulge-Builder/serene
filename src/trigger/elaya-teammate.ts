/**
 * elaya-teammate.ts — the operating teammate's heartbeat (migration 0257, services/elaya-teammate.ts).
 *
 * Every five minutes: a last-mile check a ticket still owes, silence after options, a request on
 * no ticket, the week's occasions. Typed rules, no model. Gated by `elaya_teammate_mode`: off does
 * nothing; shadow writes the rows and sends nothing; live sends to the queendoms named in
 * `elaya_teammate_queendoms`. One run at a time; a run that starts late leaves.
 */
import { schedules } from "@trigger.dev/sdk/v3";
import { TEAMMATE_RUN_BUDGET_MS } from "@/lib/constants/elaya-teammate";

export const elayaTeammateTask = schedules.task({
  id: "elaya-teammate",
  cron: { pattern: "*/5 * * * *" },
  maxDuration: 280,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 240_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };
    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getTeammateSettings } = await import("@/lib/services/llm-providers-service");
    if ((await getTeammateSettings()).mode === "off") return { skipped: "off" };
    const { runTeammateSweep } = await import("@/lib/services/elaya-teammate");
    return runTeammateSweep({ apply: true, deadlineMs: TEAMMATE_RUN_BUDGET_MS });
  },
});
