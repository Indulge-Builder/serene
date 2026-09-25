// ticket-mutations.ts — THE context-free ticket write cores (migration 0195).
//
// actions/tickets.ts AND the future Elaya write tools / the sentinel call the SAME cores
// (R-01). Every state change goes through the two RPCs (sia.create_ticket /
// sia.apply_ticket_change) on the admin client, so the ticket row and its event are one
// transaction and the state machine (constants/tickets.ts) is enforced here, once. The caller
// checks access (canAccessMember) before a core runs.

import { createNotification } from "@/lib/services/notifications-service";
import { memberDb } from "@/lib/supabase/schemas";
import { ticketsAdminDb, resolveSlaPolicy } from "@/lib/services/tickets-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeTicketEngagement, outcomeForResolution } from "@/lib/services/ticket-vendor";
import { recordDraftReviewCore } from "@/lib/services/draft-reviews";
import { SENTINEL_PROMPT_VERSION } from "@/lib/constants/tickets";
import { TICKET_VENDOR_REQUIRED_STATUSES, TICKET_VENDOR_REQUIRED_MESSAGE,
  canTransition, checklistForCategory, TICKET_SLA_STOPPED_STATUSES, TICKETS_PATH, type TicketPriority, type TicketStatus, TICKET_SETTING_KEYS, TICKET_STATUSES,
} from "@/lib/constants/tickets";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { TicketRow, TicketSlaPolicyRow, TicketMessageLinkRow } from "@/lib/types/ticket";
import type { CreateTicketInput, UpsertTicketSlaPolicyInput, UpdateTicketSettingsInput } from "@/lib/validations/ticket-schema";
import { createPersonalTaskCore } from "@/lib/services/task-mutations";
import { nextBusinessDeadline } from "@/lib/utils/sla";

export type TicketMutationResult<T> = { data: T; error: null } | { data: null; error: string };
const fail = <T,>(msg: string, e?: { message: string } | null): TicketMutationResult<T> => {
  if (e) console.error(`[ticket-mutations] ${msg}:`, e.message);
  return { data: null, error: msg };
};

/** The sentinel acts on tickets with no person behind it; its events carry actor_kind 'sentinel' and no actor_id. */
export const SENTINEL_ACTOR: MutationActor = { userId: "", role: "founder", domain: "concierge", fullName: "Sentinel" };

function humanEvent(actor: MutationActor, event_type: string, body: string | null, meta: Record<string, unknown> = {}, actorKind: "human" | "sentinel" | "system" = "human") {
  return { actor_kind: actorKind, actor_id: actorKind === "human" ? actor.userId : "", event_type, body, meta };
}

/** A deadline `min` minutes out: on the clock, or in business hours when the policy says so. */
export function ticketDeadline(from: Date, min: number, businessHours: boolean): string {
  return businessHours ? nextBusinessDeadline(from, min).toISOString() : new Date(from.getTime() + min * 60_000).toISOString();
}

