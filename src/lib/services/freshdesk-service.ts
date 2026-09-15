// freshdesk-service.ts — ALL /freshdesk page reads (admin client on the `freshdesk` schema).
//
// Q-13: the page's admin/founder gate is the trust boundary; these reads never take
// caller-supplied scope. Display-only data shaped for the list, the dossier and the
// overview strip. Writes never happen here — the sync core owns every write.

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { toISTMidnight } from "@/lib/utils/ist";
import { FD_STATUS_LABELS, FRESHDESK_LIST_PAGE_SIZE, FD_SYNC_KEYS, fdStatusLabel } from "@/lib/constants/freshdesk";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import type {
  FdAgentRow,
  FdContactRow,
  FdConversationRow,
  FdGroupRow,
  FdOverview,
  FdOverviewRpcResult,
  FdSyncHealth,
  FdSyncRunRow,
  FdTicketChangeRow,
  FdTicketDetail,
  FdTicketListFilters,
  FdTicketListItem,
  FdTicketRow,
} from "@/lib/types/freshdesk";
import type { ClientTicketSummary } from "@/lib/types/client";

// ─── Vocabulary (small tables, read whole) ───────────────────────────────────

export type FdFilterVocab = {
  groups: { id: number; name: string }[];
  agents: { id: number; name: string }[];
  statuses: { id: number; label: string }[];
  categories: string[];
};

async function getNameMaps(): Promise<{ groups: Map<number, string>; agents: Map<number, string> }> {
  const db = freshdeskDb();
  const [g, a] = await Promise.all([
    db.from("groups").select("id, name"),
    db.from("agents").select("id, name"),
  ]);
  const groups = new Map<number, string>();
  const agents = new Map<number, string>();
  mapRows<{ id: number; name: string }, void>(g.data, (r) => { groups.set(r.id, r.name); });
  mapRows<{ id: number; name: string }, void>(a.data, (r) => { agents.set(r.id, r.name); });
  return { groups, agents };
}

export async function getFreshdeskFilterVocab(): Promise<FdFilterVocab> {
  const db = freshdeskDb();
  const [g, a, statusField, categoryField] = await Promise.all([
    db.from("groups").select("id, name").order("name"),
    db.from("agents").select("id, name, deactivated").eq("deactivated", false).order("name"),
    db.from("ticket_fields").select("choices").eq("name", "status").maybeSingle(),
    db.from("ticket_fields").select("choices").eq("name", "cf_category_of_request").maybeSingle(),
  ]);
  const statuses: { id: number; label: string }[] = [];
  const sc = statusField.data?.choices;
  if (Array.isArray(sc)) {
    for (const c of sc as { id?: unknown; label?: unknown; deleted?: unknown }[]) {
      if (typeof c.id === "number" && typeof c.label === "string" && !c.deleted) statuses.push({ id: c.id, label: c.label });
    }
  }
  if (statuses.length === 0) {
    for (const [id, label] of Object.entries(FD_STATUS_LABELS)) statuses.push({ id: Number(id), label });
  }
  const categories: string[] = [];
  const cc = categoryField.data?.choices;
  if (Array.isArray(cc)) {
    for (const c of cc as { label?: unknown }[]) if (typeof c.label === "string") categories.push(c.label);
  }
  return {
    groups: mapRows<{ id: number; name: string }, { id: number; name: string }>(g.data, (r) => ({ id: r.id, name: r.name })),
    agents: mapRows<{ id: number; name: string }, { id: number; name: string }>(a.data, (r) => ({ id: r.id, name: r.name })),
    statuses,
    categories,
  };
}

// ─── The list ────────────────────────────────────────────────────────────────

const LIST_COLUMNS =
  "id, subject, status, status_label, priority, source, ticket_type, category, sub_category, group_id, responder_id, requester_name, client_id, due_by, is_escalated, fd_created_at, fd_updated_at, resolved_at, conversation_count";

