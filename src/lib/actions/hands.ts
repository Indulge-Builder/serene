"use server";

// actions/hands.ts — ALL hands server actions (0245; docs/architecture/hands-plan.md Layers C to F).
// Every one: Zod (parseActionInput) → requireProfile → the hands audience (hasVendorAccess for reads,
// hasVendorActionAccess for writes: admin, founder and the concierge floor) → the viewer's queendom
// scope (getSiaViewerScope, the same answer the Sia and Freshdesk pages use) → a hands-service read
// or a hands-mutations core → { data, error }. Nothing here sends anything: a line leaves the hands
// number only as an outbox row the connector picks up.

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { hasVendorAccess, hasVendorActionAccess } from "@/lib/utils/route-access";
import { getSiaViewerScope } from "@/lib/services/sia-access";
import { canAccessMember } from "@/lib/elaya/access";
import { formErrors } from "@/lib/validations/form-errors";
import {
  DraftHandsMessageSchema, HandsThreadIdSchema, MarkHandsPaymentSchema, OpenHandsThreadSchema, OpenTalkThreadSchema,
  SendHandsMessageSchema, UpdateHandsSettingsSchema, UpsertAllowedContactSchema,
  SaveHandsGuideSchema, RestoreHandsGuideSchema, ImproveHandsGuidesSchema, WriteHandsLineSchema, StartHandsForTicketSchema, SendHandsTicketLineSchema, FileHandsMessageSchema,
} from "@/lib/validations/hands-schema";
import { getHandsThread, listHandsThreads, listUnfiledByContact, listUnmatchedHands, signHandsMedia, type HandsUnmatched, type HandsScope, type HandsThreadSummary, type HandsUnfiled } from "@/lib/services/hands-service";
import {
  closeHandsThreadCore, markHandsPaymentCore, openHandsThreadCore, openTalkThreadCore, queueHandsMessageCore, saveHandsSettingsCore, upsertAllowedContactCore,
  saveHandsGuideCore, restoreHandsGuideCore, fileHandsMessageCore,
} from "@/lib/services/hands-mutations";
import { improveHandsGuides } from "@/lib/services/hands-guide-writer";
import { writeHandsLine } from "@/lib/services/hands-line-writer";
import { dismissHandsTicketDraftCore, getHandsTicketView, sendHandsTicketLineCore, startHandsForTicket, type HandsTicketStart, type HandsTicketView } from "@/lib/services/hands-ticket";
import { checkFreeLine, draftForTicket, type HandsDraft } from "@/lib/services/hands-draft";
import { setVendorKindCore } from "@/lib/services/vendor-mutations";
import { VENDORS_PATH } from "@/lib/constants/vendors";
import { getTicketByRefForElaya } from "@/lib/services/tickets-service";
import { getHandsGuides, getHandsSettings } from "@/lib/services/llm-providers-service";
import { HANDS_PATH, HANDS_SETTINGS_PATH } from "@/lib/constants/hands";
import type { TicketBriefField } from "@/lib/constants/tickets";
import type { ActionResult, Profile } from "@/lib/types";
import type { HandsChatLine, HandsGuideDoc, HandsMessageRow, HandsOutboxRow, HandsThreadRow } from "@/lib/types/hands";

const LOG = "[hands-action]";

async function scopeFor(profile: Profile): Promise<HandsScope | null> {
  const s = await getSiaViewerScope(profile);
  if (!s) return null;
  return { queendomIds: s.kind === "all" ? null : s.queendomIds };
}