/** SLA due stamps from the policy: first response, next update, resolve. */
function dueStamps(policy: TicketSlaPolicyRow | null, from: Date, status: TicketStatus): { first_response_due_at: string | null; next_update_due_at: string | null; resolve_due_at: string | null } {
  if (!policy) return { first_response_due_at: null, next_update_due_at: null, resolve_due_at: null };
  const add = (min: number) => ticketDeadline(from, min, policy.business_hours);
  const stopped = TICKET_SLA_STOPPED_STATUSES.includes(status);
  return {
    first_response_due_at: add(policy.first_response_min),
    next_update_due_at: stopped ? null : add(policy.update_cadence_min),
    resolve_due_at: add(policy.resolve_target_min),
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createTicketCore(input: CreateTicketInput, actor: MutationActor, opts: { proposed?: boolean; actorKind?: "human" | "elaya" | "intake" } = {}): Promise<TicketMutationResult<TicketRow>> {
  const admin = createAdminClient();
  const { data: member } = await memberDb(admin).from("members").select("id, queendom_id, tier").eq("id", input.member_id).maybeSingle();
  if (!member) return fail("That member does not exist.");
  const queendomId = (member as { queendom_id: string | null }).queendom_id;
  const status: TicketStatus = opts.proposed ? "proposed" : "open";
  const policy = await resolveSlaPolicy({ queendom_id: queendomId, category: input.category, sub_category: input.sub_category, priority: input.priority });
  const now = new Date();
  const stamps = opts.proposed ? { first_response_due_at: null, next_update_due_at: null, resolve_due_at: null } : dueStamps(policy, now, status);

  const db = ticketsAdminDb();
  const { data, error } = await db.rpc("create_ticket", {
    p_ticket: {
      member_id: input.member_id, queendom_id: queendomId, origin: input.origin, origin_ref: input.message_links[0] ?? {},
      group_jid: input.group_jid, category: input.category, sub_category: input.sub_category, title: input.title,
      brief: input.brief, checklist: checklistForCategory(input.category), priority: input.priority,
      // A human creating by hand approves the priority in the same breath; a proposal waits for the bishop.
      priority_approved_at: opts.proposed ? null : now.toISOString(), priority_approved_by: opts.proposed ? null : actor.userId,
      status, requested_for: input.requested_for, ...stamps,
      assignee_id: input.assignee_id, created_by: actor.userId, created_by_kind: opts.actorKind ?? "human",
      proposed_by_run_id: input.proposed_by_run_id,
      next_wake_at: now.toISOString(), wake_reason: "created",
    },
    p_event: { actor_kind: opts.actorKind ?? "human", actor_id: actor.userId, event_type: opts.proposed ? "proposed" : "created", body: input.note, meta: { origin: input.origin, message_count: input.message_links.length } },
  });
  if (error || !data) return fail("Could not create the ticket.", error);
  const ticket = data as TicketRow;

  if (input.message_links.length) {
    const { error: linkErr } = await db.from("ticket_message_links").insert(
      input.message_links.map((m) => ({ ticket_id: ticket.id, freshdesk_id: null, chat_jid: m.chat_jid, wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, link_kind: m.link_kind, confidence: 1, created_by: actor.userId })),
    );
    if (linkErr) console.warn("[ticket-mutations] message links failed", linkErr.message);
  }
  if (ticket.assignee_id && ticket.assignee_id !== actor.userId) await notifyAssigned(ticket, actor);
  return { data: ticket, error: null };
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function moveTicketStatusCore(ticketId: string, to: TicketStatus, actor: MutationActor, opts: { resolution?: string | null; note?: string | null; actorKind?: "human" | "sentinel" | "system" } = {}): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as TicketRow;
  if (!canTransition(t.status, to)) return fail(`A ticket cannot go from ${t.status} to ${to}.`);
  if (TICKET_VENDOR_REQUIRED_STATUSES.includes(to) && !t.vendor_id) return fail(TICKET_VENDOR_REQUIRED_MESSAGE);
  const policy = await resolveSlaPolicy(t);
  const now = new Date();
  const patch: Record<string, unknown> = { status: to, next_wake_at: now.toISOString(), wake_reason: `status:${to}` };
  if (to === "resolved" || to === "closed" || to === "dropped") {
    patch.closed_at = now.toISOString();
    patch.resolution = opts.resolution ?? (to === "dropped" ? "not_a_request" : "delivered");
    patch.next_update_due_at = "";
  } else {
    if (t.status === "proposed" && to === "open") Object.assign(patch, dueStamps(policy, now, to));
    else patch.next_update_due_at = TICKET_SLA_STOPPED_STATUSES.includes(to) || !policy ? "" : ticketDeadline(now, policy.update_cadence_min, policy.business_hours);
    if (t.closed_at) { patch.closed_at = ""; patch.resolution = ""; }
  }
  const eventType = t.status === "proposed" && to === "open" ? "approved" : t.closed_at && to === "open" ? "reopened" : to === "closed" ? "closed" : "status_changed";
  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId, p_patch: patch,
    p_event: humanEvent(actor, eventType, opts.note ?? null, { from: t.status, to, resolution: patch.resolution ?? null }, opts.actorKind ?? "human"),
  });
  if (error || !data) return fail("Could not move the ticket.", error);
  // The ticket ended: its vendor's job ends with it, with the outcome the ending implies
  // (ticket-vendor.ts). Whoever moved it (a person, Elaya, the sentinel's auto-close), the
  // ledger is closed here, in the core, so no path forgets. Never throws.
  if ((to === "resolved" || to === "closed" || to === "dropped") && t.vendor_id) {
    await closeTicketEngagement(data as TicketRow, outcomeForResolution(to, (patch.resolution as string | undefined) ?? null), opts.note ?? null);
  }
  return { data: data as TicketRow, error: null };
}

// ─── Assignment ──────────────────────────────────────────────────────────────

