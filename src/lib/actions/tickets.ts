"use server";
// actions/tickets.ts — the Sia ticketing server actions (migration 0195).
//
// Every write: Zod (parseActionInput) → requireProfile() → the caller's access to the
// ticket's member (canAccessMember) → the shared core in services/ticket-mutations.ts →
// revalidatePath → { data, error } (Rule 10). Creation from selected messages goes through
// draftTicketAction (the ticket creator, reasoning tier, masked) and then createTicketAction.

import { revalidatePath } from "next/cache";
import { memberDb } from "@/lib/supabase/schemas";
import { after } from "next/server";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formErrors } from "@/lib/validations/form-errors";
import { canAccessMember } from "@/lib/elaya/access";
import { TICKETS_PATH } from "@/lib/constants/tickets";
import { CLIENTS_PATH } from "@/lib/constants/sia-roles";
import { draftTicketFromMessages } from "@/lib/services/ticket-creator";
import { getIntakeProposal, resolveIntakeProposal } from "@/lib/services/intake-service";
import { getTicketHelp, listQueendomStaff, listBoardTickets } from "@/lib/services/tickets-service";
import {
  addTicketNoteCore, assignTicketCore, createTicketCore, linkTicketMessagesCore, moveTicketStatusCore,
  setTicketPriorityCore, tickChecklistCore, updateTicketBriefCore, updateTicketMoneyCore,
  updateTicketTagsCore, createTicketTaskCore,
} from "@/lib/services/ticket-mutations";
import {
  AddTicketNoteSchema, AssignTicketSchema, CreateTicketSchema, DraftTicketSchema, LinkTicketMessagesSchema,
  MoveTicketStatusSchema, SetTicketPrioritySchema, TickChecklistSchema, UpdateTicketBriefSchema, UpdateTicketMoneySchema,
  UpdateTicketTagsSchema, CreateTicketTaskSchema, DismissIntakeProposalSchema, AcceptIntakeUpdateSchema,
} from "@/lib/validations/ticket-schema";
import type { ActionResult } from "@/lib/types";
import { wakeTicketNow } from "@/lib/services/ticket-sentinel";
import type { StaffOption, TicketDraft, TicketHelp, TicketListItem, TicketRow } from "@/lib/types/ticket";

async function memberQueendom(clientId: string): Promise<{ exists: boolean; queendom_id: string | null }> {
  const { data } = await memberDb(createAdminClient()).from("members").select("queendom_id").eq("id", clientId).maybeSingle();
  return data ? { exists: true, queendom_id: (data as { queendom_id: string | null }).queendom_id } : { exists: false, queendom_id: null };
}
async function ticketQueendom(ticketId: string): Promise<{ exists: boolean; queendom_id: string | null; member_id: string | null }> {
  const { data } = await createAdminClient().schema("sia").from("tickets" as never).select("queendom_id, member_id").eq("id", ticketId).maybeSingle();
  const row = data as unknown as { queendom_id: string | null; member_id: string } | null;
  return row ? { exists: true, queendom_id: row.queendom_id, member_id: row.member_id } : { exists: false, queendom_id: null, member_id: null };
}

async function gateTicket(ticketId: string) {
  const auth = await requireProfile();
  if (!auth.ok) return { ok: false as const, result: auth.result };
  const t = await ticketQueendom(ticketId);
  if (!t.exists || !canAccessMember(auth.profile, t.queendom_id)) return { ok: false as const, result: { data: null, error: formErrors.unauthorized } };
  return { ok: true as const, profile: auth.profile, member_id: t.member_id! };
}

function revalidateTicket(ticketId: string, clientId?: string | null) {
  revalidatePath(TICKETS_PATH);
  revalidatePath(`${TICKETS_PATH}/${ticketId}`);
  if (clientId) revalidatePath(`${CLIENTS_PATH}/${clientId}`);
  // The sentinel reads what just happened now, not at the next sweep (A-16: awaited inside after()).
  after(wakeTicketNow(ticketId).catch((e) => console.error("[tickets-action] sentinel wake failed (non-fatal):", e)));
}