/** The hands door: who may read (page audience) and who may write (action audience), plus their queendom scope. */
async function requireHands(write: boolean): Promise<{ ok: true; profile: Profile; scope: HandsScope } | { ok: false; result: { data: null; error: string } }> {
  const auth = await requireProfile();
  if (!auth.ok) return auth;
  const allowed = write ? hasVendorActionAccess(auth.profile) : hasVendorAccess(auth.profile);
  const scope = allowed ? await scopeFor(auth.profile) : null;
  if (!allowed || !scope) return { ok: false, result: { data: null, error: formErrors.handsNoAccess } };
  return { ok: true, profile: auth.profile, scope };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listHandsThreadsAction(input: { kind?: "ticket" | "talk"; status?: "open" | "closed" | "all" } = {}): Promise<ActionResult<HandsThreadSummary[]>> {
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  try {
    return { data: await listHandsThreads(auth.scope, { kind: input.kind, status: input.status ?? "open", limit: 200 }), error: null };
  } catch (e) { console.error(`${LOG} list failed`, e); return { data: null, error: formErrors.generic }; }
}

/** Messages an agent sent while no chat with it was open (unscoped viewers only: a Talk belongs to no queendom). */
export async function listHandsUnfiledAction(): Promise<ActionResult<HandsUnfiled>> {
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  return { data: auth.scope.queendomIds === null ? await listUnfiledByContact() : {}, error: null };
}

export type HandsThreadView = { thread: HandsThreadSummary; messages: HandsChatLine[]; outbox: HandsOutboxRow[] };

export async function getHandsThreadAction(input: unknown): Promise<ActionResult<HandsThreadView>> {
  const parsed = parseActionInput(HandsThreadIdSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  try {
    const t = await getHandsThread(parsed.data.threadId, auth.scope);
    if (!t) return { data: null, error: formErrors.handsThreadInvalid };
    // A file the agent sent (a QR, a screenshot) is shown through a one-hour signed url, never a public link.
    const messages = await Promise.all(t.messages.map(async (m) => ({ ...m, raw: {}, media_url: m.media_path ? await signHandsMedia(m.media_path) : null })));
    return { data: { ...t, messages }, error: null };
  } catch (e) { console.error(`${LOG} thread failed`, e); return { data: null, error: formErrors.generic }; }
}

// ─── Threads ──────────────────────────────────────────────────────────────────

export async function openHandsThreadAction(input: unknown): Promise<ActionResult<HandsThreadRow>> {
  const parsed = parseActionInput(OpenHandsThreadSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const settings = await getHandsSettings();
  if (!settings.enabled) return { data: null, error: formErrors.handsDisabled };
  const t = await getTicketByRefForElaya(parsed.data.ticketId);
  if (!t || !canAccessMember(auth.profile, t.ticket.queendom_id)) return { data: null, error: formErrors.handsTicketInvalid };
  const core = await openHandsThreadCore(t.ticket.id, actorFromProfile(auth.profile));
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  revalidatePath(`/tickets/${t.ticket.id}`);
  return { data: core.data, error: null };
}

export async function openTalkThreadAction(input: unknown): Promise<ActionResult<HandsThreadRow>> {
  const parsed = parseActionInput(OpenTalkThreadSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const settings = await getHandsSettings();
  if (!settings.enabled) return { data: null, error: formErrors.handsDisabled };
  const core = await openTalkThreadCore(parsed.data.jid, actorFromProfile(auth.profile));
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

export async function closeHandsThreadAction(input: unknown): Promise<ActionResult<HandsThreadRow>> {
  const parsed = parseActionInput(HandsThreadIdSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const t = await getHandsThread(parsed.data.threadId, auth.scope);
  if (!t) return { data: null, error: formErrors.handsThreadInvalid };
  const core = await closeHandsThreadCore(t.thread.id, actorFromProfile(auth.profile));
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

// ─── Lines ────────────────────────────────────────────────────────────────────

/** The opening message the filter builds from the ticket's brief: what would be sent, what is held back, any leak. Sends nothing. */
export async function draftHandsMessageAction(input: unknown): Promise<ActionResult<HandsDraft>> {
  const parsed = parseActionInput(DraftHandsMessageSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  const t = await getTicketByRefForElaya(parsed.data.ticketId);
  if (!t || !canAccessMember(auth.profile, t.ticket.queendom_id)) return { data: null, error: formErrors.handsTicketInvalid };
  try {
    return { data: await draftForTicket(t.ticket, { tick: parsed.data.tick as TicketBriefField[] }), error: null };
  } catch (e) { console.error(`${LOG} draft failed`, e); return { data: null, error: formErrors.generic }; }
}

/**
 * "Ask Elaya": she writes one line to the agent from the person's instruction, following the live
 * guide. A job's line uses only what the disclosure filter allows out of the ticket. Sends nothing:
 * the text lands in the composer and goes through sendHandsMessageAction like any typed line.
 */
export async function writeHandsLineAction(input: unknown): Promise<ActionResult<{ text: string }>> {
  const parsed = parseActionInput(WriteHandsLineSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const t = await getHandsThread(parsed.data.threadId, auth.scope);
  if (!t) return { data: null, error: formErrors.handsThreadInvalid };
  let ticket = null;
  if (t.thread.ticket_id) {
    const tk = await getTicketByRefForElaya(t.thread.ticket_id);
    if (!tk || !canAccessMember(auth.profile, tk.ticket.queendom_id)) return { data: null, error: formErrors.handsTicketInvalid };
    ticket = tk.ticket;
  }
  const r = await writeHandsLine({ thread: t.thread, messages: t.messages, instruction: parsed.data.instruction, ticket, actorId: auth.profile.id });
  if (!r.ok) return { data: null, error: r.error };
  return { data: { text: r.text }, error: null };
}

/**
 * Queue one line to the agent on a thread the caller may see. The leak check runs on every text,
 * typed or drafted: a member's name, a phone or an email stops it here, before any row exists.
 */
export async function sendHandsMessageAction(input: unknown): Promise<ActionResult<HandsOutboxRow>> {
  const parsed = parseActionInput(SendHandsMessageSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const settings = await getHandsSettings();
  if (!settings.enabled) return { data: null, error: formErrors.handsDisabled };
  const t = await getHandsThread(parsed.data.threadId, auth.scope);
  if (!t) return { data: null, error: formErrors.handsThreadInvalid };
  let memberId: string | null = null;
  if (t.thread.ticket_id) {
    const tk = await getTicketByRefForElaya(t.thread.ticket_id);
    memberId = tk?.ticket.member_id ?? null;
  }
  const leaks = await checkFreeLine(parsed.data.text, memberId);
  if (leaks.length) return { data: null, error: formErrors.handsLeak };
  const disclosure = parsed.data.fromDraft ? { from_draft: true, ticked: parsed.data.tick } : { typed: true };
  const core = await queueHandsMessageCore(t.thread.id, parsed.data.text, actorFromProfile(auth.profile), { source: "human", disclosure });
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

/**
 * A person scanned the agent's QR and paid. A genie may mark up to the per-job cap; above it a
 * bishop, admin or founder must (the plan's PAY step). The core writes the ticket event and the
 * "paid" line back to the agent.
 */
export async function markHandsPaymentAction(input: unknown): Promise<ActionResult<HandsMessageRow>> {
  const parsed = parseActionInput(MarkHandsPaymentSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  const settings = await getHandsSettings();
  const senior = auth.profile.role === "admin" || auth.profile.role === "founder" || auth.profile.role === "manager" || auth.profile.sia_role === "bishop" || auth.profile.sia_role === "queen";
  if (parsed.data.amountInr > settings.perJobCapInr && !senior) return { data: null, error: formErrors.handsCap };
  const core = await markHandsPaymentCore(parsed.data.messageId, parsed.data.amountInr, actorFromProfile(auth.profile));
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

// ─── Settings (admin / founder) ───────────────────────────────────────────────

export async function upsertAllowedContactAction(input: unknown): Promise<ActionResult<{ jid: string }>> {
  const parsed = parseActionInput(UpsertAllowedContactSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const actor = actorFromProfile(auth.profile);
  const core = await upsertAllowedContactCore(actor, { jid: parsed.data.jid, label: parsed.data.label, vendor_id: parsed.data.vendorId, is_active: parsed.data.isActive });
  if (core.error) return { data: null, error: core.error };
  // The vendor a number stands for IS an outside agent: marking it here is what makes the ticket
  // page offer the Hands line (2026-10-01; the vendor form has no type field of its own).
  if (parsed.data.vendorId) {
    const kind = await setVendorKindCore(actor, parsed.data.vendorId, "agent");
    if (!kind.ok) return { data: null, error: formErrors.handsVendorInvalid };
    revalidatePath(VENDORS_PATH);
  }
  revalidatePath(HANDS_SETTINGS_PATH);
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

export async function updateHandsSettingsAction(input: unknown): Promise<ActionResult<{ keys: string[] }>> {
  const parsed = parseActionInput(UpdateHandsSettingsSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await saveHandsSettingsCore(actorFromProfile(auth.profile), parsed.data);
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

// ─── The rulebook and Elaya's guide (admin / founder, 2026-10-01) ─────────────
// Both live in elaya_settings and are read per call, so a save reaches the next draft and Elaya's
// next hands read with no deploy.

/** A schema issue here is a formErrors key (hands-schema.ts); map it to its words. */
function handsIssue(code: string): string {
  return (formErrors as Record<string, string>)[code] ?? formErrors.generic;
}

export async function getHandsGuidesAction(): Promise<ActionResult<{ rulebook: HandsGuideDoc; guide: HandsGuideDoc }>> {
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  return { data: await getHandsGuides(), error: null };
}

export async function saveHandsGuideAction(input: unknown): Promise<ActionResult<HandsGuideDoc>> {
  const parsed = parseActionInput(SaveHandsGuideSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await saveHandsGuideCore(actorFromProfile(auth.profile), parsed.data.kind, parsed.data.body, { note: parsed.data.note, source: "edit" });
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

export async function restoreHandsGuideAction(input: unknown): Promise<ActionResult<HandsGuideDoc>> {
  const parsed = parseActionInput(RestoreHandsGuideSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await restoreHandsGuideCore(actorFromProfile(auth.profile), parsed.data.kind, parsed.data.version);
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

/** Feedback in plain words → Elaya rewrites both documents → each that changed is a new version. */
export async function improveHandsGuidesAction(input: unknown): Promise<ActionResult<{ summary: string; changed: { rulebook: boolean; guide: boolean }; rulebook: HandsGuideDoc; guide: HandsGuideDoc }>> {
  const parsed = parseActionInput(ImproveHandsGuidesSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const result = await improveHandsGuides(actorFromProfile(auth.profile), parsed.data.feedback, { threadId: parsed.data.threadId });
  if (!result.ok) return { data: null, error: result.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  return { data: { summary: result.summary, changed: result.changed, rulebook: result.rulebook, guide: result.guide }, error: null };
}

// ─── Elaya hands a ticket to the agent (2026-10-01) ───────────────────────────
// The ticket card: what Elaya decided, her draft, and the chat with the agent. Gated by the ticket
// (the caller's queendom), like every other ticket read.

async function handsTicketGate(ticketId: string, write: boolean): Promise<{ ok: true; profile: Profile } | { ok: false; result: { data: null; error: string } }> {
  const auth = await requireHands(write);
  if (!auth.ok) return auth;
  const t = await getTicketByRefForElaya(ticketId);
  if (!t || !canAccessMember(auth.profile, t.ticket.queendom_id)) return { ok: false, result: { data: null, error: formErrors.handsTicketInvalid } };
  return { ok: true, profile: auth.profile };
}

export async function getHandsTicketViewAction(input: unknown): Promise<ActionResult<HandsTicketView>> {
  const parsed = parseActionInput(OpenHandsThreadSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const gate = await handsTicketGate(parsed.data.ticketId, false);
  if (!gate.ok) return gate.result;
  const view = await getHandsTicketView(parsed.data.ticketId);
  return view ? { data: view, error: null } : { data: null, error: formErrors.handsTicketInvalid };
}

/** "Ask Instinct": Elaya reads the ticket now and writes the first message (sent by herself only when the category's trust allows). */
export async function startHandsForTicketAction(input: unknown): Promise<ActionResult<HandsTicketStart>> {
  const parsed = parseActionInput(StartHandsForTicketSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const gate = await handsTicketGate(parsed.data.ticketId, true);
  if (!gate.ok) return gate.result;
  const r = await startHandsForTicket(parsed.data.ticketId, { actor: actorFromProfile(gate.profile), force: true, insist: parsed.data.insist });
  if (r.status === "failed" || r.status === "skipped") return { data: null, error: r.reason ?? formErrors.generic };
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath(HANDS_PATH);
  return { data: r, error: null };
}

/** Send Elaya's draft (as edited) or a typed line to the agent on this ticket. The leak check runs first. */
export async function sendHandsTicketLineAction(input: unknown): Promise<ActionResult<HandsOutboxRow>> {
  const parsed = parseActionInput(SendHandsTicketLineSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const gate = await handsTicketGate(parsed.data.ticketId, true);
  if (!gate.ok) return gate.result;
  const settings = await getHandsSettings();
  if (!settings.enabled) return { data: null, error: formErrors.handsDisabled };
  const t = await getTicketByRefForElaya(parsed.data.ticketId);
  const leaks = await checkFreeLine(parsed.data.text, t?.ticket.member_id ?? null);
  if (leaks.length) return { data: null, error: formErrors.handsLeak };
  const core = await sendHandsTicketLineCore(parsed.data.ticketId, parsed.data.text, actorFromProfile(gate.profile), {
    source: parsed.data.fromDraft ? "elaya" : "human",
    disclosure: parsed.data.fromDraft ? { from_draft: true, approved_by: gate.profile.id } : { typed: true },
  });
  if (core.data === null) return { data: null, error: core.error ?? formErrors.generic };
  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

export async function dismissHandsTicketDraftAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = parseActionInput(OpenHandsThreadSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const gate = await handsTicketGate(parsed.data.ticketId, true);
  if (!gate.ok) return gate.result;
  await dismissHandsTicketDraftCore(parsed.data.ticketId, actorFromProfile(gate.profile));
  return { data: { ok: true }, error: null };
}

// ─── The tray: replies that need a job (2026-10-03) ──────────────────────────

/** Unmatched agent replies with the jobs each could belong to (unscoped viewers; a seated teammate sees none). */
export async function listHandsUnmatchedAction(): Promise<ActionResult<(HandsUnmatched & { media_url: string | null })[]>> {
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  if (auth.scope.queendomIds !== null) return { data: [], error: null };
  const rows = await listUnmatchedHands();
  return { data: await Promise.all(rows.map(async (r) => ({ ...r, media_url: r.message.media_path ? await signHandsMedia(r.message.media_path) : null }))), error: null };
}

/** A person puts an unmatched reply on its job; the ticket sees it as the agent's message. */
export async function fileHandsMessageAction(input: unknown): Promise<ActionResult<{ threadId: string }>> {
  const parsed = parseActionInput(FileHandsMessageSchema, input);
  if (!parsed.ok) return { data: null, error: handsIssue(parsed.error) };
  const auth = await requireHands(true);
  if (!auth.ok) return auth.result;
  if (auth.scope.queendomIds !== null) return { data: null, error: formErrors.handsNoAccess };
  const core = await fileHandsMessageCore(parsed.data.messageId, parsed.data.threadId, "human", actorFromProfile(auth.profile));
  if (core.data === null) return { data: null, error: core.error };
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}