/** PostgREST `.or()` filter values cannot carry commas or parentheses. */
function searchToken(q: string): string {
  return q.replace(/[,()"'\\%]/g, " ").trim();
}

/** Any filter beyond the page number is active. */
export function hasFreshdeskFilters(filters: FdTicketListFilters): boolean {
  return Boolean(
    filters.search || filters.status.length || filters.group != null || filters.agent != null ||
    filters.category || filters.priority != null || filters.dateFrom || filters.dateTo || filters.client,
  );
}

/** Every read of the ticket table starts here so the builders share one concrete type. */
function ticketsSelect(columns: string, opts?: { count?: "exact"; head?: boolean }) {
  return freshdeskDb().from("tickets").select(columns, opts);
}
type TicketSelect = ReturnType<typeof ticketsSelect>;

/**
 * THE one place the list filters become a PostgREST predicate. The list and the
 * overview's fallback counts both go through here, so the strip can never disagree
 * with the table. `withStatus: false` leaves the status filter out (the by-status pills).
 */
function applyTicketFilters(q: TicketSelect, filters: FdTicketListFilters, withStatus = true): TicketSelect {
  let out = q.eq("deleted", false).eq("spam", false);
  if (withStatus && filters.status.length) out = out.in("status", filters.status);
  if (filters.group != null) out = out.eq("group_id", filters.group);
  if (filters.agent != null) out = out.eq("responder_id", filters.agent);
  if (filters.category) out = out.eq("category", filters.category);
  if (filters.priority != null) out = out.eq("priority", filters.priority);
  if (filters.dateFrom) out = out.gte("fd_created_at", filters.dateFrom);
  if (filters.dateTo) out = out.lte("fd_created_at", filters.dateTo);
  if (filters.client) out = out.eq("client_id", filters.client);
  if (filters.search) {
    const token = searchToken(filters.search);
    if (token) {
      const parts = [`subject.ilike.%${token}%`, `requester_name.ilike.%${token}%`];
      if (/^\d+$/.test(token)) parts.push(`id.eq.${token}`);
      out = out.or(parts.join(","));
    }
  }
  return out;
}

export async function listFreshdeskTickets(
  filters: FdTicketListFilters,
): Promise<{ tickets: FdTicketListItem[]; totalCount: number }> {
  const page = Math.max(1, filters.page);
  const from = (page - 1) * FRESHDESK_LIST_PAGE_SIZE;
  const to = from + FRESHDESK_LIST_PAGE_SIZE - 1;

  const q = applyTicketFilters(ticketsSelect(LIST_COLUMNS, { count: "exact" }), filters)
    .order("fd_updated_at", { ascending: false })
    .range(from, to);

  const [{ data, error, count }, names] = await Promise.all([q, getNameMaps()]);
  if (error) {
    console.error("[freshdesk-service] list failed", error.message);
    return { tickets: [], totalCount: 0 };
  }
  type Row = Omit<FdTicketListItem, "group_name" | "agent_name">;
  const tickets = mapRows<Row, FdTicketListItem>(data, (r) => ({
    ...r,
    status_label: r.status_label ?? fdStatusLabel(r.status),
    group_name: r.group_id != null ? (names.groups.get(r.group_id) ?? null) : null,
    agent_name: r.responder_id != null ? (names.agents.get(r.responder_id) ?? null) : null,
  }));
  return { tickets, totalCount: Number(count ?? 0) };
}

/** The client a `?client=` scope points at, for the "Tickets for …" line; null when unknown. */
export async function getFreshdeskClientScope(clientId: string): Promise<{ id: string; full_name: string } | null> {
  const { data } = await createAdminClient().from("clients").select("id, full_name").eq("id", clientId).maybeSingle();
  return data ? { id: (data as { id: string }).id, full_name: (data as { full_name: string }).full_name } : null;
}

// ─── The dossier ─────────────────────────────────────────────────────────────

export async function getFreshdeskTicketDetail(id: number): Promise<FdTicketDetail | null> {
  const db = freshdeskDb();
  const { data: ticket, error } = await db.from("tickets").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[freshdesk-service] ticket read failed", error.message);
    return null;
  }
  if (!ticket) return null;
  const t = ticket as unknown as FdTicketRow;

  const [convs, changes, contact, agent, group] = await Promise.all([
    db.from("conversations").select("*").eq("ticket_id", id).order("fd_created_at", { ascending: true }).limit(500),
    db.from("ticket_changes").select("*").eq("ticket_id", id).order("observed_at", { ascending: true }).limit(500),
    db.from("contacts").select("*").eq("id", t.requester_id).maybeSingle(),
    t.responder_id != null ? db.from("agents").select("*").eq("id", t.responder_id).maybeSingle() : Promise.resolve({ data: null }),
    t.group_id != null ? db.from("groups").select("*").eq("id", t.group_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const conversations = mapRows<FdConversationRow, FdConversationRow>(convs.data, (r) => r);
  const userIds = Array.from(new Set(conversations.map((c) => c.user_id).filter((u): u is number => u != null)));
  const agentNames: Record<number, string> = {};
  if (userIds.length) {
    const { data: agents } = await db.from("agents").select("id, name").in("id", userIds);
    mapRows<{ id: number; name: string }, void>(agents, (a) => { agentNames[a.id] = a.name; });
  }

  let client: { id: string; full_name: string } | null = null;
  if (t.client_id) {
    const { data: c } = await createAdminClient().from("clients").select("id, full_name").eq("id", t.client_id).maybeSingle();
    if (c) client = { id: (c as { id: string }).id, full_name: (c as { full_name: string }).full_name };
  }

  return {
    ticket: t,
    conversations,
    changes: mapRows<FdTicketChangeRow, FdTicketChangeRow>(changes.data, (r) => r),
    contact: (contact.data as unknown as FdContactRow | null) ?? null,
    agent: (agent.data as unknown as FdAgentRow | null) ?? null,
    group: (group.data as unknown as FdGroupRow | null) ?? null,
    agentNames,
    client,
  };
}

// ─── The overview strip + sync health ────────────────────────────────────────


export async function getFreshdeskSyncHealth(): Promise<FdSyncHealth> {
  const db = freshdeskDb();
  const [poll, backfill, lastRun, lastWebhook, threadsPending] = await Promise.all([
    db.from("sync_state").select("value").eq("key", FD_SYNC_KEYS.poll).maybeSingle(),
    db.from("sync_state").select("value").eq("key", FD_SYNC_KEYS.backfill).maybeSingle(),
    db.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("webhook_events").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("tickets").select("id", { count: "exact", head: true }).is("conversations_synced_at", null).eq("deleted", false),
  ]);
  const p = (poll.data?.value ?? {}) as { watermark?: string; last_run_at?: string; last_ok?: boolean; last_error?: string | null };
  const b = (backfill.data?.value ?? {}) as { done?: boolean; tickets_done?: number };
  const run = (lastRun.data as unknown as FdSyncRunRow | null) ?? null;
  return {
    lastPollAt: p.last_run_at ?? null,
    lastPollOk: p.last_ok ?? null,
    lastError: p.last_error ?? run?.error ?? null,
    watermark: p.watermark ?? null,
    backfillDone: Boolean(b.done),
    backfillTicketsDone: Number(b.tickets_done ?? 0),
    threadsPending: Number(threadsPending.count ?? 0),
    rateRemaining: run?.rate_remaining ?? null,
    lastWebhookAt: (lastWebhook.data as { received_at?: string } | null)?.received_at ?? null,
  };
}

/**
 * The overview strip for the SAME filters the list has. One `freshdesk.ticket_overview`
 * call (0196: one scan, every number) — until that migration is applied the counts fall
 * back to parallel HEAD queries through the same `applyTicketFilters`, so the numbers are
 * right either way, just slower.
 */
export async function getFreshdeskOverview(filters: FdTicketListFilters): Promise<FdOverview> {
  const todayStart = toISTMidnight(new Date()).toISOString();
  const [counts, sync] = await Promise.all([overviewViaRpc(filters, todayStart), getFreshdeskSyncHealth()]);
  const c = counts ?? (await overviewViaHeadCounts(filters, todayStart));

  return {
    byStatus: c.by_status
      .filter((s) => s.count > 0)
      .map((s) => ({ status: s.status, label: fdStatusLabel(s.status), count: Number(s.count) })),
    openTotal: Number(c.open),
    createdToday: Number(c.created_today),
    resolvedToday: Number(c.resolved_today),
    escalatedOpen: Number(c.escalated_open),
    totalTickets: Number(c.total),
    filtered: hasFreshdeskFilters(filters),
    sync,
  };
}

async function overviewViaRpc(filters: FdTicketListFilters, todayStart: string): Promise<FdOverviewRpcResult | null> {
  const token = filters.search ? searchToken(filters.search) : "";
  const { data, error } = await freshdeskDb().rpc("ticket_overview", {
    p_status: filters.status.length ? filters.status : null,
    p_group: filters.group,
    p_agent: filters.agent,
    p_category: filters.category || null,
    p_priority: filters.priority,
    p_from: filters.dateFrom,
    p_to: filters.dateTo,
    p_search: token || null,
    p_client: filters.client,
    p_today_start: todayStart,
  });
  if (error) {
    // PGRST202 = the function is not there yet (0196 not applied): the fallback answers.
    console.warn("[freshdesk-service] ticket_overview rpc unavailable, using head counts:", error.message);
    return null;
  }
  return (data as FdOverviewRpcResult | null) ?? null;
}

/** The pre-0196 shape: thirteen parallel HEAD counts through the shared predicate. */
async function overviewViaHeadCounts(filters: FdTicketListFilters, todayStart: string): Promise<FdOverviewRpcResult> {
  const head = (withStatus: boolean) =>
    applyTicketFilters(ticketsSelect("id", { count: "exact", head: true }), filters, withStatus);
  const statusIds = Object.keys(FD_STATUS_LABELS).map(Number);
  const [perStatus, total, createdToday, resolvedToday, escalatedOpen] = await Promise.all([
    Promise.all(statusIds.map(async (s) => ({ status: s, count: Number((await head(false).eq("status", s)).count ?? 0) }))),
    head(true),
    head(true).gte("fd_created_at", todayStart),
    head(true).gte("resolved_at", todayStart),
    head(true).eq("is_escalated", true).not("status", "in", "(4,5)"),
  ]);
  // "open" respects the status filter: a status pick narrows the set, so count within it.
  const picked = filters.status.length ? new Set(filters.status) : null;
  const open = perStatus
    .filter((s) => s.status !== 4 && s.status !== 5 && (!picked || picked.has(s.status)))
    .reduce((n, s) => n + s.count, 0);
  return {
    by_status: perStatus,
    total: Number(total.count ?? 0),
    open,
    created_today: Number(createdToday.count ?? 0),
    resolved_today: Number(resolvedToday.count ?? 0),
    escalated_open: Number(escalatedOpen.count ?? 0),
  };
}

export async function getRecentFreshdeskRuns(limit = 12): Promise<FdSyncRunRow[]> {
  const { data } = await freshdeskDb().from("sync_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  return mapRows<FdSyncRunRow, FdSyncRunRow>(data, (r) => r);
}

// ─── The client dossier's Requests card (0194) ───────────────────────────────

const CLIENT_TICKET_COLUMNS =
  "id, subject, status, status_label, priority, category, sub_category, responder_id, fd_created_at, fd_updated_at, resolved_at, is_escalated";

/** A client's mirrored tickets: the open ones, the most recent ones, and the total. */
export async function getFreshdeskTicketsForClient(
  clientId: string,
  recentLimit = 12,
): Promise<{ open: ClientTicketSummary[]; recent: ClientTicketSummary[]; total: number }> {
  const db = freshdeskDb();
  const [names, openRes, recentRes] = await Promise.all([
    getNameMaps(),
    db.from("tickets").select(CLIENT_TICKET_COLUMNS).eq("client_id", clientId).eq("deleted", false).eq("spam", false)
      .not("status", "in", "(4,5)").order("fd_updated_at", { ascending: false }).limit(50),
    db.from("tickets").select(CLIENT_TICKET_COLUMNS, { count: "exact" }).eq("client_id", clientId).eq("deleted", false).eq("spam", false)
      .order("fd_created_at", { ascending: false }).limit(recentLimit),
  ]);
  type Row = Omit<ClientTicketSummary, "agent_name"> & { responder_id: number | null };
  const shape = (r: Row): ClientTicketSummary => ({
    id: r.id, subject: r.subject, status: r.status, status_label: r.status_label ?? fdStatusLabel(r.status), priority: r.priority,
    category: r.category, sub_category: r.sub_category,
    agent_name: r.responder_id != null ? (names.agents.get(r.responder_id) ?? null) : null,
    fd_created_at: r.fd_created_at, fd_updated_at: r.fd_updated_at, resolved_at: r.resolved_at, is_escalated: r.is_escalated,
  });
  return {
    open: mapRows<Row, ClientTicketSummary>(openRes.data, shape),
    recent: mapRows<Row, ClientTicketSummary>(recentRes.data, shape),
    total: Number(recentRes.count ?? 0),
  };
}
