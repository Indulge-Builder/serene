// tickets-service.ts — ALL Sia ticket reads (migration 0195, member-ticket-plan.md 7).
//
// Session member on the `sia` schema (RLS: the whole queendom, admin, founder). The help
// window's slices come from the member twin (members-service) and the mirror
// (freshdesk-service) through their own homes. Types are hand-declared (types/ticket.ts)
// until `gen types` runs after 0195.

import type { SupabaseClient } from "@supabase/supabase-js";
import { memberDb } from "@/lib/supabase/schemas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { cache } from "react";
import { TICKETS_LIST_PAGE_SIZE, TICKET_ACTIVE_STATUSES, type TicketStatus, TICKET_BOARD_STATUSES, TICKET_BOARD_COLUMN_CAP, TICKET_SETTING_KEYS, resolveTicketStatusLabels } from "@/lib/constants/tickets";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import type { StaffOption, TicketDetail, TicketEventRow, TicketHelp, TicketListFilters, TicketListItem, TicketMessageLinkRow, TicketRow, TicketSlaPolicyRow, TicketingDatabase, LinkedMessage, TicketSettings } from "@/lib/types/ticket";

export async function ticketsDb() {
  const supabase = (await createClient()) as unknown as SupabaseClient<TicketingDatabase, "sia">;
  return supabase.schema("sia");
}
export function ticketsAdminDb() {
  return (createAdminClient() as unknown as SupabaseClient<TicketingDatabase, "sia">).schema("sia");
}

