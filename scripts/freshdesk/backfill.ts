/**
 * scripts/freshdesk/backfill.ts — pull the whole Freshdesk history into the mirror
 * (migration 0193) from this machine, faster than the minute task alone.
 *
 * Runs the SAME sync core the Trigger.dev task runs (services/freshdesk-sync.ts), in a loop:
 * each minute one budgeted cycle — the backfill pages (oldest update first) and then the
 * thread catch-up (newest tickets first) — until the backfill cursor says done or the
 * time limit is reached. Safe to stop and restart: every step is an idempotent upsert on
 * Freshdesk's own ids, and the cursor lives in freshdesk.sync_state.
 *
 * The account allows 50 API calls a minute, so the loop spends at most --calls per minute
 * (default 42) and always leaves the reserve. At that pace the ~55k-ticket history takes
 * about six hours for the tickets (100 per call) and about a day for every thread (one call
 * per ticket); the newest threads land first because the catch-up is newest-first.
 *
 * --poll is the other mode: the minute task, run from here. Each minute it runs the SAME
 * runSyncCycle the Trigger.dev task runs (reference when due → poll from the watermark →
 * deferred threads → contacts when due → backfill leftovers → field choices), so the
 * mirror keeps up with Freshdesk until `pnpm trigger:deploy` puts the real task in place.
 * The history loaded from the account export left the watermark at the export's last
 * update, so the first cycles catch up on everything since, oldest first.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/freshdesk/backfill.ts [--minutes N] [--calls N] [--threads-only]
 *   npx tsx --env-file=.env.local scripts/freshdesk/backfill.ts --poll [--minutes N] [--calls N]
 */
import {
  createFdBudget,
  isFreshdeskConfigured,
} from "../../src/lib/services/freshdesk-api";
import {
  runBackfillStep,
  runReferenceStep,
  runFieldChoicesStep,
  runThreadCatchupStep,
  runContactsStep,
  runSyncCycle,
  getSyncState,
} from "../../src/lib/services/freshdesk-sync";
import { FD_RATE_RESERVE, FD_SYNC_KEYS } from "../../src/lib/constants/freshdesk";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}
const MINUTES = arg("--minutes", 24 * 60);
const CALLS = arg("--calls", 42);
const THREADS_ONLY = process.argv.includes("--threads-only");
const POLL = process.argv.includes("--poll");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** The minute task from a laptop: one runSyncCycle per minute until the time limit. */
async function pollLoop() {
  const startedAt = Date.now();
  let minute = 0;
  console.log(`[poll] starting: ${CALLS} calls a minute for ${MINUTES} minutes; Ctrl-C to stop`);
  while (Date.now() - startedAt < MINUTES * 60_000) {
    minute += 1;
    const budget = createFdBudget(CALLS, FD_RATE_RESERVE);
    const t0 = Date.now();
    let line = `[poll ${new Date().toISOString().slice(11, 19)}Z #${minute}]`;
    try {
      const c = await runSyncCycle(budget);
      const p = c.poll;
      line += ` tickets seen=${p.ticketsSeen} written=${p.ticketsWritten}`;
      line += ` threads=${Number(p.detail.threads_synced ?? 0) + Number(c.threads?.conversationsWritten ?? 0)}`;
      if (Number(p.detail.threads_deferred ?? 0) > 0) line += ` deferred=${p.detail.threads_deferred}`;
      if (p.error && !p.error.includes("budget")) line += ` error=${p.error}`;
      const state = await getSyncState<{ watermark?: string }>(FD_SYNC_KEYS.poll);
      line += ` watermark=${state?.watermark ?? "?"}`;
    } catch (e) {
      line += ` error=${e instanceof Error ? e.message : String(e)}`;
    }
    line += ` calls=${budget.calls} remaining=${budget.remaining ?? "?"}`;
    console.log(line);
    const elapsed = Date.now() - t0;
    if (elapsed < 61_000) await sleep(61_000 - elapsed);
  }
  console.log("[poll] time limit reached; start again to keep the mirror fresh.");
}

async function main() {
  if (!isFreshdeskConfigured()) {
    console.error("FRESHDESK_DOMAIN / FRESHDESK_API_KEY missing (use --env-file=.env.local)");
    process.exit(1);
  }
  if (POLL) {
    await pollLoop();
    return;
  }
  const startedAt = Date.now();
  // Reference data first, once: groups, agents, SLA policies, the field list + choices.
  {
    const budget = createFdBudget(CALLS, FD_RATE_RESERVE);
    const ref = await runReferenceStep(budget, true);
    const choices = await runFieldChoicesStep(budget, 20);
    console.log(`[reference] ${JSON.stringify(ref.detail)} fields-with-choices=${choices.detail.fields_done} calls=${budget.calls}`);
    await sleep(61_000);
  }
  let minute = 0;
  while (Date.now() - startedAt < MINUTES * 60_000) {
    minute += 1;
    const budget = createFdBudget(CALLS, FD_RATE_RESERVE);
    const t0 = Date.now();
    let line = `[min ${minute}]`;
    try {
      if (!THREADS_ONLY) {
        const b = await runBackfillStep(budget);
        line += ` backfill seen=${b.ticketsSeen} done=${b.detail.tickets_done} finished=${b.detail.done}`;
      }
      const t = await runThreadCatchupStep(budget, 40);
      line += ` threads=${t.conversationsWritten}`;
      if (minute % 10 === 1) {
        const c = await runContactsStep(budget, 3);
        line += ` contacts=${c.detail.contacts_written}`;
      }
    } catch (e) {
      line += ` error=${e instanceof Error ? e.message : String(e)}`;
    }
    line += ` calls=${budget.calls} remaining=${budget.remaining ?? "?"}`;
    console.log(line);

    const state = await getSyncState<{ done?: boolean }>(FD_SYNC_KEYS.backfill);
    const threadsLeft = await threadsPending();
    if (state?.done && threadsLeft === 0) {
      console.log("Backfill complete: every ticket and every thread is mirrored.");
      break;
    }
    const elapsed = Date.now() - t0;
    if (elapsed < 61_000) await sleep(61_000 - elapsed);
  }
}

async function threadsPending(): Promise<number> {
  const { freshdeskDb } = await import("../../src/lib/services/freshdesk-sync");
  const { count } = await freshdeskDb()
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .is("conversations_synced_at", null)
    .eq("deleted", false);
  return Number(count ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
