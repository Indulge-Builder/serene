// freshdesk-sync.ts — THE Freshdesk → freshdesk.* mirror core (server-only, admin client).
//
// One core, three callers: the Trigger.dev minute task (src/trigger/freshdesk-sync.ts),
// the webhook route (api/webhooks/freshdesk) and the "Sync now" action. Every step is
// idempotent (upserts on Freshdesk's own ids) and budgeted (FdBudget), so a step that
// stops halfway is finished by the next run. Every step writes a freshdesk.sync_runs row.
//
// The movement history: on every upsert the tracked fields of the stored row are diffed
// against the incoming object and each flip becomes a freshdesk.ticket_changes row. That
// table is why the mirror exists (client-ticket-plan.md section 2.2).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { normalizeToE164 } from "@/lib/utils/phone";
import { copyMedia } from "@/lib/services/freshdesk-media";
import {
  FD_BACKFILL_EPOCH,
  FD_MAX_PAGES,
  FD_MEDIA_PER_THREAD_MAX,
  FD_THREAD_CONCURRENCY,
  FD_THREADS_PER_CYCLE,
  FD_PAGE_SIZE,
  FD_POLL_OVERLAP_MS,
  FD_REFERENCE_TTL_MS,
  FD_SYNC_KEYS,
  FD_TRACKED_FIELDS,
  fdStatusLabel,
} from "@/lib/constants/freshdesk";
import {
  createFdBudget,
  budgetHasRoom,
  FdBudgetExhausted,
  getTicket,
  getTicketField,
  listAgents,
  listContactsUpdatedSince,
  listConversations,
  listGroups,
  listSlaPolicies,
  listTicketFields,
  listTicketsUpdatedSince,
  type FdBudget,
} from "@/lib/services/freshdesk-api";
import type {
  FdAttachment,
  FdApiAgent,
  FdApiContact,
  FdApiConversation,
  FdApiGroup,
  FdApiSlaPolicy,
  FdApiTicket,
  FdApiTicketField,
  FdTicketRow,
  FreshdeskDatabase,
} from "@/lib/types/freshdesk";

// ─── The client ──────────────────────────────────────────────────────────────

/**
 * The admin client scoped to the `freshdesk` schema. Cast to the hand-written schema
 * type until `gen types` includes it (the vendor.ts posture). service_role only.
 */
export function freshdeskDb() {
  const client = createAdminClient() as unknown as SupabaseClient<FreshdeskDatabase, "freshdesk">;
  return client.schema("freshdesk");
}

// ─── Run bookkeeping ─────────────────────────────────────────────────────────

export type FdRunStats = {
  runId: number | null;
  kind: string;
  ticketsSeen: number;
  ticketsWritten: number;
  conversationsWritten: number;
  changesWritten: number;
  error: string | null;
  detail: Record<string, unknown>;
};

async function startRun(kind: string): Promise<FdRunStats> {
  const stats: FdRunStats = {
    runId: null, kind, ticketsSeen: 0, ticketsWritten: 0, conversationsWritten: 0, changesWritten: 0,
    error: null, detail: {},
  };
  const { data, error } = await freshdeskDb()
    .from("sync_runs")
    .insert({ kind, ok: null, api_calls: 0, rate_remaining: null, tickets_seen: 0, tickets_written: 0,
      conversations_written: 0, changes_written: 0, error: null, detail: {}, finished_at: null })
    .select("id")
    .single();
  if (error) console.warn("[freshdesk-sync] could not open sync_runs row", error.message);
  else stats.runId = (data as { id: number }).id;
  return stats;
}

async function finishRun(stats: FdRunStats, budget: FdBudget, ok: boolean): Promise<void> {
  if (stats.runId == null) return;
  const { error } = await freshdeskDb()
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok,
      api_calls: budget.calls,
      rate_remaining: budget.remaining,
      tickets_seen: stats.ticketsSeen,
      tickets_written: stats.ticketsWritten,
      conversations_written: stats.conversationsWritten,
      changes_written: stats.changesWritten,
      error: stats.error,
      detail: stats.detail,
    })
    .eq("id", stats.runId);
  if (error) console.warn("[freshdesk-sync] could not close sync_runs row", error.message);
}

// ─── sync_state ──────────────────────────────────────────────────────────────

export async function getSyncState<T extends Record<string, unknown>>(key: string): Promise<T | null> {
  const { data, error } = await freshdeskDb().from("sync_state").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.warn("[freshdesk-sync] sync_state read failed", key, error.message);
    return null;
  }
  return (data?.value as T | undefined) ?? null;
}

export async function setSyncState(key: string, value: Record<string, unknown>): Promise<void> {
  const { error } = await freshdeskDb()
    .from("sync_state")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.warn("[freshdesk-sync] sync_state write failed", key, error.message);
}

// ─── Status labels (from the synced field definition) ────────────────────────

let statusLabelCache: { at: number; labels: Record<number, string> } | null = null;

