// hands-mutations.ts — THE context-free write cores of the hands layer (migration 0245;
// docs/architecture/hands-plan.md). The lead-mutations / ticket-mutations posture: a core takes a
// MutationActor (never a session), the CALLER gates (canAccessMember on the ticket, hasElayaAccess
// at the door), actions/hands.ts AND Elaya's hands tools call the SAME core.
//
// The one law of this file: nothing here sends a WhatsApp message. A message leaves the hands
// number only as a hands.outbox row the connector (connector-hands/) picks up, re-checks against the
// allowlist, and sends; the connector alone holds the session. So every write here is a row.
// No `server-only`: Elaya's bridged tools call these.

import { createAdminClient } from "@/lib/supabase/admin";
import { handsDb } from "@/lib/supabase/schemas";
import { ticketsAdminDb } from "@/lib/services/tickets-service";
import { getAllowedContactForVendor, getHandsThreadForTicket } from "@/lib/services/hands-service";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { HandsOutboxRow, HandsThreadRow, HandsMessageRow, HandsPayment, HandsGuideDoc, HandsGuideVersion } from "@/lib/types/hands";
import type { HandsGuideKind, HandsOutboxSource } from "@/lib/constants/hands";
import type { TicketRow } from "@/lib/types/ticket";

const LOG = "[hands-mutations]";
export type HandsResult<T> = { data: T; error: null } | { data: null; error: string };
const fail = <T,>(error: string, e?: { message: string } | null): HandsResult<T> => { if (e) console.error(`${LOG} ${error}`, e.message); return { data: null, error }; };

/**
 * Open (or return) the one live thread between a ticket and an outside agent. By default the agent
 * is the ticket's vendor (setTicketVendorCore). `via` (2026-10-01) names an allow-listed agent
 * contact instead, so Elaya can ask the agent for help on a ticket WITHOUT making it the vendor of
 * record (the genie still chooses who delivers). Either way the contact comes from
 * hands.allowed_contacts, so a number nobody has allow-listed can never be messaged.
 */
export async function openHandsThreadCore(ticketId: string, actor: MutationActor, opts: { via?: { jid: string } } = {}): Promise<HandsResult<HandsThreadRow>> {
  const existing = await getHandsThreadForTicket(ticketId);
  if (existing) return { data: existing, error: null };
  const { data: t } = await ticketsAdminDb().from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return fail("Ticket not found.");
  const ticket = t as TicketRow;
  let contact = ticket.vendor_id ? await getAllowedContactForVendor(ticket.vendor_id) : null;
  if (!contact && opts.via) {
    const { data: c } = await handsDb(createAdminClient()).from("allowed_contacts").select("*").eq("jid", opts.via.jid).eq("is_active", true).maybeSingle();
    contact = (c as typeof contact) ?? null;
  }
  if (!contact) return fail(ticket.vendor_id ? "That vendor is not an agent the hands number may message." : "Choose the agent as the ticket's vendor first.");
  const { data, error } = await handsDb(createAdminClient()).from("threads").insert({
    jid: contact.jid, kind: "ticket", ticket_id: ticket.id, vendor_id: contact.vendor_id ?? ticket.vendor_id, queendom_id: ticket.queendom_id ?? null,
    status: "open", opened_by: actor.userId,
  }).select("*").single();
  if (error || !data) {
    // The partial unique index says one open thread per ticket: a race opened it first.
    const again = await getHandsThreadForTicket(ticketId);
    return again ? { data: again, error: null } : fail("Could not open the thread.", error);
  }
  return { data: data as HandsThreadRow, error: null };
}

/** The Talk tab: a free thread with an allowed contact, no ticket, no member data in reach. */
export async function openTalkThreadCore(jid: string, actor: MutationActor): Promise<HandsResult<HandsThreadRow>> {
  const db = handsDb(createAdminClient());
  const { data: contact } = await db.from("allowed_contacts").select("*").eq("jid", jid).eq("is_active", true).maybeSingle();
  if (!contact) return fail("That number is not on the hands allowlist.");
  const { data: open } = await db.from("threads").select("*").eq("jid", jid).eq("kind", "talk").eq("status", "open").maybeSingle();
  if (open) return { data: await adoptUnfiled(open as HandsThreadRow), error: null };
  const { data, error } = await db.from("threads").insert({ jid, kind: "talk", status: "open", opened_by: actor.userId }).select("*").single();
  if (error || !data) return fail("Could not open the conversation.", error);
  return { data: await adoptUnfiled(data as HandsThreadRow), error: null };
}

/**
 * Files the messages this number sent while no conversation was open into the Talk thread, so
 * the chat shows everything the agent said (found 2026-10-01: Instinct's first replies arrived
 * before any thread existed and were invisible). Best-effort: a failure leaves them unfiled.
 */