export async function assignTicketCore(ticketId: string, assigneeId: string | null, actor: MutationActor, opts: { reason?: string | null; note?: string | null } = {}): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as TicketRow;
  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId,
    p_patch: { assignee_id: assigneeId ?? "", next_wake_at: new Date().toISOString(), wake_reason: "assigned" },
    p_event: humanEvent(actor, t.assignee_id ? "reassigned" : "assigned", opts.note ?? null, { from: t.assignee_id, to: assigneeId, reason: opts.reason ?? null }),
  });
  if (error || !data) return fail("Could not assign the ticket.", error);
  const ticket = data as TicketRow;
  if (assigneeId && assigneeId !== actor.userId) await notifyAssigned(ticket, actor);
  return { data: ticket, error: null };
}

// ─── Priority (suggested by the creator, approved by the bishop; the SLA starts here) ──

export async function setTicketPriorityCore(ticketId: string, priority: TicketPriority, actor: MutationActor, approve: boolean): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as TicketRow;
  const policy = await resolveSlaPolicy({ ...t, priority });
  const now = new Date();
  const patch: Record<string, unknown> = { priority, next_wake_at: now.toISOString(), wake_reason: "priority" };
  if (approve) Object.assign(patch, { priority_approved_at: now.toISOString(), priority_approved_by: actor.userId }, dueStamps(policy, t.priority_approved_at ? new Date(t.created_at) : now, t.status));
  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId, p_patch: patch,
    p_event: humanEvent(actor, "priority_changed", null, { from: t.priority, to: priority, approved: approve }),
  });
  if (error || !data) return fail("Could not change the priority.", error);
  return { data: data as TicketRow, error: null };
}

// ─── Brief, checklist, notes, links, money ───────────────────────────────────

export async function updateTicketBriefCore(ticketId: string, patch: { title?: string; category?: string; sub_category?: string | null; brief?: Record<string, unknown>; requested_for?: string | null }, actor: MutationActor): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const p: Record<string, unknown> = {};
  if (patch.title !== undefined) p.title = patch.title;
  if (patch.category !== undefined) p.category = patch.category;
  if (patch.sub_category !== undefined) p.sub_category = patch.sub_category ?? "";
  if (patch.brief !== undefined) p.brief = patch.brief;
  if (patch.requested_for !== undefined) p.requested_for = patch.requested_for ?? "";
  if (Object.keys(p).length === 0) return fail("Nothing to change.");
  p.next_wake_at = new Date().toISOString(); p.wake_reason = "brief";
  const { data, error } = await db.rpc("apply_ticket_change", { p_ticket_id: ticketId, p_patch: p, p_event: humanEvent(actor, "brief_updated", null, { fields: Object.keys(patch) }) });
  if (error || !data) return fail("Could not save the brief.", error);
  return { data: data as TicketRow, error: null };
}

export async function tickChecklistCore(ticketId: string, index: number, done: boolean, actor: MutationActor): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("checklist").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const list = [...((cur as { checklist: TicketRow["checklist"] }).checklist ?? [])];
  if (!list[index]) return fail("No such item.");
  list[index] = { ...list[index], done_at: done ? new Date().toISOString() : null, done_by: done ? actor.userId : null };
  const { data, error } = await db.rpc("apply_ticket_change", { p_ticket_id: ticketId, p_patch: { checklist: list }, p_event: humanEvent(actor, "checklist_ticked", list[index].label, { index, done }) });
  if (error || !data) return fail("Could not update the checklist.", error);
  return { data: data as TicketRow, error: null };
}

export async function addTicketNoteCore(ticketId: string, body: string, actor: MutationActor): Promise<TicketMutationResult<{ id: string }>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("id, member_id, queendom_id, first_responded_at").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as Pick<TicketRow, "id" | "member_id" | "queendom_id" | "first_responded_at">;
  const { data, error } = await db.from("ticket_events").insert({ ticket_id: t.id, member_id: t.member_id, queendom_id: t.queendom_id, actor_kind: "human", actor_id: actor.userId, event_type: "note", body, meta: {}, run_id: null }).select("id").single();
  if (error || !data) return fail("Could not add the note.", error);
  // The first note from a human counts as the first response (the sentinel refines this in T2).
  if (!t.first_responded_at) {
    await db.rpc("apply_ticket_change", { p_ticket_id: ticketId, p_patch: { first_responded_at: new Date().toISOString(), next_wake_at: new Date().toISOString(), wake_reason: "note" }, p_event: { actor_kind: "system", event_type: "observation", body: "First response recorded from a note.", meta: {} } });
  }
  return { data: { id: (data as { id: string }).id }, error: null };
}

