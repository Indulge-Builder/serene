// Lead Revival — candidate ledger + silence finder. SERVER ONLY.
//
// THE revival_candidates / revival_policies access layer (admin client — the sweep
// runs in a Trigger.dev context with no session; the review/settings reads are
// gated by the calling action/page = trust boundary, Q-13; mirrors elaya-service /
// elaya-actions-service).
//
// Revival is a LAYER over leads: nothing here writes the leads row. The only
// lead-facing mutation is the follow-up TASK, and that goes through the shared
// createLeadTaskCore (lead-mutations.ts) in the action/sweep callers — never here.
//
// The open → actioned/dismissed flip is a resolve-once admin-client UPDATE (the
// A-11 carve-out documented in the migration). Column restriction (only
// status/resolved_at/resolved_by move) is enforced here in code, not in SQL.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { toISTMidnight } from "@/lib/utils/ist";
import {
  REVIVAL_TRIGGER_STATUSES,
  REVIVAL_SWEEP_BATCH_PER_STATUS,
  type RevivalTriggerStatus,
} from "@/lib/constants/revival";
import type {
  RevivalCandidateRow,
  RevivalCandidateStatus,
  RevivalPolicyRow,
  RevivalVerdict,
} from "@/lib/types/revival";

// ─────────────────────────────────────────────
// Config — read PER sweep run, never module-cached (sla_policies convention).
// ─────────────────────────────────────────────

/** Active revival policies (one per trigger status). Admin client — no session. */
export async function getActiveRevivalPolicies(): Promise<RevivalPolicyRow[]> {
  const admin = createAdminClient();
  // revival_policies / revival_candidates are not in the generated Database type
  // until 0119 is applied + types regenerated — same interim cast convention as
  // elaya-actions-service (admin client + `as any` on .from, result cast to the
  // hand-declared row type in src/lib/types/revival.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_policies")
    .select("*")
    .eq("active", true);

  if (error || !data) {
    if (error) console.error("[revival-service] getActiveRevivalPolicies failed:", error.message);
    return [];
  }
  return data as RevivalPolicyRow[];
}

/** All revival policies (incl. inactive) for the settings panel. Admin client. */
export async function getAllRevivalPolicies(): Promise<RevivalPolicyRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_policies")
    .select("*")
    .order("trigger_status", { ascending: true });

  if (error || !data) {
    if (error) console.error("[revival-service] getAllRevivalPolicies failed:", error.message);
    return [];
  }
  return data as RevivalPolicyRow[];
}

/**
 * Patch a revival policy (admin client — 0119 has no write RLS by design; the
 * gated updateRevivalPolicyAction is the trust boundary). Only silence_days /
 * daily_cap_per_agent / active are patchable — trigger_status is the PK and never
 * changes through the UI.
 */
export async function updateRevivalPolicy(
  triggerStatus: string,
  patch: { silence_days?: number; daily_cap_per_agent?: number; active?: boolean },
): Promise<RevivalPolicyRow | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_policies")
    .update(patch)
    .eq("trigger_status", triggerStatus)
    .select("*")
    .single();

  if (error || !data) {
    if (error) console.error("[revival-service] updateRevivalPolicy failed:", error.message);
    return null;
  }
  return data as RevivalPolicyRow;
}

// ─────────────────────────────────────────────
// Silence finder — leads past their status threshold with NO open candidate.
// ─────────────────────────────────────────────

