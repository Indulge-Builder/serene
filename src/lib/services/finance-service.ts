// finance-service.ts — ALL reads of the finance module (0250; docs/architecture/finance-plan.md).
// SERVER ONLY. Admin client: the freshdesk schema is service_role only and the wallet comes from
// Zoho, so the CALLER gates (hasFinanceAccess in the page and in every action).
//
// buildInvoiceDraft() is what the ticket page shows before anything is written: the invoice
// lines read from the ticket's template notes, the member the invoice will be on, the credit
// they hold in Zoho right now, and whether the caller has saved their Freshdesk key.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import { createZbBudget, listCreditNotes, listCustomerPayments } from "@/lib/services/zoho-api";
import { getFinanceSettings } from "@/lib/services/llm-providers-service";
import { getFreshdeskKeyStatus } from "@/lib/services/staff-freshdesk-keys";
import { parseTemplateNote } from "@/lib/utils/finance-note";
import { IST_OFFSET_MS } from "@/lib/utils/ist";
import { mapRows } from "@/lib/utils/rows";
import { FINANCE_MAX_ITEMS } from "@/lib/constants/finance";
import type { FinanceInvoiceDraft, FinanceInvoiceItem, FinanceInvoiceRow } from "@/lib/types/finance";

const LOG = "[finance-service]";

// Not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;

export type FinanceTicket = { id: number; subject: string | null; status: number; member_id: string | null; tags: string[]; responder_id: number | null; group_id: number | null };

export async function getFinanceTicket(ticketId: number): Promise<FinanceTicket | null> {
  const { data, error } = await freshdeskDb().from("tickets").select("id, subject, status, member_id, tags, responder_id, group_id, deleted").eq("id", ticketId).maybeSingle();
  if (error) { console.error(`${LOG} ticket read failed:`, error.message); return null; }
  const t = data as (FinanceTicket & { deleted: boolean }) | null;
  if (!t || t.deleted) return null;
  return { ...t, tags: Array.isArray(t.tags) ? t.tags : [] };
}

export type FinanceMember = { id: string; fullName: string; zohoCustomerId: string | null };

export async function getFinanceMember(memberId: string): Promise<FinanceMember | null> {
  const { data, error } = await memberDb(createAdminClient()).from("members").select("id, full_name, zoho_customer_id").eq("id", memberId).maybeSingle();
  if (error) { console.error(`${LOG} member read failed:`, error.message); return null; }
  const m = data as { id: string; full_name: string; zoho_customer_id: string | null } | null;
  return m ? { id: m.id, fullName: m.full_name, zohoCustomerId: m.zoho_customer_id } : null;
}

/** The newest invoice row for a ticket (a live one when there is one). */
export async function getInvoiceForTicket(ticketId: number): Promise<FinanceInvoiceRow | null> {
  const { data, error } = await db().from("finance_invoices").select("*").eq("ticket_id", ticketId).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error(`${LOG} invoice read failed:`, error.message); return null; }
  return (data as FinanceInvoiceRow | null) ?? null;
}

