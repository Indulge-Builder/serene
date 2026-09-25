// intake-service.ts — the reads and the resolve-once write for intake proposals (0219).
//
// Reads go through the SESSION client: RLS (can_access_member_queendom) is what scopes a card
// to its queendom, exactly as it does a ticket. The one write, resolving a card, uses the admin
// client AFTER the action has gated the caller (Q-13), and only ever moves an OPEN card.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { mapRows } from "@/lib/utils/rows";
import { INTAKE_EXAM_CARDS, INTAKE_STRIP_LIMIT, type IntakeDismissReason } from "@/lib/constants/ticket-intake";
import type { IntakeProposal, IntakeProposalMessage, IntakeStats } from "@/lib/types/intake";
import type { TicketDraft } from "@/lib/types/ticket";

type Row = Omit<IntakeProposal, "member_name" | "ticket_no" | "draft" | "messages"> & { draft: unknown; messages: unknown };
const COLS = "id, member_id, queendom_id, group_jid, kind, status, confidence, tone, summary, draft, messages, first_message_at, last_message_at, ticket_id, created_at";

async function decorate(rows: Row[]): Promise<IntakeProposal[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const memberIds = [...new Set(rows.map((r) => r.member_id))];
  const ticketIds = [...new Set(rows.map((r) => r.ticket_id).filter((x): x is string => Boolean(x)))];
  const [{ data: members }, { data: tickets }] = await Promise.all([
    memberDb(supabase).from("members").select("id, full_name").in("id", memberIds),
    ticketIds.length ? supabase.schema("sia").from("tickets").select("id, ticket_no").in("id", ticketIds) : Promise.resolve({ data: [] as { id: string; ticket_no: string }[] }),
  ]);
  const names = new Map(mapRows<{ id: string; full_name: string }, [string, string]>(members, (m) => [m.id, m.full_name]));
  const nos = new Map(mapRows<{ id: string; ticket_no: string }, [string, string]>(tickets, (t) => [t.id, t.ticket_no]));
  return rows.map((r) => ({
    ...r, confidence: Number(r.confidence),
    member_name: names.get(r.member_id) ?? "A member",
    ticket_no: r.ticket_id ? nos.get(r.ticket_id) ?? null : null,
    draft: (r.draft && typeof r.draft === "object" ? r.draft : {}) as Partial<TicketDraft>,
    messages: (Array.isArray(r.messages) ? r.messages : []) as IntakeProposalMessage[],
  }));
}

/** The open cards the caller may see (their queendom; admin and founder, all), newest first, with how many are open in all. */
export async function listOpenIntakeProposals(limit = INTAKE_STRIP_LIMIT): Promise<{ proposals: IntakeProposal[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase.schema("sia").from("intake_proposals").select(COLS, { count: "exact" }).eq("status", "open").order("created_at", { ascending: false }).limit(limit);
  if (error) { console.error("[intake-service] list failed", error.message); return { proposals: [], total: 0 }; }
  return { proposals: await decorate(mapRows<Row, Row>(data, (r) => r)), total: count ?? 0 };
}

/** One card, if the caller may see it. */
export async function getIntakeProposal(id: string): Promise<IntakeProposal | null> {
  const supabase = await createClient();
  const { data } = await supabase.schema("sia").from("intake_proposals").select(COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return (await decorate([data as unknown as Row]))[0] ?? null;
}

/** Resolve an OPEN card, once. Returns false when it was not open any more (someone else got there). */
export async function resolveIntakeProposal(id: string, by: string, patch: { status: "accepted"; ticket_id: string; fields_changed: string[] } | { status: "dismissed"; dismiss_reason: IntakeDismissReason }): Promise<boolean> {
  const { data, error } = await createAdminClient().schema("sia").from("intake_proposals")
    .update({ ...patch, resolved_by: by, resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("id");
  if (error) { console.error("[intake-service] resolve failed", error.message); return false; }
  return (data ?? []).length > 0;
}

/**
 * How intake is doing over the last N days (0238: ONE statement, sia.intake_stats). The Freshdesk
 * line is the free exam (plan 7.8b): while the floor still raises tickets in Freshdesk, a request
 * card is "agreed" when a Freshdesk ticket for the same member appears within two hours of it.
 * Admin and founder only: the caller gates. The old read pulled every run's output jsonb into
 * the app and stopped at PostgREST's 1,000-row cap, so "chats read" was wrong and the strip
 * arrived two seconds after the page; counting in SQL fixes both.
 */
export async function getIntakeStats(days = 7): Promise<IntakeStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const empty: IntakeStats = { days, bursts_read: 0, by_kind: {}, proposed: 0, open: 0, accepted: 0, accepted_untouched: 0, dismissed: 0, dismissed_by_reason: {}, expired: 0, freshdesk_agreed: 0, freshdesk_checked: 0, health_by_signal: {}, cost_usd: 0 };
  const { data, error } = await createAdminClient().schema("sia").rpc("intake_stats", { p_since: since, p_exam: INTAKE_EXAM_CARDS });
  if (error || !data || typeof data !== "object") { console.error("[intake-service] stats failed", error?.message); return empty; }
  const j = data as Record<string, unknown>;
  const n = (k: string) => Number(j[k] ?? 0);
  const rec = (k: string) => (j[k] && typeof j[k] === "object" ? Object.fromEntries(Object.entries(j[k] as Record<string, unknown>).map(([a, b]) => [a, Number(b)])) : {});
  return {
    days, bursts_read: n("bursts_read"), by_kind: rec("by_kind"), proposed: n("proposed"), open: n("open"),
    accepted: n("accepted"), accepted_untouched: n("accepted_untouched"), dismissed: n("dismissed"),
    dismissed_by_reason: rec("dismissed_by_reason") as IntakeStats["dismissed_by_reason"], expired: n("expired"),
    freshdesk_agreed: n("freshdesk_agreed"), freshdesk_checked: n("freshdesk_checked"), health_by_signal: rec("health_by_signal"),
    // Routing tier (Haiku 4.5: $1 in, $5 out per million). The drafts are counted under ticket_creator.
    cost_usd: (n("tokens_in") * 1 + n("tokens_out") * 5) / 1_000_000,
  };
}