export type SilentLeadRow = {
  id: string;
  slug: string | null;
  assigned_to: string | null;
  domain: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Find leads in `triggerStatus` that have been silent for >= silenceDays and have
 * NO existing revival_candidate of ANY status. Silence = the more recent of
 * status_changed_at / last_activity_at older than the threshold.
 *
 * The anti-join is on ANY candidate, not just 'open' — a lead the gate already
 * judged has a settled disposition (open = awaiting review, actioned = revived,
 * dismissed = confident junk) and must NOT be re-judged on the next sweep. Without
 * this, a 'dismissed' lead (no open candidate) would re-enter the pool every night,
 * get re-dismissed, pile up duplicate dismissed rows, and burn a gate LLM call on a
 * known-dead lead. The partial UNIQUE index still backstops the one-OPEN guard for
 * the race; this anti-join is the broader "judge each silent lead once" rule. A lead
 * naturally re-qualifies only if it leaves and re-enters a trigger status (the
 * candidate then no longer blocks a fresh judgement of the new dormancy episode... —
 * but candidates are append-only by lead, so today a judged lead stays judged; that
 * is the intended R1 behaviour, revisited if re-revival-after-status-churn is wanted).
 *
 * Excludes archived + unassigned (a revive task needs an owner). Bounded per run
 * (REVIVAL_SWEEP_BATCH_PER_STATUS), oldest-silent first so the most dormant leads
 * are judged before the budget runs out.
 *
 * Cold is NOT a status here — only touched/in_discussion/nurturing reach this via
 * the active policy rows.
 */
export async function findSilentLeadsForStatus(
  triggerStatus: RevivalTriggerStatus,
  silenceDays: number,
): Promise<SilentLeadRow[]> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() - silenceDays * 86_400_000).toISOString();

  // The set of lead_ids that ALREADY hold a candidate of any status — anti-joined
  // below so a judged lead is never re-judged (prevents duplicate dismissals + a
  // wasted gate call on a settled lead).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: judgedRows } = await (admin as any)
    .from("revival_candidates")
    .select("lead_id");
  const judgedLeadIds = new Set(
    ((judgedRows ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id),
  );

  // Silence uses status_changed_at as the primary clock (when the lead entered
  // this status), falling back to last_activity_at. We filter on status_changed_at
  // < threshold AND (last_activity_at IS NULL OR last_activity_at < threshold) so a
  // recent touch (call note) keeps the lead out of the candidate pool.
  const { data, error } = await admin
    .from("leads")
    .select("id, slug, assigned_to, domain, status, first_name, last_name, last_activity_at")
    .eq("status", triggerStatus)
    .is("archived_at", null)
    .not("assigned_to", "is", null)
    .lt("status_changed_at", threshold)
    .order("status_changed_at", { ascending: true })
    .limit(REVIVAL_SWEEP_BATCH_PER_STATUS + judgedLeadIds.size);

  if (error || !data) {
    if (error) console.error("[revival-service] findSilentLeadsForStatus failed:", error.message);
    return [];
  }

  const out: SilentLeadRow[] = [];
  for (const r of data as Array<Record<string, unknown>>) {
    if (judgedLeadIds.has(r.id as string)) continue; // already judged — settled disposition
    // A recent activity (within the window) means the lead isn't actually silent.
    const lastActivity = r.last_activity_at as string | null;
    if (lastActivity && lastActivity >= threshold) continue;
    out.push({
      id: r.id as string,
      slug: (r.slug as string | null) ?? null,
      assigned_to: (r.assigned_to as string | null) ?? null,
      domain: r.domain as string,
      status: r.status as string,
      first_name: (r.first_name as string | null) ?? null,
      last_name: (r.last_name as string | null) ?? null,
    });
    if (out.length >= REVIVAL_SWEEP_BATCH_PER_STATUS) break;
  }
  return out;
}

// ─────────────────────────────────────────────
// Daily cap — actioned (auto-revived) candidates per agent since IST midnight.
// ─────────────────────────────────────────────

/**
 * Count today's AUTO-revive tasks for an agent (candidates that became 'actioned'
 * by the system — resolved_by IS NULL — since IST midnight). Filters on the
 * DENORMALISED revival_candidates.assigned_to column (NOT a leads embed) — a
 * head:true/count query silently drops an embed filter (the getNextLeadTask
 * caveat), which would count org-wide instead of per-agent. Fails CLOSED: a broken
 * count returns the cap as already-reached (Infinity) so a glitch never floods an
 * agent. Mirrors elaya-service.countUserMessagesToday's fail-closed.
 */
