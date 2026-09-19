// intake-service.ts — the reads and the resolve-once write for intake proposals (0219).
//
// Reads go through the SESSION client: RLS (can_access_member_queendom) is what scopes a card
// to its queendom, exactly as it does a ticket. The one write, resolving a card, uses the admin
// client AFTER the action has gated the caller (Q-13), and only ever moves an OPEN card.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import { mapRows } from "@/lib/utils/rows";
import { INTAKE_RUN_KIND, type IntakeDismissReason } from "@/lib/constants/ticket-intake";
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

/** The open cards the caller may see (their queendom; admin and founder, all), newest first. */
export async function listOpenIntakeProposals(limit = 30): Promise<IntakeProposal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("sia").from("intake_proposals").select(COLS).eq("status", "open").order("created_at", { ascending: false }).limit(limit);
  if (error) { console.error("[intake-service] list failed", error.message); return []; }
  return decorate(mapRows<Row, Row>(data, (r) => r));
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
 * How intake is doing over the last N days. The Freshdesk line is the free exam (plan 7.8b):
 * while the floor still raises tickets in Freshdesk, a request card is "agreed" when a Freshdesk
 * ticket for the same member appears within two hours of it. Admin and founder only: the caller gates.
 */
export async function getIntakeStats(days = 7): Promise<IntakeStats> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: runs }, { data: props }, { data: health }] = await Promise.all([
    admin.schema("sia").from("extraction_runs").select("ok, cost_usd, tokens_in, tokens_out, output, input_ref").eq("kind", INTAKE_RUN_KIND).gte("started_at", since).limit(5000),
    admin.schema("sia").from("intake_proposals").select("member_id, kind, status, dismiss_reason, fields_changed, first_message_at").gte("created_at", since).limit(5000),
    memberDb(admin).from("member_health_events").select("signal").eq("evidence->>source", "intake").gte("created_at", since).limit(5000),
  ]);
  const health_by_signal: Record<string, number> = {};
  for (const h of mapRows<{ signal: string }, { signal: string }>(health, (r) => r)) health_by_signal[h.signal] = (health_by_signal[h.signal] ?? 0) + 1;
  const live = mapRows<{ ok: boolean | null; tokens_in: number | null; tokens_out: number | null; output: { verdict?: { kind?: string } } | null; input_ref: { dry_run?: boolean } | null }, { kind: string | null; tin: number; tout: number }>(
    (runs ?? []).filter((r) => !(r as { input_ref?: { dry_run?: boolean } }).input_ref?.dry_run),
    (r) => ({ kind: r.ok ? r.output?.verdict?.kind ?? null : null, tin: Number(r.tokens_in ?? 0), tout: Number(r.tokens_out ?? 0) }),
  );
  const by_kind: Record<string, number> = {};
  for (const r of live) if (r.kind) by_kind[r.kind] = (by_kind[r.kind] ?? 0) + 1;
  type P = { member_id: string; kind: string; status: string; dismiss_reason: IntakeDismissReason | null; fields_changed: string[] | null; first_message_at: string };
  const ps = mapRows<P, P>(props, (p) => p);
  const reasons: IntakeStats["dismissed_by_reason"] = {};
  for (const p of ps) if (p.status === "dismissed" && p.dismiss_reason) reasons[p.dismiss_reason] = (reasons[p.dismiss_reason] ?? 0) + 1;

  // The free exam, on the newest 60 request cards (one small indexed read each).
  const requests = ps.filter((p) => p.kind === "request").slice(0, 60);
  let agreed = 0;
  for (const p of requests) {
    const t = new Date(p.first_message_at).getTime();
    const { count } = await freshdeskDb().from("tickets").select("id", { count: "exact", head: true }).eq("member_id", p.member_id)
      .gte("fd_created_at", new Date(t - 30 * 60_000).toISOString()).lte("fd_created_at", new Date(t + 120 * 60_000).toISOString());
    if ((count ?? 0) > 0) agreed += 1;
  }
  return {
    days, bursts_read: live.length, by_kind, proposed: ps.length,
    open: ps.filter((p) => p.status === "open").length,
    accepted: ps.filter((p) => p.status === "accepted").length,
    accepted_untouched: ps.filter((p) => p.status === "accepted" && (p.fields_changed ?? []).length === 0).length,
    dismissed: ps.filter((p) => p.status === "dismissed").length, dismissed_by_reason: reasons,
    expired: ps.filter((p) => p.status === "expired").length,
    freshdesk_agreed: agreed, freshdesk_checked: requests.length,
    health_by_signal,
    // Routing tier (Haiku 4.5: $1 in, $5 out per million). The drafts are counted under ticket_creator.
    cost_usd: live.reduce((n, r) => n + (r.tin * 1 + r.tout * 5) / 1_000_000, 0),
  };
}