export async function draftTicketAction(input: unknown): Promise<ActionResult<TicketDraft>> {
  const parsed = parseActionInput(DraftTicketSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const q = await memberQueendom(parsed.data.member_id);
  if (!q.exists || !canAccessMember(auth.profile, q.queendom_id)) return { data: null, error: formErrors.unauthorized };
  const draft = await draftTicketFromMessages(parsed.data);
  if (!draft) return { data: null, error: "Elaya could not read those messages. Fill the ticket by hand." };
  return { data: draft, error: null };
}

export async function createTicketAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(CreateTicketSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const q = await memberQueendom(parsed.data.member_id);
  if (!q.exists || !canAccessMember(auth.profile, q.queendom_id)) return { data: null, error: formErrors.unauthorized };
  // From an intake card (0219): the card must be one the caller can see, still open, and about
  // this member. What the human changed before creating is the training signal, so it is
  // measured here against the stored draft, never taken from the browser.
  const card = parsed.data.proposal_id ? await getIntakeProposal(parsed.data.proposal_id) : null;
  if (parsed.data.proposal_id && (!card || card.status !== "open" || card.member_id !== parsed.data.member_id)) return { data: null, error: "That suggestion is no longer open. Refresh the Tickets page." };
  const res = await createTicketCore(parsed.data, actorFromProfile(auth.profile));
  if (res.error !== null || !res.data) return { data: null, error: res.error ?? formErrors.generic };
  if (card) {
    await resolveIntakeProposal(card.id, auth.profile.id, { status: "accepted", ticket_id: res.data.id, fields_changed: draftFieldsChanged(card.draft, parsed.data) });
    revalidatePath(TICKETS_PATH);
  }
  revalidateTicket(res.data.id, res.data.member_id);
  return { data: res.data, error: null };
}

/** Which drafted fields the human changed before creating. Empty = accepted exactly as Serene drafted it. */
function draftFieldsChanged(draft: Partial<TicketDraft>, made: { category: string; sub_category: string | null; title: string; priority: string; requested_for: string | null; brief: Record<string, unknown> }): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();
  if (!same(draft.category, made.category)) out.push("category");
  if (!same(draft.sub_category, made.sub_category)) out.push("sub_category");
  if (!same(draft.title, made.title)) out.push("title");
  if (!same(draft.priority, made.priority)) out.push("priority");
  if (!same(draft.requested_for?.slice(0, 16), made.requested_for?.slice(0, 16))) out.push("requested_for");
  const d = (draft.brief ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(d), ...Object.keys(made.brief)])) if (!same(d[k], made.brief[k])) out.push(`brief.${k}`);
  return out;
}

/** Dismiss an intake card, with the reason. The reason is how intake learns; it is not optional. */
export async function dismissIntakeProposalAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(DismissIntakeProposalSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const card = await getIntakeProposal(parsed.data.proposal_id); // RLS: only a card the caller can see comes back
  if (!card || !canAccessMember(auth.profile, card.queendom_id)) return { data: null, error: formErrors.unauthorized };
  const done = await resolveIntakeProposal(card.id, auth.profile.id, { status: "dismissed", dismiss_reason: parsed.data.reason });
  if (!done) return { data: null, error: "Someone already handled that suggestion." };
  revalidatePath(TICKETS_PATH);
  return { data: { id: card.id }, error: null };
}

/** Accept an "update" card: the messages are linked onto the ticket it named, and its sentinel wakes. */
export async function acceptIntakeUpdateAction(input: unknown): Promise<ActionResult<{ ticket_id: string }>> {
  const parsed = parseActionInput(AcceptIntakeUpdateSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const card = await getIntakeProposal(parsed.data.proposal_id);
  if (!card || card.kind !== "update" || !card.ticket_id || !canAccessMember(auth.profile, card.queendom_id)) return { data: null, error: formErrors.unauthorized };
  if (card.status !== "open") return { data: null, error: "Someone already handled that suggestion." };
  const res = await linkTicketMessagesCore(card.ticket_id, card.messages.map((m) => ({ chat_jid: m.chat_jid, wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, link_kind: "update" as const })), actorFromProfile(auth.profile));
  if (res.error) return { data: null, error: res.error };
  await resolveIntakeProposal(card.id, auth.profile.id, { status: "accepted", ticket_id: card.ticket_id, fields_changed: [] });
  revalidatePath(TICKETS_PATH);
  revalidateTicket(card.ticket_id, card.member_id);
  return { data: { ticket_id: card.ticket_id }, error: null };
}

export async function moveTicketStatusAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(MoveTicketStatusSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await moveTicketStatusCore(parsed.data.ticket_id, parsed.data.status, actorFromProfile(g.profile), { resolution: parsed.data.resolution, note: parsed.data.note });
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id, g.member_id);
  return { data: res.data, error: null };
}