export async function countAutoRevivesToday(agentId: string): Promise<number> {
  const admin = createAdminClient();
  const istMidnight = toISTMidnight(new Date()).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from("revival_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "actioned")
    .is("resolved_by", null)
    .eq("assigned_to", agentId)
    .gte("resolved_at", istMidnight);

  if (error) {
    console.error("[revival-service] countAutoRevivesToday failed (fail-closed):", error.message);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

// ─────────────────────────────────────────────
// Candidate ledger writes — append + resolve-once flip (admin client).
// ─────────────────────────────────────────────

/**
 * Insert a candidate. Status 'open' (review tab) or 'actioned' (auto-revived — the
 * sweep already created the task). Relies on idx_revival_candidates_one_open: a
 * concurrent second open insert for the same lead fails the unique index (caught
 * here, returns null) — the structural one-open guard.
 */
export async function insertRevivalCandidate(input: {
  leadId: string;
  /** The lead's assignee — denormalised so the daily-cap count is a native filter. */
  assignedTo: string | null;
  verdict: RevivalVerdict;
  reasoning: string;
  triggerStatus: RevivalTriggerStatus;
  suggestedReviveAt: string | null;
  // 'open' = review tab; 'actioned' = auto-revived (task already created); 'dismissed'
  // = confident junk (the gate's 'dismiss' verdict — kept as the audit log, never
  // surfaced in review). All three are SYSTEM writes here (resolved_by stays null).
  status: Extract<RevivalCandidateStatus, "open" | "actioned" | "dismissed">;
  /** For an auto-resolved row (actioned/dismissed): the system stamps resolved_at. */
  resolvedAt?: string | null;
}): Promise<RevivalCandidateRow | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_candidates")
    .insert({
      lead_id: input.leadId,
      assigned_to: input.assignedTo,
      verdict: input.verdict,
      ai_reasoning: input.reasoning,
      trigger_status: input.triggerStatus,
      suggested_revive_at: input.suggestedReviveAt,
      status: input.status,
      // 'open' stays unresolved (a human acts later); 'actioned'/'dismissed' are
      // resolved at creation by the system, so stamp resolved_at now.
      resolved_at: input.status === "open" ? null : (input.resolvedAt ?? new Date().toISOString()),
      resolved_by: null, // system write; a human review fills this via markCandidateResolved
    })
    .select("*")
    .single();

  if (error || !data) {
    // A unique-violation (23505) here is the one-open guard firing on a race — not
    // an error worth shouting about; the existing open candidate stands.
    if (error && error.code !== "23505") {
      console.error("[revival-service] insertRevivalCandidate failed:", error.message);
    }
    return null;
  }
  return data as RevivalCandidateRow;
}

/**
 * Resolve a candidate open → actioned/dismissed (the A-11 carve-out flip). Only the
 * resolution fields move; verdict/reasoning/lead_id are write-once. `resolvedBy` is
 * the human who actioned/dismissed it from the review tab. Idempotent: the
 * `status='open'` guard means a second resolve is a no-op (returns null).
 */
export async function markCandidateResolved(
  candidateId: string,
  status: Extract<RevivalCandidateStatus, "actioned" | "dismissed">,
  resolvedBy: string,
): Promise<boolean> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_candidates")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
    .eq("id", candidateId)
    .eq("status", "open") // resolve-once: only an open candidate may move
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[revival-service] markCandidateResolved failed:", error.message);
    return false;
  }
  return data !== null;
}

/** The single open candidate for a lead (the one-open guard means ≤1). */
export async function getOpenCandidateForLead(
  leadId: string,
): Promise<RevivalCandidateRow | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("revival_candidates")
    .select("*")
    .eq("lead_id", leadId)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("[revival-service] getOpenCandidateForLead failed:", error.message);
    return null;
  }
  return (data as RevivalCandidateRow | null) ?? null;
}

// ─────────────────────────────────────────────
// Review predicate — lead_ids with an open candidate + their reasoning.
// ─────────────────────────────────────────────

export type OpenCandidateLite = {
  candidateId: string;
  leadId: string;
  verdict: RevivalVerdict;
  reasoning: string;
  suggestedReviveAt: string | null;
  createdAt: string;
};

/**
 * All OPEN candidate lead_ids visible to the caller (the review-tab predicate).
 * Uses the SESSION client so RLS scopes by role/domain exactly like leads — the
 * review tab shows an agent only their own leads, a manager only their domain.
 * Returns a Map keyed by lead_id so the review column can show reasoning per row.
 *
 * Pass a session supabase client (from the page/action) — this is the one read in
 * the file that must NOT use the admin client (it IS the access boundary).
 */
export async function getOpenCandidatesForCaller(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionClient: any,
): Promise<Map<string, OpenCandidateLite>> {
  const { data, error } = await sessionClient
    .from("revival_candidates")
    .select("id, lead_id, verdict, ai_reasoning, suggested_revive_at, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[revival-service] getOpenCandidatesForCaller failed:", error.message);
    return new Map();
  }

  const map = new Map<string, OpenCandidateLite>();
  for (const r of mapRows<Record<string, unknown>, OpenCandidateLite>(data, (row) => ({
    candidateId: row.id as string,
    leadId: row.lead_id as string,
    verdict: row.verdict as RevivalVerdict,
    reasoning: row.ai_reasoning as string,
    suggestedReviveAt: (row.suggested_revive_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }))) {
    // One open candidate per lead (the unique index) — first write wins if duped.
    if (!map.has(r.leadId)) map.set(r.leadId, r);
  }
  return map;
}

// Re-export the trigger-status list for the sweep's convenience.
export { REVIVAL_TRIGGER_STATUSES };
