// finance-nudges.ts — telling the concierge side that finance is done (0250). No `server-only`:
// the ladder runs from Trigger.dev.
//
// Serene never moves a ticket out of Invoice Due: a genie resolves, after checking the request
// is truly done. So the hand-back is a message, and a ladder makes sure it is heard:
//   at once      the ticket's agent is told the invoice is made
//   after 24 h   still in Invoice Due: the agent is reminded, once
//   after 48 h   still there: the bishops and the queen of that queendom are told, once
// Finance is never involved again. Every message is an in-app notification (and its push).

import { createAdminClient } from "@/lib/supabase/admin";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import { createNotification } from "@/lib/services/notifications-service";
import { getQueendomSeats } from "@/lib/services/queendom-seats";
import { FINANCE_ESCALATE_AFTER_HOURS, FINANCE_INVOICE_DUE_STATUS, FINANCE_NUDGE_AFTER_HOURS } from "@/lib/constants/finance";
import { FRESHDESK_PATH } from "@/lib/constants/freshdesk";
import { mapRows } from "@/lib/utils/rows";
import type { FinanceInvoiceRow } from "@/lib/types/finance";

const LOG = "[finance-nudges]";

// Not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;

type TicketLite = { id: number; subject: string | null; status: number; responder_id: number | null; group_id: number | null };

async function ticketsById(ids: number[]): Promise<Map<number, TicketLite>> {
  const out = new Map<number, TicketLite>();
  if (ids.length === 0) return out;
  const { data, error } = await freshdeskDb().from("tickets").select("id, subject, status, responder_id, group_id").in("id", ids);
  if (error) { console.error(`${LOG} ticket read failed:`, error.message); return out; }
  mapRows<TicketLite, void>(data, (t) => { out.set(t.id, t); });
  return out;
}

/** The Serene account of the Freshdesk agent on a ticket; null when the agent has no linked account. */
async function agentProfileId(responderId: number | null): Promise<string | null> {
  if (responderId == null) return null;
  const { data } = await freshdeskDb().from("agents").select("profile_id").eq("id", responderId).maybeSingle();
  return (data as { profile_id: string | null } | null)?.profile_id ?? null;
}

async function seniorsForGroup(groupId: number | null): Promise<string[]> {
  if (groupId == null) return [];
  const { data } = await createAdminClient().schema("sia").from("queendoms").select("id").eq("freshdesk_group_id", groupId).eq("is_active", true).maybeSingle();
  const queendomId = (data as { id: string } | null)?.id;
  if (!queendomId) return [];
  const seats = await getQueendomSeats(queendomId);
  return Array.from(new Set([...(seats.bishops ?? []), ...(seats.queen ? [seats.queen] : [])]));
}

const title = (t: TicketLite | undefined, id: number): string => `#${id}${t?.subject ? ` ${t.subject.slice(0, 70)}` : ""}`;

/** The first word to the genie, the moment the ticket is updated. */
export async function notifyGenieInvoiced(row: Pick<FinanceInvoiceRow, "ticket_id" | "invoice_number">): Promise<void> {
  const t = (await ticketsById([row.ticket_id])).get(row.ticket_id);
  const recipient = await agentProfileId(t?.responder_id ?? null);
  if (!recipient) return;
  await createNotification({
    recipient_id: recipient, type: "system",
    title: `Invoiced: ${title(t, row.ticket_id)}`,
    body: `Invoice ${row.invoice_number ?? ""} is made and the ticket is filled. Check the request is complete and resolve it.`,
    action_url: `${FRESHDESK_PATH}/${row.ticket_id}`,
  });
}

/**
 * The ladder. Walks the invoices of the last 14 days whose ticket is still in Invoice Due and
 * sends each rung once. `apply: false` reports what it would send and writes nothing.
 */
export async function runInvoiceNudges(opts: { apply: boolean } = { apply: true }): Promise<{ checked: number; reminded: number; escalated: number; stillDue: number }> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const nudgeBefore = new Date(Date.now() - FINANCE_NUDGE_AFTER_HOURS * 3600_000).toISOString();
  const { data, error } = await db().from("finance_invoices")
    .select("id, ticket_id, invoice_number, created_at, genie_nudged_at, escalated_at, steps")
    .eq("status", "invoiced").is("escalated_at", null).gte("created_at", since).lte("created_at", nudgeBefore)
    .order("created_at", { ascending: true }).limit(300);
  if (error) { console.error(`${LOG} read failed:`, error.message); return { checked: 0, reminded: 0, escalated: 0, stillDue: 0 }; }
  type Row = Pick<FinanceInvoiceRow, "id" | "ticket_id" | "invoice_number" | "created_at" | "genie_nudged_at" | "escalated_at" | "steps">;
  const rows = mapRows<Row, Row>(data, (r) => r).filter((r) => r.steps?.fd_fields);
  const tickets = await ticketsById(rows.map((r) => r.ticket_id));

  let reminded = 0, escalated = 0, stillDue = 0;
  for (const r of rows) {
    const t = tickets.get(r.ticket_id);
    if (!t || t.status !== FINANCE_INVOICE_DUE_STATUS) continue; // resolved, or moved on: nothing to say
    stillDue += 1;
    const ageHours = (Date.now() - new Date(r.created_at).getTime()) / 3600_000;
    const now = new Date().toISOString();

    if (!r.genie_nudged_at) {
      const recipient = await agentProfileId(t.responder_id);
      if (opts.apply) {
        if (recipient) {
          await createNotification({
            recipient_id: recipient, type: "system",
            title: `Still in Invoice Due: ${title(t, r.ticket_id)}`,
            body: `Invoice ${r.invoice_number ?? ""} was made a day ago. If the request is complete, resolve the ticket.`,
            action_url: `${FRESHDESK_PATH}/${r.ticket_id}`,
          });
        }
        await db().from("finance_invoices").update({ genie_nudged_at: now }).eq("id", r.id);
      }
      reminded += 1;
      continue;
    }

    if (ageHours >= FINANCE_ESCALATE_AFTER_HOURS) {
      const seniors = await seniorsForGroup(t.group_id);
      if (opts.apply) {
        for (const recipient of seniors) {
          await createNotification({
            recipient_id: recipient, type: "system",
            title: `Invoiced two days ago, not resolved: ${title(t, r.ticket_id)}`,
            body: `Invoice ${r.invoice_number ?? ""} is made and the ticket is filled, but it is still in Invoice Due.`,
            action_url: `${FRESHDESK_PATH}/${r.ticket_id}`,
          });
        }
        await db().from("finance_invoices").update({ escalated_at: now }).eq("id", r.id);
      }
      escalated += 1;
    }
  }
  return { checked: rows.length, reminded, escalated, stillDue };
}
