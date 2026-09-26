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
import type { HandsOutboxRow, HandsThreadRow, HandsMessageRow, HandsPayment } from "@/lib/types/hands";
import type { HandsOutboxSource } from "@/lib/constants/hands";
import type { TicketRow } from "@/lib/types/ticket";

const LOG = "[hands-mutations]";
export type HandsResult<T> = { data: T; error: null } | { data: null; error: string };
const fail = <T,>(error: string, e?: { message: string } | null): HandsResult<T> => { if (e) console.error(`${LOG} ${error}`, e.message); return { data: null, error }; };

/**
 * Open (or return) the one live thread between a ticket and its agent vendor. The ticket must
 * already carry the vendor (setTicketVendorCore); the contact comes from hands.allowed_contacts
 * through vendor_id, so a vendor nobody has allow-listed can never be messaged.
 */
export async function openHandsThreadCore(ticketId: string, actor: MutationActor): Promise<HandsResult<HandsThreadRow>> {
  const existing = await getHandsThreadForTicket(ticketId);
  if (existing) return { data: existing, error: null };
  const { data: t } = await ticketsAdminDb().from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return fail("Ticket not found.");
  const ticket = t as TicketRow;
  if (!ticket.vendor_id) return fail("Choose the agent as the ticket's vendor first.");
  const contact = await getAllowedContactForVendor(ticket.vendor_id);
  if (!contact) return fail("That vendor is not an agent the hands number may message.");
  const { data, error } = await handsDb(createAdminClient()).from("threads").insert({
    jid: contact.jid, kind: "ticket", ticket_id: ticket.id, vendor_id: ticket.vendor_id, queendom_id: ticket.queendom_id ?? null,
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
  if (open) return { data: open as HandsThreadRow, error: null };
  const { data, error } = await db.from("threads").insert({ jid, kind: "talk", status: "open", opened_by: actor.userId }).select("*").single();
  if (error || !data) return fail("Could not open the conversation.", error);
  return { data: data as HandsThreadRow, error: null };
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