async function getStatusLabels(): Promise<Record<number, string>> {
  if (statusLabelCache && Date.now() - statusLabelCache.at < 10 * 60_000) return statusLabelCache.labels;
  const { data } = await freshdeskDb().from("ticket_fields").select("choices").eq("name", "status").maybeSingle();
  const labels: Record<number, string> = {};
  const choices = data?.choices;
  if (Array.isArray(choices)) {
    for (const c of choices as { id?: unknown; label?: unknown }[]) {
      if (typeof c.id === "number" && typeof c.label === "string") labels[c.id] = c.label;
    }
  }
  statusLabelCache = { at: Date.now(), labels };
  return labels;
}

// ─── Normalisation ───────────────────────────────────────────────────────────

function safeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return normalizeToE164(String(phone));
  } catch {
    return null;
  }
}

function customStr(cf: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = cf?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

type TicketInsert = FreshdeskDatabase["freshdesk"]["Tables"]["tickets"]["Insert"];

function normalizeTicket(
  t: FdApiTicket,
  statusLabels: Record<number, string>,
  clientId: string | null,
): TicketInsert {
  const cf = (t.custom_fields ?? {}) as Record<string, unknown>;
  const stats = t.stats ?? {};
  const requesterPhone = t.requester?.mobile ?? t.requester?.phone ?? null;
  return {
    id: t.id,
    subject: t.subject ?? "",
    description_text: t.description_text ?? null,
    status: t.status,
    status_label: fdStatusLabel(t.status, statusLabels),
    priority: t.priority,
    source: t.source ?? null,
    ticket_type: t.type ?? null,
    category: customStr(cf, "cf_category_of_request"),
    sub_category: customStr(cf, "cf_sub_category"),
    classification: customStr(cf, "cf_classification"),
    tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    group_id: t.group_id ?? null,
    responder_id: t.responder_id ?? null,
    internal_group_id: t.internal_group_id ?? null,
    internal_agent_id: t.internal_agent_id ?? null,
    requester_id: t.requester_id,
    company_id: t.company_id ?? null,
    product_id: t.product_id ?? null,
    requester_name: t.requester?.name ?? null,
    requester_phone_e164: safeE164(requesterPhone),
    client_id: clientId,
    due_by: t.due_by ?? null,
    fr_due_by: t.fr_due_by ?? null,
    is_escalated: Boolean(t.is_escalated),
    fr_escalated: Boolean(t.fr_escalated),
    spam: Boolean(t.spam),
    deleted: Boolean(t.deleted),
    first_responded_at: stats.first_responded_at ?? null,
    agent_responded_at: stats.agent_responded_at ?? null,
    requester_responded_at: stats.requester_responded_at ?? null,
    status_updated_at: stats.status_updated_at ?? null,
    reopened_at: stats.reopened_at ?? null,
    pending_since: stats.pending_since ?? null,
    resolved_at: stats.resolved_at ?? null,
    closed_at: stats.closed_at ?? null,
    custom_fields: cf,
    raw: t as unknown as Record<string, unknown>,
    fd_created_at: t.created_at,
    fd_updated_at: t.updated_at,
    conversations_synced_at: null,
    conversation_count: 0,
    synced_at: new Date().toISOString(),
  };
}

// ─── Client linking (the spine join) ─────────────────────────────────────────

/**
 * Resolve public.clients ids for a batch: by freshdesk_contact_id first (the spine
 * carries it), then by E.164 phone (primary or alt). Returns contactId → clientId and
 * phone → clientId maps in one pass.
 */
async function resolveClientLinks(
  contactIds: number[],
  phones: string[],
): Promise<{ byContact: Map<number, string>; byPhone: Map<string, string> }> {
  const byContact = new Map<number, string>();
  const byPhone = new Map<string, string>();
  const admin = createAdminClient();
  const idStrs = Array.from(new Set(contactIds.map(String)));
  const phoneList = Array.from(new Set(phones));

  if (idStrs.length) {
    const { data } = await admin.from("clients").select("id, freshdesk_contact_id").in("freshdesk_contact_id", idStrs);
    for (const r of (data ?? []) as { id: string; freshdesk_contact_id: string | null }[]) {
      if (r.freshdesk_contact_id) byContact.set(Number(r.freshdesk_contact_id), r.id);
    }
  }
  if (phoneList.length) {
    const { data: prim } = await admin.from("clients").select("id, primary_phone").in("primary_phone", phoneList);
    for (const r of (prim ?? []) as { id: string; primary_phone: string | null }[]) {
      if (r.primary_phone) byPhone.set(r.primary_phone, r.id);
    }
    const { data: alt } = await admin.from("clients").select("id, alt_phones").overlaps("alt_phones", phoneList);
    for (const r of (alt ?? []) as { id: string; alt_phones: string[] }[]) {
      for (const p of r.alt_phones ?? []) if (phoneList.includes(p) && !byPhone.has(p)) byPhone.set(p, r.id);
    }
  }
  return { byContact, byPhone };
}

// ─── Diff → ticket_changes ───────────────────────────────────────────────────

type TrackedSnapshot = Pick<FdTicketRow, (typeof FD_TRACKED_FIELDS)[number] | "custom_fields" | "fd_updated_at">;

function valueForDiff(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function diffTicket(
  before: TrackedSnapshot | undefined,
  after: TicketInsert,
  source: string,
): { ticket_id: number; field: string; old_value: string | null; new_value: string | null; fd_updated_at: string | null; source: string }[] {
  if (!before) return [];
  const out: ReturnType<typeof diffTicket> = [];
  for (const field of FD_TRACKED_FIELDS) {
    const o = valueForDiff((before as Record<string, unknown>)[field]);
    const n = valueForDiff((after as Record<string, unknown>)[field]);
    if (o !== n) out.push({ ticket_id: after.id, field, old_value: o, new_value: n, fd_updated_at: after.fd_updated_at, source });
  }
  const beforeCf = (before.custom_fields ?? {}) as Record<string, unknown>;
  const afterCf = (after.custom_fields ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeCf), ...Object.keys(afterCf)]);
  for (const k of keys) {
    // The nested category levels are already tracked as top-level columns.
    if (k === "cf_category_of_request" || k === "cf_sub_category" || k === "cf_classification") continue;
    const o = valueForDiff(beforeCf[k]);
    const n = valueForDiff(afterCf[k]);
    // false/null flips on the many checkbox fields are noise; record real value changes only.
    if (o === n) continue;
    if ((o == null || o === "false") && (n == null || n === "false")) continue;
    out.push({ ticket_id: after.id, field: `cf.${k}`, old_value: o, new_value: n, fd_updated_at: after.fd_updated_at, source });
  }
  return out;
}

