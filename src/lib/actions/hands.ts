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
} from "@/lib/validations/hands-schema";
import { getHandsThread, listHandsThreads, signHandsMedia, type HandsScope, type HandsThreadSummary } from "@/lib/services/hands-service";
import {
  closeHandsThreadCore, markHandsPaymentCore, openHandsThreadCore, openTalkThreadCore, queueHandsMessageCore, saveHandsSettingsCore, upsertAllowedContactCore,
} from "@/lib/services/hands-mutations";
import { checkFreeLine, draftForTicket, type HandsDraft } from "@/lib/services/hands-draft";
import { getTicketByRefForElaya } from "@/lib/services/tickets-service";
import { getHandsSettings } from "@/lib/services/llm-providers-service";
import { HANDS_PATH, HANDS_SETTINGS_PATH } from "@/lib/constants/hands";
import type { TicketBriefField } from "@/lib/constants/tickets";
import type { ActionResult, Profile } from "@/lib/types";
import type { HandsMessageRow, HandsOutboxRow, HandsThreadRow } from "@/lib/types/hands";

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

export type HandsThreadView = { thread: HandsThreadSummary; messages: (HandsMessageRow & { media_url: string | null })[]; outbox: HandsOutboxRow[] };

export async function getHandsThreadAction(input: unknown): Promise<ActionResult<HandsThreadView>> {
  const parsed = parseActionInput(HandsThreadIdSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  try {
    const t = await getHandsThread(parsed.data.threadId, auth.scope);
    if (!t) return { data: null, error: formErrors.handsThreadInvalid };
    // A file the agent sent (a QR, a screenshot) is shown through a one-hour signed url, never a public link.
    const messages = await Promise.all(t.messages.map(async (m) => ({ ...m, media_url: m.media_path ? await signHandsMedia(m.media_path) : null })));
    return { data: { ...t, messages }, error: null };
  } catch (e) { console.error(`${LOG} thread failed`, e); return { data: null, error: formErrors.generic }; }
}

// ─── Threads ──────────────────────────────────────────────────────────────────

export async function openHandsThreadAction(input: unknown): Promise<ActionResult<HandsThreadRow>> {
  const parsed = parseActionInput(OpenHandsThreadSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
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
  if (!parsed.ok) return { data: null, error: parsed.error };
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
  if (!parsed.ok) return { data: null, error: parsed.error };
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
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireHands(false);
  if (!auth.ok) return auth.result;
  const t = await getTicketByRefForElaya(parsed.data.ticketId);
  if (!t || !canAccessMember(auth.profile, t.ticket.queendom_id)) return { data: null, error: formErrors.handsTicketInvalid };
  try {
    return { data: await draftForTicket(t.ticket, { tick: parsed.data.tick as TicketBriefField[] }), error: null };
  } catch (e) { console.error(`${LOG} draft failed`, e); return { data: null, error: formErrors.generic }; }
}

/**
 * Queue one line to the agent on a thread the caller may see. The leak check runs on every text,
 * typed or drafted: a member's name, a phone or an email stops it here, before any row exists.
 */
export async function sendHandsMessageAction(input: unknown): Promise<ActionResult<HandsOutboxRow>> {
  const parsed = parseActionInput(SendHandsMessageSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
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
  if (!parsed.ok) return { data: null, error: parsed.error };
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
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await upsertAllowedContactCore(actorFromProfile(auth.profile), { jid: parsed.data.jid, label: parsed.data.label, vendor_id: parsed.data.vendorId, is_active: parsed.data.isActive });
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  revalidatePath(HANDS_PATH);
  return { data: core.data, error: null };
}

export async function updateHandsSettingsAction(input: unknown): Promise<ActionResult<{ keys: string[] }>> {
  const parsed = parseActionInput(UpdateHandsSettingsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await saveHandsSettingsCore(actorFromProfile(auth.profile), parsed.data);
  if (core.error) return { data: null, error: core.error };
  revalidatePath(HANDS_SETTINGS_PATH);
  return { data: core.data, error: null };
}
