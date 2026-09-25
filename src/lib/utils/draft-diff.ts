// draft-diff.ts — THE comparison of a machine-drafted ticket against what the human made (0239).
//
// Pure and client-safe: the New ticket form uses it live (to ask "what did Serene get wrong?"
// only when something actually differs) and createTicketAction uses it server-side to write
// the correction into sia.draft_reviews. One function, so the form and the ledger can never
// disagree about what counts as a change. Never re-inline a field-by-field compare.

import type { TicketDraft } from "@/lib/types/ticket";

export type DraftCorrection = { field: string; from: string | null; to: string | null };

/** The fields of a ticket the draft can fill; the brief is compared key by key. */
export type DraftComparable = {
  category: string;
  sub_category: string | null;
  title: string;
  priority: string;
  requested_for: string | null;
  brief: Record<string, unknown>;
};

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * Every field that differs between the draft and what was made, as from → to.
 * `requested_for` compares on the minute (the form holds a datetime-local, the draft an ISO
 * string with seconds). An empty array means "accepted exactly as drafted".
 */
export function diffDraft(draft: Partial<TicketDraft>, made: DraftComparable): DraftCorrection[] {
  const out: DraftCorrection[] = [];
  const push = (field: string, a: unknown, b: unknown) => {
    const from = norm(a);
    const to = norm(b);
    if (from !== to) out.push({ field, from, to });
  };
  push("category", draft.category, made.category);
  push("sub_category", draft.sub_category, made.sub_category);
  push("title", draft.title, made.title);
  push("priority", draft.priority, made.priority);
  push("requested_for", draft.requested_for?.slice(0, 16), made.requested_for?.slice(0, 16));
  const d = (draft.brief ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(d), ...Object.keys(made.brief)])) push(`brief.${k}`, d[k], made.brief[k]);
  return out;
}

/** The field names only (what sia.intake_proposals.fields_changed has always stored). */
export function changedFieldNames(corrections: DraftCorrection[]): string[] {
  return corrections.map((c) => c.field);
}
