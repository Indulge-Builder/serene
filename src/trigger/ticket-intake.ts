/**
 * ticket-intake.ts — the intake sweep's heartbeat (migration 0219, member-ticket-plan.md 7.8b).
 *
 * Every minute: read what is new in the linked member groups and file a card for anything that
 * reads as a request (services/ticket-intake.ts). It only PROPOSES; a human creates the ticket.
 * Gated by the `ticket_intake_enabled` row in elaya_settings: flipping it is the on/off, no deploy.
 *
 * One run at a time with a time budget well inside the minute, and a run that starts late
 * leaves at once: the lesson of 2026-09-18, a cycle longer than its schedule only grows a queue.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const ticketIntakeTask = schedules.task({
  id: "ticket-intake",
  cron: { pattern: "* * * * *" },
  maxDuration: 110,
  queue: { concurrencyLimit: 1 },
  run: async (payload) => {
    const lateMs = Date.now() - new Date(payload.timestamp).getTime();
    if (lateMs > 50_000) return { skipped: "stale", lateSeconds: Math.round(lateMs / 1000) };

    // Dynamic imports — keep the service graph out of the Trigger.dev module scan.
    const { getTicketIntakeEnabled } = await import("@/lib/services/llm-providers-service");
    if (!(await getTicketIntakeEnabled())) return { skipped: "disabled" };

    const { runIntakeSweep } = await import("@/lib/services/ticket-intake");
    const { INTAKE_RUN_BUDGET_MS } = await import("@/lib/constants/ticket-intake");
    const sweep = await runIntakeSweep({ apply: true, deadlineMs: INTAKE_RUN_BUDGET_MS });
    const count = (s: string) => sweep.outcomes.filter((o) => o.status === s).length;
    const line = { groups: sweep.groups, bursts: sweep.outcomes.length, skipped: count("skipped"), read: count("read"), proposed: count("proposed"), failed: count("failed") };
    console.log("[ticket-intake] sweep", JSON.stringify(line));
    return line;
  },
});
