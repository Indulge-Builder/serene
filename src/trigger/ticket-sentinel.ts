/**
 * ticket-sentinel.ts — the sentinel pool's heartbeat (migration 0199, member-ticket-plan.md 7.6).
 *
 * Every minute: claim the tickets whose alarm has rung (claim_sentinel_wakes, leased so a second
 * worker never takes the same one) and run one wake each — the rule pass, the reading pass when
 * new text arrived, then sleep until the next deadline. A crashed run leaves its lease to expire
 * and the next minute picks the ticket up. Nothing here runs a model unless a note or a client
 * message is new; most wakes cost nothing.
 *
 * Env on the worker: the Supabase service-role pair, ANTHROPIC_API_KEY (the reading pass goes
 * through the Elaya provider), UPSTASH (notifications' push path).
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const ticketSentinelTask = schedules.task({
  id: "ticket-sentinel",
  cron: { pattern: "* * * * *" },
  maxDuration: 60,
  run: async () => {
    // Dynamic import — keeps server-only modules out of the Trigger.dev module scan.
    const { runSentinelSweep } = await import("@/lib/services/ticket-sentinel");
    const s = await runSentinelSweep({ deadlineMs: 45_000 });
    const line = { claimed: s.claimed, fires: s.fires, reads: s.reads, closed: s.closed, errors: s.errors, tickets: s.woken.map((w) => `${w.ticket_no}:${w.fires.join("+") || "-"}${w.read ? " read" : ""}${w.error ? " ERR" : ""}`) };
    if (s.errors) console.error("[ticket-sentinel] sweep with errors", JSON.stringify(line));
    else if (s.claimed) console.log("[ticket-sentinel] sweep", JSON.stringify(line));
    return line;
  },
});