export async function assignTicketAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(AssignTicketSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await assignTicketCore(parsed.data.ticket_id, parsed.data.assignee_id, actorFromProfile(g.profile), { reason: parsed.data.reason, note: parsed.data.note });
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id, g.member_id);
  return { data: res.data, error: null };
}

export async function setTicketPriorityAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(SetTicketPrioritySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await setTicketPriorityCore(parsed.data.ticket_id, parsed.data.priority, actorFromProfile(g.profile), parsed.data.approve);
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id, g.member_id);
  return { data: res.data, error: null };
}

export async function updateTicketBriefAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(UpdateTicketBriefSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const { ticket_id, ...patch } = parsed.data;
  const res = await updateTicketBriefCore(ticket_id, patch, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(ticket_id, g.member_id);
  return { data: res.data, error: null };
}

export async function tickChecklistAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(TickChecklistSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await tickChecklistCore(parsed.data.ticket_id, parsed.data.index, parsed.data.done, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id);
  return { data: res.data, error: null };
}

export async function addTicketNoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(AddTicketNoteSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await addTicketNoteCore(parsed.data.ticket_id, parsed.data.body, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id);
  return { data: res.data, error: null };
}

export async function linkTicketMessagesAction(input: unknown): Promise<ActionResult<{ linked: number }>> {
  const parsed = parseActionInput(LinkTicketMessagesSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await linkTicketMessagesCore(parsed.data.ticket_id, parsed.data.messages, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id);
  return { data: res.data, error: null };
}

export async function updateTicketMoneyAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(UpdateTicketMoneySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const { ticket_id, ...money } = parsed.data;
  const res = await updateTicketMoneyCore(ticket_id, Object.fromEntries(Object.entries(money).filter(([, v]) => v !== undefined)), actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(ticket_id);
  return { data: res.data, error: null };
}

/** The help window's data, refreshed on demand (the page also seeds it server-side). */
export async function getTicketHelpAction(input: { member_id: string; category: string; ticket_id?: string }): Promise<ActionResult<TicketHelp>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  if (typeof input?.member_id !== "string") return { data: null, error: formErrors.generic };
  const q = await memberQueendom(input.member_id);
  if (!q.exists || !canAccessMember(auth.profile, q.queendom_id)) return { data: null, error: formErrors.unauthorized };
  const help = await getTicketHelp(input.member_id, String(input.category ?? ""), input.ticket_id);
  return help ? { data: help, error: null } : { data: null, error: formErrors.generic };
}

/** The assignee picker for a member's queendom (RLS-scoped profiles read). */
export async function listQueendomStaffAction(input: { queendom_id: string | null }): Promise<ActionResult<StaffOption[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const qid = typeof input?.queendom_id === "string" ? input.queendom_id : null;
  if (!canAccessMember(auth.profile, qid)) return { data: null, error: formErrors.unauthorized };
  return { data: await listQueendomStaff(qid), error: null };
}

// ─── Tags, sub-work, the board (0200) ────────────────────────────────────────

export async function updateTicketTagsAction(input: unknown): Promise<ActionResult<TicketRow>> {
  const parsed = parseActionInput(UpdateTicketTagsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await updateTicketTagsCore(parsed.data.ticket_id, parsed.data.tags, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id, g.member_id);
  return { data: res.data, error: null };
}

export async function createTicketTaskAction(input: unknown): Promise<ActionResult<{ taskId: string }>> {
  const parsed = parseActionInput(CreateTicketTaskSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const g = await gateTicket(parsed.data.ticket_id);
  if (!g.ok) return g.result;
  const res = await createTicketTaskCore(parsed.data, actorFromProfile(g.profile));
  if (res.error) return { data: null, error: res.error };
  revalidateTicket(parsed.data.ticket_id, g.member_id);
  revalidatePath("/tasks");
  return { data: res.data, error: null };
}

/** The board's live re-read (the Realtime subscription calls this; RLS scopes the rows). */
export async function listBoardTicketsAction(input: { queendom_id: string | null }): Promise<ActionResult<TicketListItem[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const q = typeof input?.queendom_id === "string" && /^[0-9a-f-]{36}$/i.test(input.queendom_id) ? input.queendom_id : null;
  const privileged = auth.profile.role === "admin" || auth.profile.role === "founder";
  const scope = privileged ? q : (auth.profile.queendom_id ?? null);
  return { data: await listBoardTickets(scope), error: null };
}