// ─── Upsert tickets ──────────────────────────────────────────────────────────

/**
 * Upsert a batch of API tickets. Returns the ids whose thread needs (re)pulling: new
 * rows, and rows whose fd_updated_at moved. Writes ticket_changes for every tracked flip.
 */
export async function upsertTickets(
  apiTickets: FdApiTicket[],
  source: "poll" | "backfill" | "webhook" | "manual",
  stats: FdRunStats,
): Promise<{ threadIds: number[] }> {
  if (apiTickets.length === 0) return { threadIds: [] };
  const db = freshdeskDb();
  const statusLabels = await getStatusLabels();
  stats.ticketsSeen += apiTickets.length;

  const ids = apiTickets.map((t) => t.id);
  const { data: existingRows, error: readErr } = await db
    .from("tickets")
    .select([...FD_TRACKED_FIELDS, "id", "custom_fields", "fd_updated_at", "client_id", "conversations_synced_at", "conversation_count"].join(","))
    .in("id", ids);
  if (readErr) throw new Error(`[freshdesk-sync] read existing tickets failed: ${readErr.message}`);
  type Existing = TrackedSnapshot & { id: number; client_id: string | null; conversations_synced_at: string | null; conversation_count: number };
  const existing = new Map<number, Existing>();
  for (const r of (existingRows ?? []) as unknown as Existing[]) {
    existing.set(r.id, r);
  }

  const phones = apiTickets
    .map((t) => safeE164(t.requester?.mobile ?? t.requester?.phone ?? null))
    .filter((p): p is string => Boolean(p));
  const links = await resolveClientLinks(apiTickets.map((t) => t.requester_id), phones);

  const rows: TicketInsert[] = [];
  const changes: ReturnType<typeof diffTicket> = [];
  const threadIds: number[] = [];
  for (const t of apiTickets) {
    const prev = existing.get(t.id);
    const phone = safeE164(t.requester?.mobile ?? t.requester?.phone ?? null);
    const clientId =
      links.byContact.get(t.requester_id) ?? (phone ? links.byPhone.get(phone) : undefined) ?? prev?.client_id ?? null;
    const row = normalizeTicket(t, statusLabels, clientId);
    if (prev) {
      // Keep the thread bookkeeping the row already has (the upsert would zero it), except
      // that a moved fd_updated_at marks the thread stale: NULL puts it back in the
      // catch-up queue (PostgREST cannot compare two columns, so NULL is the queue flag).
      const moved = prev.fd_updated_at !== row.fd_updated_at;
      row.conversations_synced_at = moved ? null : prev.conversations_synced_at;
      row.conversation_count = prev.conversation_count;
      changes.push(...diffTicket(prev, row, source));
      if (moved || prev.conversations_synced_at == null) threadIds.push(t.id);
    } else {
      threadIds.push(t.id);
    }
    rows.push(row);
  }

  const { error: upErr } = await db.from("tickets").upsert(rows, { onConflict: "id" });
  if (upErr) throw new Error(`[freshdesk-sync] ticket upsert failed: ${upErr.message}`);
  stats.ticketsWritten += rows.length;

  if (changes.length) {
    const { error: chErr } = await db.from("ticket_changes").insert(changes);
    if (chErr) console.warn("[freshdesk-sync] ticket_changes insert failed", chErr.message);
    else stats.changesWritten += changes.length;
  }
  return { threadIds };
}