async function adoptUnfiled(thread: HandsThreadRow): Promise<HandsThreadRow> {
  const db = handsDb(createAdminClient());
  const { data, error } = await db.from("messages").update({ thread_id: thread.id }).eq("jid", thread.jid).is("thread_id", null).select("wa_timestamp, direction, text, kind");
  if (error) { console.error(`${LOG} adopting unfiled messages failed`, error.message); return thread; }
  const rows = (data ?? []) as { wa_timestamp: string; direction: "in" | "out"; text: string | null; kind: string }[];
  if (rows.length === 0) return thread;
  const latest = rows.reduce((a, b) => (b.wa_timestamp > a.wa_timestamp ? b : a));
  if (thread.last_message_at && thread.last_message_at >= latest.wa_timestamp) return thread;
  const patch = { last_message_at: latest.wa_timestamp, last_direction: latest.direction, last_preview: (latest.text ?? `[${latest.kind}]`).slice(0, 160) };
  const { data: updated } = await db.from("threads").update(patch).eq("id", thread.id).select("*").maybeSingle();
  return (updated as HandsThreadRow | null) ?? { ...thread, ...patch };
}

/**
 * Queue one line to the agent. `disclosure` is the record the approver saw: what came from the
 * brief and what was held back (the drafter fills it; a typed line carries {typed: true}).
 * The connector writes the `hands_sent` ticket event when the line actually leaves.
 */
export async function queueHandsMessageCore(
  threadId: string,
  text: string,
  actor: MutationActor,
  opts: { source: HandsOutboxSource; disclosure?: Record<string, unknown> },
): Promise<HandsResult<HandsOutboxRow>> {
  const clean = sanitizeText(text).trim();
  if (!clean) return fail("Nothing to send.");
  if (clean.length > 4000) return fail("Keep a message under 4000 characters.");
  const db = handsDb(createAdminClient());
  const { data: t } = await db.from("threads").select("*").eq("id", threadId).maybeSingle();
  if (!t) return fail("Thread not found.");
  const thread = t as HandsThreadRow;
  if (thread.status !== "open") return fail("This thread is closed.");
  const { data: contact } = await db.from("allowed_contacts").select("is_active").eq("jid", thread.jid).maybeSingle();
  if (!(contact as { is_active: boolean } | null)?.is_active) return fail("That number is no longer on the hands allowlist.");
  const { data, error } = await db.from("outbox").insert({
    thread_id: thread.id, jid: thread.jid, text: clean, requested_by: actor.userId, source: opts.source, disclosure: opts.disclosure ?? {},
  }).select("*").single();
  if (error || !data) return fail("Could not queue the message.", error);
  return { data: data as HandsOutboxRow, error: null };
}

/**
 * A person scanned the agent's QR and paid: the ledger row (hands_payment on the ticket), the
 * mirror on the message, and a "paid" line queued back to the agent. The CALLER enforces the caps
 * and who may mark (a genie under the per-job cap; a bishop or founder above it).
 */
export async function markHandsPaymentCore(messageId: string, paidAmountInr: number, actor: MutationActor): Promise<HandsResult<HandsMessageRow>> {
  const db = handsDb(createAdminClient());
  const { data: m } = await db.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!m) return fail("Message not found.");
  const msg = m as HandsMessageRow;
  if (!msg.payment) return fail("That message is not a payment request.");
  if (msg.payment.paid_at) return fail("Already marked paid.");
  if (!Number.isFinite(paidAmountInr) || paidAmountInr <= 0) return fail("Enter the amount paid.");
  const payment: HandsPayment = { ...msg.payment, paid_at: new Date().toISOString(), paid_by: actor.userId, paid_amount_inr: paidAmountInr };
  const { data, error } = await db.from("messages").update({ payment }).eq("id", messageId).select("*").single();
  if (error || !data) return fail("Could not record the payment.", error);
  const thread = msg.thread_id ? ((await db.from("threads").select("*").eq("id", msg.thread_id).maybeSingle()).data as HandsThreadRow | null) : null;
  if (thread?.ticket_id) {
    const { error: e } = await ticketsAdminDb().rpc("apply_ticket_change", {
      p_ticket_id: thread.ticket_id, p_patch: {},
      p_event: { actor_kind: "human", actor_id: actor.userId, event_type: "hands_payment", body: `Paid ₹${paidAmountInr.toLocaleString("en-IN")}${payment.payee ? ` to ${payment.payee}` : ""}`, meta: { message_id: messageId, amount_inr: paidAmountInr, payee: payment.payee, asked_inr: msg.payment.amount_inr } },
    });
    if (e) console.error(`${LOG} hands_payment event failed`, e.message);
  }
  if (thread) await queueHandsMessageCore(thread.id, `Paid ₹${paidAmountInr.toLocaleString("en-IN")}.`, actor, { source: "human", disclosure: { typed: true, payment: true } });
  return { data: data as HandsMessageRow, error: null };
}

export async function closeHandsThreadCore(threadId: string, actor: MutationActor): Promise<HandsResult<HandsThreadRow>> {
  const { data, error } = await handsDb(createAdminClient()).from("threads").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", threadId).eq("status", "open").select("*").maybeSingle();
  if (error) return fail("Could not close the thread.", error);
  if (!data) return fail("Thread not found or already closed.");
  void actor;
  return { data: data as HandsThreadRow, error: null };
}