export async function linkTicketMessagesCore(ticketId: string, messages: { chat_jid: string; wa_message_id: string; sender_jid: string; link_kind: TicketMessageLinkRow["link_kind"] }[], actor: MutationActor): Promise<TicketMutationResult<{ linked: number }>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("id, member_id, queendom_id").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as Pick<TicketRow, "id" | "member_id" | "queendom_id">;
  const { error } = await db.from("ticket_message_links").insert(messages.map((m) => ({ ticket_id: t.id, freshdesk_id: null, ...m, confidence: 1, created_by: actor.userId })));
  if (error) return fail("Could not link those messages.", error);
  await db.from("ticket_events").insert({ ticket_id: t.id, member_id: t.member_id, queendom_id: t.queendom_id, actor_kind: "human", actor_id: actor.userId, event_type: "member_message_linked", body: null, meta: { count: messages.length }, run_id: null });
  return { data: { linked: messages.length }, error: null };
}

export async function updateTicketMoneyCore(ticketId: string, money: Record<string, unknown>, actor: MutationActor): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("money").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const merged = { ...((cur as { money: Record<string, unknown> }).money ?? {}), ...money };
  const { data, error } = await db.rpc("apply_ticket_change", { p_ticket_id: ticketId, p_patch: { money: merged }, p_event: humanEvent(actor, "quote_added", null, money) });
  if (error || !data) return fail("Could not save the money fields.", error);
  return { data: data as TicketRow, error: null };
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function notifyAssigned(ticket: TicketRow, actor: MutationActor): Promise<void> {
  if (!ticket.assignee_id) return;
  await createNotification({
    recipient_id: ticket.assignee_id,
    type: "ticket_assigned",
    title: `${ticket.ticket_no} assigned to you`,
    body: `${ticket.title} · ${actor.fullName}`,
    action_url: `${TICKETS_PATH}/${ticket.id}`,
  });
}

// ─── Tags (0200) ─────────────────────────────────────────────────────────────

export async function updateTicketTagsCore(ticketId: string, tags: string[], actor: MutationActor): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("tags").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const before = ((cur as { tags: string[] | null }).tags ?? []);
  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId, p_patch: { tags },
    p_event: humanEvent(actor, "observation", `Tags: ${tags.join(", ") || "none"}`, { tags, before }),
  });
  if (error || !data) return fail("Could not save the tags.", error);
  return { data: data as TicketRow, error: null };
}

// ─── Sub-work: a task off a ticket (0200) ────────────────────────────────────

/**
 * A personal task created from a ticket: the SAME createPersonalTaskCore every task uses
 * (reminder, notification, cache dels), plus the task_ticket_meta link and a
 * `subtask_created` event in the diary. The assignee defaults to the actor.
 */
export async function createTicketTaskCore(
  input: { ticket_id: string; title: string; assigned_to: string | null; priority: "urgent" | "high" | "normal"; due_at: string | null },
  actor: MutationActor,
): Promise<TicketMutationResult<{ taskId: string }>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("id, ticket_no, member_id, queendom_id, title").eq("id", input.ticket_id).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as Pick<TicketRow, "id" | "ticket_no" | "member_id" | "queendom_id" | "title">;
  const core = await createPersonalTaskCore(actor, {
    title: input.title, description: `${t.ticket_no} · ${t.title}`, priority: input.priority, dueAt: input.due_at, assignedTo: input.assigned_to, tags: ["ticket"],
  });
  if (!core.ok) return fail("Could not create the task.");
  const admin = createAdminClient();
  const { error: metaErr } = await admin.from("task_ticket_meta").insert({ task_id: core.taskId, ticket_id: t.id });
  if (metaErr) console.warn("[ticket-mutations] task_ticket_meta insert failed", metaErr.message);
  await db.from("ticket_events").insert({
    ticket_id: t.id, member_id: t.member_id, queendom_id: t.queendom_id, actor_kind: "human", actor_id: actor.userId,
    event_type: "subtask_created", body: input.title, meta: { task_id: core.taskId, assigned_to: core.assignedTo, due_at: input.due_at }, run_id: null,
  });
  return { data: { taskId: core.taskId }, error: null };
}

