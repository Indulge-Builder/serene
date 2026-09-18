/**
 * vendor-extract.ts — the vendor extractor's heartbeat (migration 0214).
 *
 * Every five minutes: one batch of notes the Freshdesk mirror has written but
 * nobody has read for vendors yet. It calls Freshdesk NOT AT ALL — the mirror
 * (trigger/freshdesk-sync.ts, every minute) already holds the tickets, the notes
 * and the attachment bytes, and is the account's priority consumer of the
 * 50-calls-a-minute budget. This reads our own database and spends model tokens,
 * which is a different budget entirely.
 *
 * WHY FIVE MINUTES AND NOT ONE
 * The mirror runs every minute because Freshdesk calls are free and latency is
 * the point. A model read costs money per note, so this one is paced instead:
 * EXTRACT_NOTES_PER_CYCLE a pass, twelve passes an hour, which drains several
 * times the ~680 notes a day this account produces while keeping any burst from
 * spending the month's budget in an afternoon. A vendor reaches the tables
 * within about five minutes of the note being written.
 *
 * Nothing here is a no-op guard for cost: a quiet period claims zero notes and
 * costs zero. The pacing only bounds the ceiling.
 *
 * Env on the Trigger.dev worker: ANTHROPIC_API_KEY (through the Elaya provider)
 * and the Supabase service-role pair. A missing key fails every read closed, the
 * notes stay queued, and nothing is written — never a throw, never a half-row.
 */
import { schedules } from "@trigger.dev/sdk/v3";

export const vendorExtractTask = schedules.task({
  id: "vendor-extract",
  cron: { pattern: "*/5 * * * *" },
  maxDuration: 300,
  run: async () => {
    // Dynamic imports — keep server-only modules out of the Trigger.dev module scan
    // (the freshdesk-sync.ts convention).
    const { runVendorExtractCycle } = await import("@/lib/services/vendor-extract-sync");
    const stats = await runVendorExtractCycle();

    if (stats.notesRead === 0 && stats.notesFailed === 0 && stats.outcomesSettled === 0) return { idle: true };

    // Counts at every stage, on one line. Every silent-failure trap this codebase
    // has hit looked fine until someone counted; a number that looks wrong should
    // be visible here without anyone going digging.
    const line = {
      notesRead: stats.notesRead,
      notesFailed: stats.notesFailed,
      notesGivenUp: stats.notesGivenUp,
      notesDeferred: stats.notesDeferred,
      notesSkipped: stats.notesSkipped,
      filesRead: stats.filesRead,
      vendorsCreated: stats.vendorsCreated,
      vendorsMatched: stats.vendorsMatched,
      engagements: stats.engagementsWritten,
      duplicatesFlagged: stats.duplicatesFlagged,
      outcomesSettled: stats.outcomesSettled,
    };
    // A give-up is the loudest line here: a note the queue will never offer again.
    if (stats.notesGivenUp > 0 || stats.notesFailed > 0) console.error("[vendor-extract] cycle with failures", JSON.stringify(line));
    else console.log("[vendor-extract] cycle", JSON.stringify(line));
    return line;
  },
});