/** /settings/hands: the allowlist. Adding a number is the one act that lets the hands number talk to it. */
export async function upsertAllowedContactCore(actor: MutationActor, input: { jid: string; label: string; vendor_id: string | null; is_active: boolean }): Promise<HandsResult<{ jid: string }>> {
  const jid = input.jid.trim();
  if (!/^\d{8,15}@s\.whatsapp\.net$/.test(jid)) return fail("A contact is a number as <digits>@s.whatsapp.net.");
  const { error } = await handsDb(createAdminClient()).from("allowed_contacts").upsert({ jid, label: sanitizeText(input.label), vendor_id: input.vendor_id, is_active: input.is_active, created_by: actor.userId }, { onConflict: "jid" });
  if (error) return fail("Could not save the contact.", error);
  return { data: { jid }, error: null };
}

/** /settings/hands: the switch, the trust level per category and the caps, as elaya_settings rows (HANDS_SETTING_KEYS). */
export async function saveHandsSettingsCore(actor: MutationActor, input: { enabled: boolean; trustByCategory: Record<string, string>; perJobCapInr: number; dailyCapInr: number; monthlyCapInr: number }): Promise<HandsResult<{ keys: string[] }>> {
  const { HANDS_SETTING_KEYS } = await import("@/lib/constants/hands");
  const now = new Date().toISOString();
  const rows = [
    { key: HANDS_SETTING_KEYS.enabled, value: input.enabled },
    { key: HANDS_SETTING_KEYS.trustByCategory, value: input.trustByCategory },
    { key: HANDS_SETTING_KEYS.perJobCapInr, value: input.perJobCapInr },
    { key: HANDS_SETTING_KEYS.dailyCapInr, value: input.dailyCapInr },
    { key: HANDS_SETTING_KEYS.monthlyCapInr, value: input.monthlyCapInr },
  ].map((r) => ({ ...r, updated_at: now }));
  const { error } = await createAdminClient().from("elaya_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail("Could not save the hands settings.", error);
  void actor;
  return { data: { keys: rows.map((r) => r.key) }, error: null };
}

// ─── The editable rulebook and Elaya's guide (2026-10-01) ────────────────────

async function guideKey(kind: HandsGuideKind): Promise<string> {
  const { HANDS_SETTING_KEYS } = await import("@/lib/constants/hands");
  return kind === "rulebook" ? HANDS_SETTING_KEYS.rulebook : HANDS_SETTING_KEYS.elayaGuide;
}

/**
 * Save a new version of one hands document. The version it replaces goes to the front of the
 * history (the last HANDS_GUIDE_HISTORY kept), so any earlier version can be restored. Elaya's next
 * hands read carries the new text.
 */
export async function saveHandsGuideCore(
  actor: MutationActor,
  kind: HandsGuideKind,
  body: string,
  opts: { note?: string | null; source: "edit" | "feedback" | "restore" },
): Promise<HandsResult<HandsGuideDoc>> {
  const { HANDS_GUIDE_MAX_CHARS, HANDS_GUIDE_HISTORY } = await import("@/lib/constants/hands");
  const { getHandsGuides } = await import("@/lib/services/llm-providers-service");
  const clean = sanitizeText(body).trim();
  if (!clean) return fail("The text cannot be empty.");
  if (clean.length > HANDS_GUIDE_MAX_CHARS) return fail(`Keep it under ${HANDS_GUIDE_MAX_CHARS.toLocaleString("en-IN")} characters.`);
  if (kind === "rulebook") {
    const { missingFrameWords } = await import("@/lib/constants/hands");
    const missing = missingFrameWords(clean);
    if (missing.length) return fail(`The rulebook must keep the reply words ${missing.join(", ")}: Serene reads the agent's first word to know where a job stands.`);
  }
  const docs = await getHandsGuides();
  const current = kind === "rulebook" ? docs.rulebook : docs.guide;
  if (clean === current.body.trim()) return { data: current, error: null };
  const { history: _drop, ...previous } = current;
  void _drop;
  const at = new Date().toISOString();
  const next: HandsGuideDoc = {
    body: clean,
    version: current.version + 1,
    at,
    by: actor.fullName,
    note: opts.note ? sanitizeText(opts.note).slice(0, 500) : null,
    source: opts.source,
    history: [previous as HandsGuideVersion, ...current.history].slice(0, HANDS_GUIDE_HISTORY),
  };
  const { error } = await createAdminClient().from("elaya_settings").upsert({ key: await guideKey(kind), value: next, updated_at: at }, { onConflict: "key" });
  if (error) return fail("Could not save the text.", error);
  return { data: next, error: null };
}

/** Bring back an earlier version: it is saved again as the newest version, so nothing is lost. */
export async function restoreHandsGuideCore(actor: MutationActor, kind: HandsGuideKind, version: number): Promise<HandsResult<HandsGuideDoc>> {
  const { getHandsGuides } = await import("@/lib/services/llm-providers-service");
  const docs = await getHandsGuides();
  const doc = kind === "rulebook" ? docs.rulebook : docs.guide;
  const found = doc.history.find((h) => h.version === version);
  if (!found) return fail("That version is no longer kept.");
  return saveHandsGuideCore(actor, kind, found.body, { note: `Restored version ${version}`, source: "restore" });
}
