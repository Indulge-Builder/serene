/**
 * freshdesk-sync.ts — the Freshdesk mirror's heartbeat (migration 0193).
 *
 * Every minute: one budgeted cycle of the sync core (services/freshdesk-sync.ts) —
 * reference data when due, the incremental `updated_since` poll, deferred threads, contacts
 * when due, then the backfill with whatever budget is left. The budget (FD_RUN_MAX_CALLS
 * per run, FD_RATE_RESERVE left for the member app) is what keeps a 50-calls-a-minute
 * account healthy; a run that stops early is finished by the next one.
 *
 * Latency: a change in Freshdesk reaches the mirror within ~60s from the poll alone. The
 * webhook route (api/webhooks/freshdesk) brings that to seconds once the automation rules
 * are registered (scripts/freshdesk/register-webhooks.ts); the poll stays as the truth path
 * that repairs anything a webhook missed (the old dashboard lost 162 tickets to webhooks).
 *
 * Files (0197): since 2026-09-17 the cloud cycle also works the attachment backlog — it
 * re-queues up to FD_MEDIA_FLAG_BATCH old threads a minute while the queue of genuinely
 * changed tickets is short, and every thread pull copies its files. The laptop loop
 * (scripts/freshdesk/backfill.ts --poll --media) is therefore optional; if it runs beside
 * this task, give it a small share (--calls 8) — both read the same rate-limit header.
 * One run at a time (concurrencyLimit 1) so two cycles never pull the same threads.
 *
 * Env on the Trigger.dev worker: FRESHDESK_DOMAIN, FRESHDESK_API_KEY, the Supabase
 * service-role pair. Missing config = a quiet no-op, never a throw.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const freshdeskSyncTask = schedules.task({
  id: "freshdesk-sync",
  cron: { pattern: "* * * * *" },
  // A cycle that copies files can outlive its minute; the next scheduled run waits its turn.
  maxDuration: 120,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Dynamic imports — keep server-only modules out of the Trigger.dev module scan.
    const { isFreshdeskConfigured, createFdBudget } = await import("@/lib/services/freshdesk-api");
    if (!isFreshdeskConfigured()) {
      console.log("[freshdesk-sync] not configured; skipping");
      return { skipped: true };
    }
    const { runSyncCycle } = await import("@/lib/services/freshdesk-sync");
    const { FD_MEDIA_FLAG_BATCH } = await import("@/lib/constants/freshdesk");
    const summary = await runSyncCycle(createFdBudget(), { flagMedia: FD_MEDIA_FLAG_BATCH });
    const line = {
      apiCalls: summary.apiCalls,
      rateRemaining: summary.rateRemaining,
      poll: { seen: summary.poll.ticketsSeen, written: summary.poll.ticketsWritten, changes: summary.poll.changesWritten, error: summary.poll.error },
      threads: summary.threads?.conversationsWritten ?? 0,
      files: Number(summary.poll.detail.media_copied ?? 0) + Number(summary.threads?.detail.media_copied ?? 0),
      backfill: summary.backfill ? { done: summary.backfill.detail.done, ticketsDone: summary.backfill.detail.tickets_done } : null,
    };
    if (summary.poll.error && !/budget|rate limited/i.test(summary.poll.error)) {
      console.error("[freshdesk-sync] poll error", line);
    } else {
      console.log("[freshdesk-sync] cycle", JSON.stringify(line));
    }
    return line;
  },
});
