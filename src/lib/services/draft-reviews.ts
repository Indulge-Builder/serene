// draft-reviews.ts — THE training ledger for machine drafts (0239): one row per human verdict.
//
// Three sources write here, through ONE core: an intake card decided on /tickets, a ticket
// created from the New ticket form's draft (a Sia selection, no card), and the sentinel's
// suggested status move on a ticket. The row keeps the draft as it was, what the human made,
// every correction as from → to, the reason, and the human's own words. The lesson writer
// reads this table and nothing else; the prompts never read it.
//
// Posture: the write is best-effort and never throws (the activity-events posture): a ticket
// must be created even when the ledger is down. Admin client, no `server-only` chain
// (ticket-mutations.ts calls it from the sentinel path, which also runs on Trigger.dev).
// Rule 08: append-only; there is no update or delete here and there never will be.

import { createAdminClient } from "@/lib/supabase/admin";
import type { DraftCorrection } from "@/lib/utils/draft-diff";
import type { DraftReviewDecision, DraftReviewSource } from "@/lib/types/intake";
import type { IntakeDismissReason } from "@/lib/constants/ticket-intake";

const LOG = "[draft-reviews]";

export type RecordDraftReviewInput = {
  source: DraftReviewSource;
  decision: DraftReviewDecision;
  member_id: string | null;
  queendom_id: string | null;
  proposal_id?: string | null;
  ticket_id?: string | null;
  run_id?: string | null;
  prompt_version?: string | null;
  draft: Record<string, unknown>;
  final?: Record<string, unknown> | null;
  corrections?: DraftCorrection[];
  dismiss_reason?: IntakeDismissReason | string | null;
  feedback?: string | null;
  decided_by: string | null;
};

/** Write one verdict. Never throws; a failure is logged and the caller's own write stands. */
export async function recordDraftReviewCore(input: RecordDraftReviewInput): Promise<void> {
  try {
    const { error } = await createAdminClient().schema("sia").from("draft_reviews").insert({
      source: input.source, decision: input.decision,
      member_id: input.member_id, queendom_id: input.queendom_id,
      proposal_id: input.proposal_id ?? null, ticket_id: input.ticket_id ?? null,
      run_id: input.run_id ?? null, prompt_version: input.prompt_version ?? null,
      draft: input.draft as never, final: (input.final ?? null) as never,
      corrections: (input.corrections ?? []) as never,
      dismiss_reason: input.dismiss_reason ?? null, feedback: input.feedback ?? null,
      decided_by: input.decided_by || null,
    });
    if (error) console.warn(`${LOG} record failed (non-fatal):`, error.message);
  } catch (e) {
    console.warn(`${LOG} record threw (non-fatal):`, e instanceof Error ? e.message : e);
  }
}

// The page read (listDraftReviews) lives in intake-service.ts: it needs the session client, and
// this file must stay free of the `server-only` chain for the sentinel path.