export async function getInvoiceById(invoiceId: string): Promise<FinanceInvoiceRow | null> {
  const { data, error } = await db().from("finance_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (error) { console.error(`${LOG} invoice read failed:`, error.message); return null; }
  return (data as FinanceInvoiceRow | null) ?? null;
}

export type MemberWallet = {
  total: number;
  /** Oldest first: the order credit is applied in. */
  payments: { payment_id: string; unused: number; date: string }[];
  creditNotes: { creditnote_id: string; balance: number; date: string }[];
};

/** The credit a member holds in Zoho right now: unused payments and open credit notes. Throws on a Zoho failure. */
export async function getMemberWallet(zohoCustomerId: string): Promise<MemberWallet> {
  const budget = createZbBudget(4);
  const [pays, notes] = await Promise.all([
    listCustomerPayments({ customer_id: zohoCustomerId, sort_column: "date", sort_order: "A" }, budget, 2),
    listCreditNotes({ customer_id: zohoCustomerId, status: "open" }, budget, 1),
  ]);
  const payments = pays.rows.filter((p) => Number(p.unused_amount) > 0).map((p) => ({ payment_id: p.payment_id, unused: Number(p.unused_amount), date: p.date }));
  const creditNotes = notes.rows.filter((c) => Number(c.balance) > 0).map((c) => ({ creditnote_id: c.creditnote_id, balance: Number(c.balance), date: c.date }));
  const total = Math.round((payments.reduce((s, p) => s + p.unused, 0) + creditNotes.reduce((s, c) => s + c.balance, 0)) * 100) / 100;
  return { total, payments, creditNotes };
}

/**
 * Finance writes every Zoho line date first ("24.09.2026  Runner-Surat"). A description the
 * genie wrote without any date gets the day the note was written, in that form; the person
 * checking the preview corrects it when the service was on another day.
 */
function withDate(description: string, noteAt: string): string {
  if (!description || /\d{1,2}\s*[./-]\s*\d{1,2}|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(description)) return description;
  const d = new Date(new Date(noteAt).getTime() + IST_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return description;
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}  ${description}`;
}

/** Today in India, as the date an invoice carries. */
export function todayInIndia(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The invoice Serene would make for this ticket. Reads every private note that is a filled
 * template (newest first) and turns each into its lines. Writes nothing. `memberId` overrides
 * the ticket's own member link (a ticket nobody linked yet: the finance person picks the member).
 */
export async function buildInvoiceDraft(ticketId: number, profileId: string, memberId?: string | null): Promise<FinanceInvoiceDraft | null> {
  const ticket = await getFinanceTicket(ticketId);
  if (!ticket) return null;

  const [convs, existing, key, settings, member] = await Promise.all([
    freshdeskDb().from("conversations").select("id, body_text, fd_created_at").eq("ticket_id", ticketId).eq("private", true).order("fd_created_at", { ascending: false }).limit(200),
    getInvoiceForTicket(ticketId),
    getFreshdeskKeyStatus(profileId),
    getFinanceSettings(),
    (memberId ?? ticket.member_id) ? getFinanceMember((memberId ?? ticket.member_id) as string) : Promise.resolve(null),
  ]);

  const notes = mapRows<{ id: number; body_text: string | null; fd_created_at: string }, { id: number; text: string; at: string }>(
    convs.data, (r) => ({ id: r.id, text: r.body_text ?? "", at: r.fd_created_at }),
  );
  const items: FinanceInvoiceItem[] = [];
  const warnings: string[] = [];
  const sourceNotes: FinanceInvoiceDraft["sourceNotes"] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    const parsed = parseTemplateNote(n.text);
    if (!parsed.isTemplate || parsed.isEmpty) continue;
    sourceNotes.push({ id: n.id, at: n.at, text: n.text.trim() });
    for (const it of parsed.items) {
      // The same line posted twice (a genie re-posting the note) is one line.
      const sig = `${it.description.toLowerCase()}|${it.amount ?? it.amountAsWritten ?? ""}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (items.length < FINANCE_MAX_ITEMS) items.push({ ...it, description: withDate(it.description, n.at), noteId: n.id });
    }
    warnings.push(...parsed.warnings);
  }
  if (sourceNotes.length === 0) warnings.push("No filled template note was found on this ticket. Add the invoice lines by hand.");
  if (sourceNotes.length > 1) warnings.push(`This ticket has ${sourceNotes.length} template notes. Check that no line is billed twice.`);
  if (!member) warnings.push("This ticket is not linked to a member. Choose the member the invoice is for.");
  else if (!member.zohoCustomerId) warnings.push(`${member.fullName} has no Zoho customer linked. Link it on the member page first.`);

  let walletAvailable: number | null = null;
  if (member?.zohoCustomerId && !existing) {
    try { walletAvailable = (await getMemberWallet(member.zohoCustomerId)).total; }
    catch (e) { console.warn(`${LOG} wallet read failed:`, e instanceof Error ? e.message : e); }
  }

  return {
    ticketId, ticketStatus: ticket.status, member, walletAvailable, date: todayInIndia(),
    items, warnings: Array.from(new Set(warnings)), sourceNotes, existing,
    key: { saved: key.saved, agentName: key.agentName }, enabled: settings.enabled,
  };
}