// ─── Settings and SLA policies (0200; admin/founder actions only) ────────────

export async function upsertTicketSlaPolicyCore(input: UpsertTicketSlaPolicyInput): Promise<TicketMutationResult<TicketSlaPolicyRow>> {
  const db = ticketsAdminDb();
  const { id, ...fields } = input;
  const row = { ...fields, tier: null };
  const q = id
    ? db.from("ticket_sla_policies").update(row).eq("id", id).select("*").single()
    : db.from("ticket_sla_policies").insert(row).select("*").single();
  const { data, error } = await q;
  if (error || !data) return fail("Could not save that policy.", error);
  return { data: data as TicketSlaPolicyRow, error: null };
}

export async function deleteTicketSlaPolicyCore(id: string): Promise<TicketMutationResult<{ id: string }>> {
  const db = ticketsAdminDb();
  const { count } = await db.from("ticket_sla_policies").select("id", { count: "exact", head: true }).eq("is_active", true).neq("id", id);
  if (Number(count ?? 0) === 0) return fail("Keep at least one active policy.");
  const { error } = await db.from("ticket_sla_policies").delete().eq("id", id);
  if (error) return fail("Could not delete that policy.", error);
  return { data: { id }, error: null };
}

export async function updateTicketSettingsCore(input: UpdateTicketSettingsInput, actor: MutationActor): Promise<TicketMutationResult<{ keys: string[] }>> {
  const db = ticketsAdminDb();
  const writes: { key: string; value: Record<string, unknown> | unknown[] }[] = [];
  if (input.status_labels) {
    // Only real renames are stored; an empty value means "use the built-in name".
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.status_labels)) if (v && v !== TICKET_STATUSES.labels[k as TicketStatus]) clean[k] = v;
    writes.push({ key: TICKET_SETTING_KEYS.statusLabels, value: clean });
  }
  if (input.tags) writes.push({ key: TICKET_SETTING_KEYS.tags, value: input.tags });
  for (const w of writes) {
    const { error } = await db.from("ticket_settings").upsert({ key: w.key, value: w.value, updated_by: actor.userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return fail("Could not save the settings.", error);
  }
  return { data: { keys: writes.map((w) => w.key) }, error: null };
}

/**
 * The human's answer to the sentinel's suggestion (plan 7.6: the sentinel proposes, a person
 * decides). Approve = the ordinary status move, by the human, noted as the sentinel's idea.
 * Dismiss = the suggestion is taken off the ticket and the refusal is kept as an event: that
 * pair is how we learn whether its judgement can be trusted with more.
 */
export async function resolveSentinelProposalCore(ticketId: string, decision: "approve" | "dismiss", actor: MutationActor): Promise<TicketMutationResult<TicketRow>> {
  const db = ticketsAdminDb();
  const { data: cur } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!cur) return fail("Ticket not found.");
  const t = cur as TicketRow;
  const state = (t.sentinel_state ?? {}) as { proposal?: { status: TicketStatus; from_status: TicketStatus; reason: string; run_id: string | null } };
  const p = state.proposal;
  if (!p || p.from_status !== t.status) return fail("That suggestion is no longer current.");
  // The training ledger (0239): the sentinel's suggestion and the human's answer, in full.
  const review = { source: "sentinel" as const, member_id: t.member_id, queendom_id: t.queendom_id, ticket_id: ticketId, run_id: p.run_id, prompt_version: SENTINEL_PROMPT_VERSION, draft: { suggested_status: p.status, from_status: p.from_status, reason: p.reason }, decided_by: actor.userId || null };
  if (decision === "approve") {
    const moved = await moveTicketStatusCore(ticketId, p.status, actor, { note: `Approved the sentinel's suggestion. ${p.reason}` });
    if (moved.error === null) await recordDraftReviewCore({ ...review, decision: "accepted", final: { status: p.status }, corrections: [] });
    return moved;
  }
  const { proposal: _gone, ...rest } = state;
  void _gone;
  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId, p_patch: { sentinel_state: rest },
    p_event: humanEvent(actor, "observation", `Dismissed the sentinel's suggestion to move this to ${p.status}.`, { proposal_dismissed: p.status, from: t.status, run_id: p.run_id }),
  });
  if (error) return fail("Could not dismiss that suggestion.", error);
  await recordDraftReviewCore({ ...review, decision: "dismissed", corrections: [] });
  return { data: data as TicketRow, error: null };
}
