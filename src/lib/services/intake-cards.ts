// intake-cards.ts — THE sessionless read of the open intake cards for a scope (2026-10-02, moved
// here from intake-service.ts on 2026-10-03 because that file is `server-only` and the teammate
// sweep runs from Trigger.dev). ADMIN client with the scope applied in code: the caller passes the
// queendom ids it may see, or null for every queendom. Two callers: Elaya's open-loops read
// (elaya-data.ts) and the teammate sweep (elaya-teammate.ts). The page reads stay in intake-service.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { mapRows } from "@/lib/utils/rows";

export type OpenIntakeCard = { id: string; member_id: string; member_name: string; queendom_id: string | null; group_jid: string | null; summary: string; confidence: number; tone: string | null; first_message_at: string; last_message_at: string; created_at: string };

/** The open REQUEST cards, newest first; `olderThan` keeps only cards whose request started before it. null = the read failed. */
export async function listOpenIntakeProposalsForScope(
  queendomIds: readonly string[] | null,
  opts: { since?: string | null; olderThan?: string | null; limit?: number } = {},
): Promise<{ proposals: OpenIntakeCard[]; total: number } | null> {
  const admin = createAdminClient();
  let q = admin.schema("sia").from("intake_proposals")
    .select("id, member_id, queendom_id, group_jid, kind, summary, confidence, tone, first_message_at, last_message_at, created_at", { count: "exact" })
    .eq("status", "open").eq("kind", "request");
  if (queendomIds) q = q.in("queendom_id", [...queendomIds]);
  if (opts.since) q = q.gte("first_message_at", opts.since);
  if (opts.olderThan) q = q.lte("first_message_at", opts.olderThan);
  const { data, error, count } = await q.order("created_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 20, 1), 200));
  if (error) { console.error("[intake-cards] scoped list failed", error.message); return null; }
  type R = Omit<OpenIntakeCard, "member_name" | "confidence"> & { confidence: number | string };
  const rows = mapRows<R, R>(data, (r) => r);
  const memberIds = [...new Set(rows.map((r) => r.member_id))];
  const names = new Map<string, string>();
  if (memberIds.length) {
    const { data: members } = await memberDb(admin).from("members").select("id, full_name").in("id", memberIds);
    mapRows<{ id: string; full_name: string }, void>(members, (m) => { names.set(m.id, m.full_name); });
  }
  return {
    proposals: rows.map((r) => ({ ...r, confidence: Number(r.confidence), member_name: names.get(r.member_id) ?? "A member" })),
    total: count ?? rows.length,
  };
}

/** Which of these cards are still open (the teammate sweep's resolve-on-evidence check). */
export async function openIntakeProposalIds(ids: readonly string[]): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set();
  const { data, error } = await createAdminClient().schema("sia").from("intake_proposals").select("id").in("id", [...ids]).eq("status", "open");
  if (error) { console.error("[intake-cards] open check failed", error.message); return null; }
  return new Set(mapRows<{ id: string }, string>(data, (r) => r.id));
}