// The page reads pass nothing (session client, RLS-scoped). Elaya's readers pass the ADMIN client:
// they run on the Python brain's bridge and on WhatsApp, where there is no user session, and a
// session read there returns nothing (2026-09-26 audit: every ticket came back as "Member", no assignee).
async function nameMaps(memberIds: string[], profileIds: string[], client?: Awaited<ReturnType<typeof createClient>>): Promise<{ members: Map<string, string>; profiles: Map<string, string>; queendoms: Map<string, string> }> {
  const supabase = client ?? (await createClient());
  const [c, p, q] = await Promise.all([
    memberIds.length ? memberDb(supabase).from("members").select("id, full_name").in("id", memberIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from("profiles").select("id, full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
    supabase.schema("sia").from("queendoms").select("id, name"),
  ]);
  const members = new Map<string, string>(); const profiles = new Map<string, string>(); const queendoms = new Map<string, string>();
  mapRows<{ id: string; full_name: string }, void>(c.data, (r) => { members.set(r.id, r.full_name); });
  mapRows<{ id: string; full_name: string }, void>(p.data, (r) => { profiles.set(r.id, r.full_name); });
  mapRows<{ id: string; name: string }, void>(q.data, (r) => { queendoms.set(r.id, r.name); });
  return { members, profiles, queendoms };
}

function searchToken(q: string): string {
  return q.replace(/[,()"'\\%]/g, " ").trim();
}

// ─── The list / board ────────────────────────────────────────────────────────

export async function listTickets(filters: TicketListFilters, callerId: string): Promise<{ tickets: TicketListItem[]; totalCount: number }> {
  const db = await ticketsDb();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * TICKETS_LIST_PAGE_SIZE;
  let q = db.from("tickets").select("*", { count: "exact" });
  q = filters.status.length ? q.in("status", filters.status) : q.in("status", [...TICKET_ACTIVE_STATUSES, "proposed"]);
  if (filters.queendom) q = q.eq("queendom_id", filters.queendom);
  if (filters.assignee) q = q.eq("assignee_id", filters.assignee);
  if (filters.mine) q = q.eq("assignee_id", callerId);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.tag) q = q.contains("tags", [filters.tag]);
  if (filters.search) {
    const t = searchToken(filters.search);
    if (t) q = q.or(`title.ilike.%${t}%,ticket_no.ilike.%${t}%`);
  }
  q = q.order("updated_at", { ascending: false }).range(from, from + TICKETS_LIST_PAGE_SIZE - 1);
  const { data, error, count } = await q;
  if (error) {
    console.error("[tickets-service] list failed", error.message);
    return { tickets: [], totalCount: 0 };
  }
  const rows = mapRows<TicketRow, TicketRow>(data, (r) => r);
  const names = await nameMaps(rows.map((r) => r.member_id), rows.map((r) => r.assignee_id).filter((x): x is string => Boolean(x)));
  return {
    tickets: rows.map((r) => ({
      ...r,
      member_name: names.members.get(r.member_id) ?? "Member",
      assignee_name: r.assignee_id ? (names.profiles.get(r.assignee_id) ?? null) : null,
      queendom_name: r.queendom_id ? (names.queendoms.get(r.queendom_id) ?? null) : null,
    })),
    totalCount: Number(count ?? 0),
  };
}

/**
 * The board's read: every ticket in the board's columns (live work + proposed + resolved),
 * one queendom or all, capped per column. Session member, so RLS scopes it.
 */
export async function listBoardTickets(queendomId: string | null): Promise<TicketListItem[]> {
  const db = await ticketsDb();
  const perStatus = await Promise.all(TICKET_BOARD_STATUSES.map(async (status) => {
    let q = db.from("tickets").select("*").eq("status", status).order("updated_at", { ascending: false }).limit(TICKET_BOARD_COLUMN_CAP);
    if (queendomId) q = q.eq("queendom_id", queendomId);
    const { data, error } = await q;
    if (error) console.error("[tickets-service] board read failed", status, error.message);
    return mapRows<TicketRow, TicketRow>(data, (r) => r);
  }));
  const rows = perStatus.flat();
  const names = await nameMaps(rows.map((r) => r.member_id), rows.map((r) => r.assignee_id).filter((x): x is string => Boolean(x)));
  return rows.map((r) => ({
    ...r,
    member_name: names.members.get(r.member_id) ?? "Member",
    assignee_name: r.assignee_id ? (names.profiles.get(r.assignee_id) ?? null) : null,
    queendom_name: r.queendom_id ? (names.queendoms.get(r.queendom_id) ?? null) : null,
  }));
}

/** sia.ticket_settings resolved: the labels the app shows and the tag vocabulary. Read per request. */
export const getTicketSettings = cache(async (): Promise<TicketSettings> => {
  const db = ticketsAdminDb();
  const { data } = await db.from("ticket_settings").select("key, value");
  const byKey = new Map<string, unknown>();
  mapRows<{ key: string; value: unknown }, void>(data, (r) => { byKey.set(r.key, r.value); });
  const raw = byKey.get(TICKET_SETTING_KEYS.statusLabels);
  const statusOverrides: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && v.trim()) statusOverrides[k] = v.trim();
  }
  const tagsRaw = byKey.get(TICKET_SETTING_KEYS.tags);
  const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((t): t is string => typeof t === "string") : [];
  return { statusLabels: resolveTicketStatusLabels(statusOverrides), statusOverrides, tags };
});

/** Every SLA policy row, active or not, most specific first (the settings page). */
export async function listTicketSlaPolicies(): Promise<TicketSlaPolicyRow[]> {
  const db = ticketsAdminDb();
  const { data } = await db.from("ticket_sla_policies").select("*").order("created_at", { ascending: true });
  return mapRows<TicketSlaPolicyRow, TicketSlaPolicyRow>(data, (r) => r);
}

/** Everyone who can carry a ticket in a queendom (the assignee picker). */
export async function listQueendomStaff(queendomId: string | null): Promise<StaffOption[]> {
  const supabase = await createClient();
  let q = supabase.from("profiles").select("id, full_name, sia_role").eq("is_active", true).order("full_name");
  q = queendomId ? q.eq("queendom_id", queendomId) : q.not("sia_role", "is", null);
  const { data } = await q;
  return mapRows<StaffOption, StaffOption>(data, (r) => r);
}

// ─── The dossier ─────────────────────────────────────────────────────────────

export async function getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const db = await ticketsDb();
  const supabase = await createClient();
  const { data: t, error } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (error) { console.error("[tickets-service] ticket read failed", error.message); return null; }
  if (!t) return null;
  const ticket = t as TicketRow;

  const [member, events, links, staff, tasks, policy] = await Promise.all([
    memberDb(supabase).from("members").select("id, full_name, primary_phone, queendom_id").eq("id", ticket.member_id).maybeSingle(),
    db.from("ticket_events").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(500),
    db.from("ticket_message_links").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(200),
    listQueendomStaff(ticket.queendom_id),
    (supabase as unknown as SupabaseClient<TicketingDatabase, "public">).from("task_ticket_meta").select("task_id").eq("ticket_id", ticketId).limit(50),
    resolveSlaPolicy(ticket),
  ]);

  const eventRows = mapRows<TicketEventRow, TicketEventRow>(events.data, (r) => r);
  const actorIds = Array.from(new Set(eventRows.map((e) => e.actor_id).filter((x): x is string => Boolean(x))));
  const names = actorIds.length ? await nameMaps([], actorIds) : null;

  // The linked messages' text comes from the archive (service role; the caller passed RLS for the ticket).
  const linkRows = mapRows<TicketMessageLinkRow, TicketMessageLinkRow>(links.data, (r) => r);
  const linked: LinkedMessage[] = [];
  if (linkRows.length) {
    const sia = createAdminClient().schema("sia");
    const ids = linkRows.map((l) => l.wa_message_id);
    const [{ data: msgs }, { data: contacts }] = await Promise.all([
      sia.from("wag_messages").select("chat_jid, wa_message_id, sender_jid, text, wa_timestamp, from_me").in("wa_message_id", ids).limit(200),
      sia.from("wag_contacts").select("jid, push_name").in("jid", Array.from(new Set(linkRows.map((l) => l.sender_jid)))),
    ]);
    const byId = new Map<string, { text: string | null; wa_timestamp: string; from_me: boolean }>();
    mapRows<{ chat_jid: string; wa_message_id: string; text: string | null; wa_timestamp: string; from_me: boolean }, void>(msgs, (m) => { byId.set(`${m.chat_jid}|${m.wa_message_id}`, m); });
    const nameByJid = new Map<string, string | null>();
    mapRows<{ jid: string; push_name: string | null }, void>(contacts, (c) => { nameByJid.set(c.jid, c.push_name); });
    for (const l of linkRows) {
      const m = byId.get(`${l.chat_jid}|${l.wa_message_id}`);
      linked.push({ ...l, text: m?.text ?? null, wa_timestamp: m?.wa_timestamp ?? null, from_me: m?.from_me ?? false, sender_name: nameByJid.get(l.sender_jid) ?? null });
    }
    linked.sort((a, b) => (a.wa_timestamp ?? "").localeCompare(b.wa_timestamp ?? ""));
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const taskIds = mapRows<{ task_id: string }, string>(tasks.data, (r) => r.task_id);
  const taskRows = taskIds.length
    ? mapRows<TicketDetail["tasks"][number], TicketDetail["tasks"][number]>((await supabase.from("tasks").select("id, title, status, due_at, assigned_to").in("id", taskIds)).data, (r) => r)
    : [];
  return {
    ticket,
    member: (member.data as TicketDetail["member"] | null) ?? { id: ticket.member_id, full_name: "Member", primary_phone: null, queendom_id: ticket.queendom_id },
    events: eventRows.map((e) => ({ ...e, actor_name: e.actor_id ? (names?.profiles.get(e.actor_id) ?? null) : null })),
    links: linked,
    assignee: ticket.assignee_id ? (staffById.get(ticket.assignee_id) ?? null) : null,
    bishop: ticket.bishop_id ? (staffById.get(ticket.bishop_id) ?? null) : null,
    staff,
    tasks: taskRows,
    policy,
  };
}

/** The most specific active SLA policy for a ticket (queendom > category+sub > category > priority > default). */
export async function resolveSlaPolicy(ticket: Pick<TicketRow, "queendom_id" | "category" | "sub_category" | "priority">): Promise<TicketSlaPolicyRow | null> {
  const db = ticketsAdminDb();
  const { data } = await db.from("ticket_sla_policies").select("*").eq("is_active", true);
  const rows = mapRows<TicketSlaPolicyRow, TicketSlaPolicyRow>(data, (r) => r);
  const score = (p: TicketSlaPolicyRow): number => {
    if (p.queendom_id && p.queendom_id !== ticket.queendom_id) return -1;
    if (p.category && p.category !== ticket.category) return -1;
    if (p.sub_category && p.sub_category !== ticket.sub_category) return -1;
    if (p.priority && p.priority !== ticket.priority) return -1;
    return (p.queendom_id ? 8 : 0) + (p.sub_category ? 4 : 0) + (p.category ? 2 : 0) + (p.priority ? 1 : 0);
  };
  return rows.map((p) => ({ p, s: score(p) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.p ?? null;
}

// ─── The help window ─────────────────────────────────────────────────────────

export async function getTicketHelp(clientId: string, category: string, excludeTicketId?: string): Promise<TicketHelp | null> {
  // Dynamic: members-service pulls sia-service (a `server-only` module) into the static graph,
  // and the sentinel's laptop loop (scripts/tickets/sentinel.ts) imports this file under tsx.
  const { getMemberDetail } = await import("@/lib/services/members-service");
  const detail = await getMemberDetail(clientId);
  if (!detail) return null;
  const db = await ticketsDb();
  const fd = freshdeskDb();
  const fdCategory = Object.entries({ Travel: "travel", Dining: "dining", Retail: "retail", Events: "events", "Special Request": "special_request", Itinerary: "itinerary", "Indulge Recommendations": "recommendations", "Staff Hiring": "staff_hiring" }).find(([, v]) => v === category)?.[0];
  const [similar, open] = await Promise.all([
    fd.from("tickets").select("id, subject, status_label, responder_id, fd_created_at, resolved_at").eq("member_id", clientId).eq("deleted", false)
      .eq("category", fdCategory ?? category).order("fd_created_at", { ascending: false }).limit(6),
    db.from("tickets").select("id, ticket_no, title, status").eq("member_id", clientId).in("status", [...TICKET_ACTIVE_STATUSES]).limit(10),
  ]);
  const agentIds = Array.from(new Set(mapRows<{ responder_id: number | null }, number | null>(similar.data, (r) => r.responder_id).filter((x): x is number => x != null)));
  const agents = new Map<number, string>();
  if (agentIds.length) {
    const { data: a } = await fd.from("agents").select("id, name").in("id", agentIds);
    mapRows<{ id: number; name: string }, void>(a, (r) => { agents.set(r.id, r.name); });
  }
  return {
    facts: detail.facts.filter((f) => f.facet !== "address").map((f) => ({ facet: f.facet, key: f.key, value: f.value, polarity: f.polarity })).slice(0, 40),
    addresses: detail.facts.filter((f) => f.facet === "address").map((f) => ({ key: f.key, value: f.value })),
    dislikes: detail.facts.filter((f) => f.polarity === "dislikes").map((f) => f.value),
    health: detail.health.events.length ? detail.health.score : null,
    similarTickets: mapRows<{ id: number; subject: string; status_label: string | null; responder_id: number | null; fd_created_at: string; resolved_at: string | null }, TicketHelp["similarTickets"][number]>(
      similar.data, (r) => ({ id: r.id, subject: r.subject, status_label: r.status_label, agent_name: r.responder_id != null ? (agents.get(r.responder_id) ?? null) : null, fd_created_at: r.fd_created_at, resolved_at: r.resolved_at })),
    anticipations: detail.anticipations.map((a) => ({ title: a.title, due_at: a.due_at })),
    openTickets: mapRows<{ id: string; ticket_no: string; title: string; status: TicketStatus }, TicketHelp["openTickets"][number]>(open.data, (r) => r).filter((t) => t.id !== excludeTicketId),
  };
}

// ─── Elaya's reads (admin client, explicit scope — the elaya-data parity rule) ──

export type ElayaTicketSummary = Pick<TicketRow, "id" | "ticket_no" | "title" | "status" | "priority" | "category" | "sub_category" | "requested_for" | "resolve_due_at" | "first_response_due_at" | "first_responded_at" | "updated_at" | "created_at" | "tags"> & { member_name: string; assignee_name: string | null; queendom_name: string | null };

export async function listTicketsForElaya(scope: { queendomId: string | null; assigneeId: string | null; statuses: TicketStatus[]; search: string | null; limit: number }): Promise<ElayaTicketSummary[]> {
  const db = ticketsAdminDb();
  let q = db.from("tickets").select("*");
  q = scope.statuses.length ? q.in("status", scope.statuses) : q.in("status", [...TICKET_ACTIVE_STATUSES, "proposed"]);
  if (scope.queendomId) q = q.eq("queendom_id", scope.queendomId);
  if (scope.assigneeId) q = q.eq("assignee_id", scope.assigneeId);
  if (scope.search) { const t = searchToken(scope.search); if (t) q = q.or(`title.ilike.%${t}%,ticket_no.ilike.%${t}%`); }
  const { data } = await q.order("updated_at", { ascending: false }).limit(Math.min(scope.limit, 50));
  const rows = mapRows<TicketRow, TicketRow>(data, (r) => r);
  const names = await nameMaps(rows.map((r) => r.member_id), rows.map((r) => r.assignee_id).filter((x): x is string => Boolean(x)), createAdminClient());
  return rows.map((r) => ({
    id: r.id, ticket_no: r.ticket_no, title: r.title, status: r.status, priority: r.priority, category: r.category, sub_category: r.sub_category,
    requested_for: r.requested_for, resolve_due_at: r.resolve_due_at, first_response_due_at: r.first_response_due_at, first_responded_at: r.first_responded_at,
    updated_at: r.updated_at, created_at: r.created_at, tags: r.tags ?? [],
    member_name: names.members.get(r.member_id) ?? "Member",
    assignee_name: r.assignee_id ? (names.profiles.get(r.assignee_id) ?? null) : null,
    queendom_name: r.queendom_id ? (names.queendoms.get(r.queendom_id) ?? null) : null,
  }));
}

/** One ticket by number (T-000042) or id, with its member, its last events and its policy. Admin member; the caller gates. */
export async function getTicketByRefForElaya(ref: string): Promise<{ ticket: TicketRow; member_name: string; assignee_name: string | null; events: TicketEventRow[]; policy: TicketSlaPolicyRow | null } | null> {
  const db = ticketsAdminDb();
  const clean = ref.trim().toUpperCase();
  const q = /^[0-9A-F-]{36}$/i.test(clean) ? db.from("tickets").select("*").eq("id", clean.toLowerCase()) : db.from("tickets").select("*").eq("ticket_no", /^T-\d+$/.test(clean) ? clean : `T-${clean.replace(/^T-?/, "").padStart(6, "0")}`);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const t = data as TicketRow;
  const [{ data: ev }, names, policy] = await Promise.all([
    db.from("ticket_events").select("*").eq("ticket_id", t.id).order("created_at", { ascending: false }).limit(12),
    nameMaps([t.member_id], t.assignee_id ? [t.assignee_id] : [], createAdminClient()),
    resolveSlaPolicy(t),
  ]);
  return { ticket: t, member_name: names.members.get(t.member_id) ?? "Member", assignee_name: t.assignee_id ? (names.profiles.get(t.assignee_id) ?? null) : null, events: mapRows<TicketEventRow, TicketEventRow>(ev, (r) => r).reverse(), policy };
}