// ─── Threads ─────────────────────────────────────────────────────────────────

function normalizeConversation(c: FdApiConversation, ticketId: number) {
  return {
    id: c.id,
    ticket_id: ticketId,
    user_id: c.user_id ?? null,
    incoming: Boolean(c.incoming),
    private: Boolean(c.private),
    source: c.source ?? null,
    category: c.category ?? null,
    body_text: c.body_text ?? null,
    body_html: c.body ?? null,
    from_email: c.from_email ?? null,
    to_emails: Array.isArray(c.to_emails) ? c.to_emails : [],
    attachments: Array.isArray(c.attachments) ? c.attachments : [],
    raw: c as unknown as Record<string, unknown>,
    fd_created_at: c.created_at,
    fd_updated_at: c.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Pull one ticket's thread and mark the ticket as thread-synced. One or two API calls, plus
 * (0197) the copy of every file and pasted image the fresh links point at — this pull is the
 * only moment those links are alive. Paths already copied survive a re-pull.
 */
export async function syncThread(ticketId: number, budget: FdBudget, stats: FdRunStats): Promise<void> {
  const db = freshdeskDb();
  const convs = await listConversations(ticketId, budget);
  const [{ data: priorRows }, { data: ticketRow }] = await Promise.all([
    db.from("conversations").select("id, attachments").eq("ticket_id", ticketId),
    db.from("tickets").select("raw, attachments").eq("id", ticketId).maybeSingle(),
  ]);
  const prior = new Map<number, FdAttachment[]>();
  for (const r of (priorRows ?? []) as { id: number; attachments: FdAttachment[] }[]) prior.set(r.id, Array.isArray(r.attachments) ? r.attachments : []);

  let cap = FD_MEDIA_PER_THREAD_MAX;
  let copied = 0;
  if (convs.length) {
    const rows = [];
    for (const c of convs) {
      const row = normalizeConversation(c, ticketId);
      const media = await copyMedia(`${ticketId}/${c.id}`, row.attachments, row.body_html, prior.get(c.id) ?? [], cap);
      cap -= media.copied;
      copied += media.copied;
      rows.push({ ...row, attachments: media.attachments, media_synced_at: media.remaining === 0 ? new Date().toISOString() : null });
    }
    const { error } = await db.from("conversations").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`[freshdesk-sync] conversations upsert failed: ${error.message}`);
    stats.conversationsWritten += convs.length;
  }
  // The ticket's own files and the description's pasted images.
  const t = ticketRow as { raw: Record<string, unknown>; attachments: FdAttachment[] | null } | null;
  if (t) {
    const rawAtt = Array.isArray(t.raw?.attachments) ? (t.raw.attachments as FdAttachment[]) : [];
    const desc = typeof t.raw?.description === "string" ? t.raw.description : null;
    if (rawAtt.length || (desc && desc.includes("<img"))) {
      const media = await copyMedia(`${ticketId}/ticket`, rawAtt, desc, Array.isArray(t.attachments) ? t.attachments : [], cap);
      copied += media.copied;
      const { error: aErr } = await db.from("tickets").update({ attachments: media.attachments }).eq("id", ticketId);
      if (aErr) console.warn("[freshdesk-sync] ticket attachments update failed", aErr.message);
    }
  }
  if (copied) stats.detail.media_copied = Number(stats.detail.media_copied ?? 0) + copied;
  const { error: tErr } = await db
    .from("tickets")
    .update({ conversations_synced_at: new Date().toISOString(), conversation_count: convs.length })
    .eq("id", ticketId);
  if (tErr) console.warn("[freshdesk-sync] thread mark failed", ticketId, tErr.message);
}

async function syncThreadsWhileBudget(ids: number[], budget: FdBudget, stats: FdRunStats): Promise<number> {
  // FD_THREAD_CONCURRENCY threads at once: the budget is charged synchronously inside fdFetch
  // before any await, so parallel callers can never overshoot it; a thread that finds the
  // budget gone simply stops and the next cycle takes the rest.
  let done = 0;
  let exhausted = false;
  await mapWithConcurrency(ids, FD_THREAD_CONCURRENCY, async (id) => {
    if (exhausted || !budgetHasRoom(budget)) return;
    try {
      await syncThread(id, budget, stats);
      done += 1;
    } catch (e) {
      if (e instanceof FdBudgetExhausted) { exhausted = true; return; }
      console.warn("[freshdesk-sync] thread failed", id, e instanceof Error ? e.message : e);
    }
  });
  return done;
}

// ─── Step: the incremental poll ──────────────────────────────────────────────

type PollState = { watermark: string; last_run_at?: string; last_ok?: boolean; last_error?: string | null };

/**
 * Read every ticket updated since the watermark (minus a small overlap), oldest first,
 * page by page while the budget lasts; then pull the threads of what changed.
 */
export async function runPollStep(budget: FdBudget): Promise<FdRunStats> {
  const stats = await startRun("poll");
  const state = (await getSyncState<PollState>(FD_SYNC_KEYS.poll)) ?? { watermark: new Date(Date.now() - 24 * 3600_000).toISOString() };
  const since = new Date(new Date(state.watermark).getTime() - FD_POLL_OVERLAP_MS).toISOString();
  let maxUpdated = state.watermark;
  const threadIds: number[] = [];
  let ok = true;
  try {
    for (let page = 1; page <= FD_MAX_PAGES; page++) {
      if (!budgetHasRoom(budget)) break;
      const { tickets, hasNext } = await listTicketsUpdatedSince(since, page, budget);
      const { threadIds: changed } = await upsertTickets(tickets, "poll", stats);
      threadIds.push(...changed);
      for (const t of tickets) if (t.updated_at > maxUpdated) maxUpdated = t.updated_at;
      if (!hasNext || tickets.length < FD_PAGE_SIZE) break;
    }
    stats.detail.threads_synced = await syncThreadsWhileBudget(threadIds, budget, stats);
    stats.detail.threads_deferred = threadIds.length - (stats.detail.threads_synced as number);
  } catch (e) {
    ok = e instanceof FdBudgetExhausted; // running out of budget is a normal stop, not a failure
    stats.error = e instanceof Error ? e.message : String(e);
    if (!ok) console.error("[freshdesk-sync] poll failed", stats.error);
  }
  await setSyncState(FD_SYNC_KEYS.poll, {
    watermark: maxUpdated,
    last_run_at: new Date().toISOString(),
    last_ok: ok,
    last_error: ok ? null : stats.error,
  });
  await finishRun(stats, budget, ok);
  return stats;
}

// ─── Step: thread catch-up (deferred threads, newest first) ──────────────────

export async function runThreadCatchupStep(budget: FdBudget, limit = 20): Promise<FdRunStats> {
  const stats = await startRun("threads");
  let ok = true;
  try {
    const db = freshdeskDb();
    // NULL conversations_synced_at is the queue flag: never pulled, or marked stale by an
    // upsert whose fd_updated_at moved (see upsertTickets). Newest tickets first.
    const { data, error } = await db
      .from("tickets")
      .select("id")
      .is("conversations_synced_at", null)
      .eq("deleted", false)
      .order("fd_updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
    stats.detail.threads_synced = await syncThreadsWhileBudget(ids, budget, stats);
  } catch (e) {
    ok = e instanceof FdBudgetExhausted;
    stats.error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(stats, budget, ok);
  return stats;
}

// ─── Step: the backfill (oldest first, resumable) ────────────────────────────

type BackfillState = { updated_since: string; page: number; done: boolean; tickets_done: number; started_at?: string; finished_at?: string };

export async function runBackfillStep(budget: FdBudget): Promise<FdRunStats> {
  const stats = await startRun("backfill");
  const state = (await getSyncState<BackfillState>(FD_SYNC_KEYS.backfill)) ?? {
    updated_since: FD_BACKFILL_EPOCH, page: 1, done: false, tickets_done: 0, started_at: new Date().toISOString(),
  };
  if (state.done) {
    stats.detail.skipped = "done";
    await finishRun(stats, budget, true);
    return stats;
  }
  let ok = true;
  let lastUpdated = state.updated_since;
  try {
    while (budgetHasRoom(budget)) {
      const { tickets, hasNext } = await listTicketsUpdatedSince(state.updated_since, state.page, budget);
      await upsertTickets(tickets, "backfill", stats);
      for (const t of tickets) if (t.updated_at > lastUpdated) lastUpdated = t.updated_at;
      state.tickets_done += tickets.length;
      if (!hasNext || tickets.length < FD_PAGE_SIZE) {
        state.done = true;
        state.finished_at = new Date().toISOString();
        break;
      }
      state.page += 1;
      if (state.page > FD_MAX_PAGES) {
        // Freshdesk caps a query at 300 pages: re-anchor on the last update seen.
        state.updated_since = lastUpdated;
        state.page = 1;
      }
    }
  } catch (e) {
    ok = e instanceof FdBudgetExhausted;
    stats.error = e instanceof Error ? e.message : String(e);
    if (!ok) console.error("[freshdesk-sync] backfill failed", stats.error);
  }
  await setSyncState(FD_SYNC_KEYS.backfill, state);
  stats.detail.tickets_done = state.tickets_done;
  stats.detail.done = state.done;
  await finishRun(stats, budget, ok);
  return stats;
}

// ─── Step: contacts ──────────────────────────────────────────────────────────

type ContactsState = { watermark: string; page: number; last_run_at?: string };

function normalizeContact(c: FdApiContact, clientId: string | null) {
  const cf = (c.custom_fields ?? {}) as Record<string, unknown>;
  return {
    id: c.id,
    name: c.name ?? "",
    email: c.email ?? null,
    phone: c.phone ?? null,
    mobile: c.mobile ?? null,
    phone_e164: safeE164(c.mobile ?? c.phone ?? null),
    active: c.active ?? true,
    company_id: c.company_id ?? null,
    category: customStr(cf, "category"),
    custom_fields: cf,
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    description: c.description ?? null,
    client_id: clientId,
    raw: c as unknown as Record<string, unknown>,
    fd_created_at: c.created_at ?? null,
    fd_updated_at: c.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}

export async function runContactsStep(budget: FdBudget, maxPages = 5): Promise<FdRunStats> {
  const stats = await startRun("contacts");
  const state = (await getSyncState<ContactsState>(FD_SYNC_KEYS.contacts)) ?? { watermark: FD_BACKFILL_EPOCH, page: 1 };
  let ok = true;
  let written = 0;
  let maxUpdated = state.watermark;
  try {
    for (let i = 0; i < maxPages && budgetHasRoom(budget); i++) {
      const { contacts, hasNext } = await listContactsUpdatedSince(state.watermark, state.page, budget);
      if (contacts.length) {
        const phones = contacts.map((c) => safeE164(c.mobile ?? c.phone ?? null)).filter((p): p is string => Boolean(p));
        const links = await resolveClientLinks(contacts.map((c) => c.id), phones);
        const rows = contacts.map((c) => {
          const phone = safeE164(c.mobile ?? c.phone ?? null);
          const clientId = links.byContact.get(c.id) ?? (phone ? links.byPhone.get(phone) : undefined) ?? null;
          return normalizeContact(c, clientId);
        });
        const { error } = await freshdeskDb().from("contacts").upsert(rows, { onConflict: "id" });
        if (error) throw new Error(error.message);
        written += rows.length;
        for (const c of contacts) if (c.updated_at && c.updated_at > maxUpdated) maxUpdated = c.updated_at;
      }
      if (!hasNext || contacts.length < FD_PAGE_SIZE) {
        // Caught up: next time start from the newest update seen (overlap absorbed by upsert).
        state.watermark = new Date(new Date(maxUpdated).getTime() - FD_POLL_OVERLAP_MS).toISOString();
        state.page = 1;
        break;
      }
      state.page += 1;
    }
  } catch (e) {
    ok = e instanceof FdBudgetExhausted;
    stats.error = e instanceof Error ? e.message : String(e);
  }
  state.last_run_at = new Date().toISOString();
  await setSyncState(FD_SYNC_KEYS.contacts, state);
  stats.detail.contacts_written = written;
  await finishRun(stats, budget, ok);
  return stats;
}

// ─── Step: reference data (groups, agents, SLA policies, field list) ─────────

type ReferenceState = { last_run_at: string };

function normalizeAgent(a: FdApiAgent, profileId: string | null) {
  return {
    id: a.id,
    name: a.contact?.name ?? `Agent ${a.id}`,
    email: a.contact?.email ?? null,
    job_title: a.contact?.job_title ?? null,
    agent_type: a.type ?? null,
    active: a.contact?.active ?? true,
    deactivated: Boolean(a.deactivated),
    available: Boolean(a.available),
    last_active_at: a.last_active_at ?? null,
    profile_id: profileId,
    raw: a as unknown as Record<string, unknown>,
    fd_created_at: a.created_at ?? null,
    fd_updated_at: a.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}
function normalizeGroup(g: FdApiGroup) {
  return {
    id: g.id, name: g.name, description: g.description ?? null, business_hour_id: g.business_hour_id ?? null,
    group_type: g.group_type ?? null, raw: g as unknown as Record<string, unknown>,
    fd_created_at: g.created_at ?? null, fd_updated_at: g.updated_at ?? null, synced_at: new Date().toISOString(),
  };
}
function normalizeSla(p: FdApiSlaPolicy) {
  return {
    id: Number(p.id), name: p.name, active: p.active ?? true, is_default: p.is_default ?? false, position: p.position ?? null,
    sla_target: p.sla_target ?? {}, applicable_to: p.applicable_to ?? {}, escalation: p.escalation ?? {},
    raw: p as unknown as Record<string, unknown>, fd_created_at: p.created_at ?? null, fd_updated_at: p.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}
function normalizeField(f: FdApiTicketField, choices: unknown | undefined) {
  return {
    id: f.id, name: f.name, label: f.label, field_type: f.type, is_default: Boolean(f.default),
    required_for_agents: Boolean(f.required_for_agents),
    ...(choices === undefined ? {} : { choices: choices ?? null }),
    dependent_fields: f.dependent_fields ?? null,
    raw: f as unknown as Record<string, unknown>, synced_at: new Date().toISOString(),
  };
}

const CHOICE_FIELD_TYPES = new Set(["default_status", "default_priority", "default_source", "default_ticket_type", "nested_field", "custom_dropdown"]);

export async function runReferenceStep(budget: FdBudget, force = false): Promise<FdRunStats> {
  const stats = await startRun("reference");
  const state = await getSyncState<ReferenceState>(FD_SYNC_KEYS.reference);
  if (!force && state?.last_run_at && Date.now() - new Date(state.last_run_at).getTime() < FD_REFERENCE_TTL_MS) {
    stats.detail.skipped = "fresh";
    await finishRun(stats, budget, true);
    return stats;
  }
  const db = freshdeskDb();
  let ok = true;
  try {
    const groups = await listGroups(budget);
    if (groups.length) {
      const { error } = await db.from("groups").upsert(groups.map(normalizeGroup), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const agents = await listAgents(budget);
    if (agents.length) {
      const emails = agents.map((a) => a.contact?.email?.toLowerCase()).filter((e): e is string => Boolean(e));
      const { data: profs } = await createAdminClient().from("profiles").select("id, email").in("email", emails);
      const byEmail = new Map<string, string>();
      for (const p of (profs ?? []) as { id: string; email: string }[]) byEmail.set(p.email.toLowerCase(), p.id);
      const { error } = await db
        .from("agents")
        .upsert(agents.map((a) => normalizeAgent(a, byEmail.get((a.contact?.email ?? "").toLowerCase()) ?? null)), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const slas = await listSlaPolicies(budget);
    if (slas.length) {
      const { error } = await db.from("sla_policies").upsert(slas.map(normalizeSla), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const fields = await listTicketFields(budget);
    if (fields.length) {
      // The list carries no choices; keep whatever choices a row already has (undefined = untouched).
      const { error } = await db.from("ticket_fields").upsert(fields.map((f) => normalizeField(f, undefined)), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    stats.detail = { groups: groups.length, agents: agents.length, sla_policies: slas.length, fields: fields.length };
    await setSyncState(FD_SYNC_KEYS.reference, { last_run_at: new Date().toISOString() });
  } catch (e) {
    ok = e instanceof FdBudgetExhausted;
    stats.error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(stats, budget, ok);
  return stats;
}

/** Pull the choice lists for dropdown-type fields that have none yet (one call per field). */
export async function runFieldChoicesStep(budget: FdBudget, maxFields = 6): Promise<FdRunStats> {
  const stats = await startRun("field_choices");
  const db = freshdeskDb();
  let ok = true;
  let done = 0;
  try {
    const { data, error } = await db.from("ticket_fields").select("id, name, field_type, choices").is("choices", null).limit(200);
    if (error) throw new Error(error.message);
    const targets = ((data ?? []) as { id: number; name: string; field_type: string }[]).filter((f) => CHOICE_FIELD_TYPES.has(f.field_type)).slice(0, maxFields);
    for (const f of targets) {
      if (!budgetHasRoom(budget)) break;
      const full = await getTicketField(f.id, budget);
      if (!full) continue;
      const { error: upErr } = await db.from("ticket_fields").upsert(normalizeField(full, full.choices ?? []), { onConflict: "id" });
      if (upErr) throw new Error(upErr.message);
      done += 1;
      if (f.name === "status") statusLabelCache = null;
    }
  } catch (e) {
    ok = e instanceof FdBudgetExhausted;
    stats.error = e instanceof Error ? e.message : String(e);
  }
  stats.detail.fields_done = done;
  await finishRun(stats, budget, ok);
  return stats;
}

// ─── Webhook processing ──────────────────────────────────────────────────────

/**
 * A Freshdesk automation told us a ticket changed. The payload is partial and untrusted
 * for content, so we re-read the ticket from the API (1 call) and run the normal upsert +
 * thread pull. A 404 means deleted: flip `deleted`, write the change row.
 */
/** The webhook route allows 60 s; a rate-limit wait up to this long still fits with the work. */
const WEBHOOK_RATE_WAIT_MAX_S = 45;

export async function processWebhookEvent(eventId: number, ticketId: number, event: string): Promise<void> {
  const db = freshdeskDb();
  let budget = createFdBudget(6);
  const stats = await startRun("webhook");
  let ok = true;
  try {
    // The minute loop and the member app share the 50 calls a minute; a push that lands in a
    // busy second gets a 429 with a wait. Wait it out once (the route has the time) rather than
    // hand the ticket to the next poll, which is what the seconds path exists to avoid.
    let ticket: Awaited<ReturnType<typeof getTicket>>;
    try {
      ticket = await getTicket(ticketId, budget);
    } catch (e) {
      if (!(e instanceof FdBudgetExhausted) || e.retryAfter == null || e.retryAfter > WEBHOOK_RATE_WAIT_MAX_S) throw e;
      await new Promise((r) => setTimeout(r, e.retryAfter! * 1000 + 500));
      budget = createFdBudget(6);
      stats.detail.waited_s = e.retryAfter;
      ticket = await getTicket(ticketId, budget);
    }
    if (ticket) {
      const { threadIds } = await upsertTickets([ticket], "webhook", stats);
      if (threadIds.length) await syncThreadsWhileBudget(threadIds, budget, stats);
    } else {
      const { data: prev } = await db.from("tickets").select("id, deleted, fd_updated_at").eq("id", ticketId).maybeSingle();
      if (prev && !prev.deleted) {
        await db.from("tickets").update({ deleted: true, synced_at: new Date().toISOString() }).eq("id", ticketId);
        await db.from("ticket_changes").insert({
          ticket_id: ticketId, field: "deleted", old_value: "false", new_value: "true",
          fd_updated_at: prev.fd_updated_at, source: "webhook",
        });
        stats.changesWritten += 1;
      }
      stats.detail.deleted = true;
    }
    stats.detail.event = event;
    await db.from("webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", eventId);
  } catch (e) {
    ok = false;
    stats.error = e instanceof FdBudgetExhausted
      ? `${e.message}; the minute poll will carry this ticket`
      : e instanceof Error ? e.message : String(e);
    console.error("[freshdesk-sync] webhook processing failed", ticketId, stats.error);
    await db.from("webhook_events").update({ processed_at: new Date().toISOString(), error: stats.error }).eq("id", eventId);
  }
  await finishRun(stats, budget, ok);
}

// ─── The cycle (what the minute task runs) ───────────────────────────────────

export type FdCycleSummary = {
  poll: FdRunStats;
  threads: FdRunStats | null;
  backfill: FdRunStats | null;
  reference: FdRunStats | null;
  contacts: FdRunStats | null;
  fieldChoices: FdRunStats | null;
  apiCalls: number;
  rateRemaining: number | null;
};

/**
 * One budgeted cycle, in the order that keeps the mirror freshest: reference (when due)
 * → the incremental poll → deferred threads → contacts (when due) → the backfill with
 * whatever budget is left → field choices. Each step stops cleanly when the budget ends.
 */
export async function runSyncCycle(budget: FdBudget = createFdBudget(), opts: { flagMedia?: number } = {}): Promise<FdCycleSummary> {
  const reference = await runReferenceStep(budget);
  const poll = await runPollStep(budget);
  // 0197: work the attachment backlog by re-queuing old threads, but only while the queue of
  // genuinely changed tickets is short, so a fresh update is never behind old files.
  if (opts.flagMedia && (await threadQueueLength()) < opts.flagMedia) await flagThreadsForMedia(opts.flagMedia);
  const threads = budgetHasRoom(budget) ? await runThreadCatchupStep(budget, FD_THREADS_PER_CYCLE) : null;
  const contactsState = await getSyncState<ContactsState>(FD_SYNC_KEYS.contacts);
  const contactsDue =
    !contactsState?.last_run_at || Date.now() - new Date(contactsState.last_run_at).getTime() > 15 * 60_000;
  const contacts = budgetHasRoom(budget) && contactsDue ? await runContactsStep(budget, 2) : null;
  const backfill = budgetHasRoom(budget) ? await runBackfillStep(budget) : null;
  const fieldChoices = budgetHasRoom(budget) ? await runFieldChoicesStep(budget) : null;
  return { poll, threads, backfill, reference, contacts, fieldChoices, apiCalls: budget.calls, rateRemaining: budget.remaining };
}

// ─── Attachment backlog (0197) ───────────────────────────────────────────────

/** Tickets waiting for a thread pull (changed tickets + re-queued backlog). */
export async function threadQueueLength(): Promise<number> {
  const { count } = await freshdeskDb().from("tickets").select("id", { count: "exact", head: true }).is("conversations_synced_at", null).eq("deleted", false);
  return Number(count ?? 0);
}

/** Notes whose files or pasted images are not copied yet, as distinct tickets and notes. */
export async function getMediaBacklog(): Promise<{ tickets: number; conversations: number }> {
  const { data, error } = await freshdeskDb().rpc("media_backlog");
  if (error) throw new Error(`[freshdesk-sync] media_backlog failed: ${error.message}`);
  const d = (data ?? {}) as { tickets?: number; conversations?: number };
  return { tickets: Number(d.tickets ?? 0), conversations: Number(d.conversations ?? 0) };
}

/** Queue up to `limit` backlog tickets for the next thread catch-up. Returns how many. */
export async function flagThreadsForMedia(limit: number): Promise<number> {
  const { data, error } = await freshdeskDb().rpc("flag_threads_for_media", { p_limit: limit });
  if (error) {
    console.warn("[freshdesk-sync] flag_threads_for_media failed (0197 applied?)", error.message);
    return 0;
  }
  return Number(data ?? 0);
}
