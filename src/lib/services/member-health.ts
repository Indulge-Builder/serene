// member-health.ts — THE way a READER moves a member's health score (the ticket intake today,
// the sentinel tomorrow): one write, the delta from the policy row, the member's own words as
// the reason, and the same signal not written twice in a day.
//
// Deliberately free of `server-only` and of any module that carries it (member-mutations.ts
// reaches sia-service, which is server-only): the intake sweep runs from Trigger.dev. The
// by-hand adjustment stays in member-mutations.ts (addHealthAdjustCore); this is its sibling
// for machines, the member-relations.ts posture.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import type { Json } from "@/lib/types/database";

export type HealthSignalInput = {
  signal: string;
  /** The line the Health card shows as the reason (it prefers the note over the policy label). */
  note: string;
  evidence: Record<string, unknown>;
  run_id?: string | null;
  observed_at?: string;
  /** No second event of the SAME signal for this member inside this many hours: a member who is upset sends five messages, not five complaints. */
  dedupe_hours?: number;
};

/**
 * THE way a reader (intake, later the sentinel) moves a member's health: the delta comes from
 * the policy row at write time (a policy change never rewrites history), the note carries the
 * member's words so the score always explains itself, and the same signal is not written twice
 * within `dedupe_hours`. Returns `{ id: null }` when it was skipped as a repeat.
 */
export async function addHealthSignalCore(clientId: string, input: HealthSignalInput): Promise<{ data: { id: string | null }; error: null } | { data: null; error: string }> {
  const admin = createAdminClient();
  const { data: policy } = await memberDb(admin).from("member_health_policy").select("delta").eq("signal", input.signal).maybeSingle();
  if (!policy) return { data: null, error: `Unknown health signal ${input.signal}.` };
  const observedAt = input.observed_at ?? new Date().toISOString();
  if (input.dedupe_hours && input.dedupe_hours > 0) {
    const since = new Date(new Date(observedAt).getTime() - input.dedupe_hours * 3600_000).toISOString();
    const { data: recent } = await memberDb(admin).from("member_health_events").select("id").eq("member_id", clientId).eq("signal", input.signal).gte("observed_at", since).limit(1);
    if (recent?.length) return { data: { id: null }, error: null };
  }
  const { data, error } = await memberDb(admin).from("member_health_events").insert({
    member_id: clientId, signal: input.signal, delta: Number((policy as { delta: number }).delta), note: input.note.slice(0, 300),
    evidence: input.evidence as unknown as Json, run_id: input.run_id ?? null, observed_at: observedAt,
  }).select("id").single();
  if (error || !data) { console.error("[member-health] write failed", error?.message); return { data: null, error: "Could not record the health signal." }; }
  return { data: { id: (data as { id: string }).id }, error: null };
}

