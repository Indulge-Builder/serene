// finance-mutations.ts — THE finance write cores (0250; docs/architecture/finance-plan.md). SERVER ONLY.
// The ONLY place Serene writes to Zoho Books, and the ONLY place it writes to a Freshdesk ticket.
//
// Two cores, called one after the other by the ticket page after a finance person confirmed:
//   createZohoInvoiceCore        the invoice in Zoho: create → mark sent → apply the member's credit
//   updateFreshdeskForInvoiceCore the ticket: a private note with the PDF, billable = Yes, the
//                                 invoice number, the tag "Invoice Done"; then the genie is told
//
// Laws:
//   - One live invoice per ticket (the partial unique index). Every step that lands is recorded
//     in `steps`, so a retry resumes where it stopped and never repeats a step.
//   - A create is never sent twice blind: the invoice carries the reference FD-<ticket id>, and
//     a row that may already have its invoice looks for that reference before creating.
//   - The ticket's STATUS is never changed. A genie resolves, after checking the request is done.
//   - The member comes from the ticket's member link (or the member the finance person chose),
//     never from a name written in a note.
//   - Freshdesk is written with the ACTOR's own key, so Freshdesk shows who did it.
// The caller gates (hasFinanceAccess); the cores take a MutationActor and stay context-free.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyCreditsToInvoice, createInvoice, createZbBudget, findInvoiceByReference, getInvoice, getInvoicePdf, markInvoiceSent, zohoOrgId,
  type ZbCreditApplication,
} from "@/lib/services/zoho-api";
import { addPrivateNoteAs, createFdBudget, getTicket, updateTicketFieldsAs, FdRequestError } from "@/lib/services/freshdesk-api";
import { resyncTicket } from "@/lib/services/freshdesk-sync";
import { getFinanceSettings } from "@/lib/services/llm-providers-service";
import { readFreshdeskKey } from "@/lib/services/staff-freshdesk-keys";
import { getFinanceMember, getFinanceTicket, getInvoiceById, getInvoiceForTicket, getMemberWallet } from "@/lib/services/finance-service";
import { notifyGenieInvoiced } from "@/lib/services/finance-nudges";
import {
  FD_WRITE_MAX_CALLS, FINANCE_FD_BILLABLE_YES, FINANCE_FD_FIELDS, FINANCE_INVOICE_DUE_STATUS, FINANCE_INVOICED_TAG,
  ZOHO_REIMBURSEMENT_ACCOUNT_ID, ZOHO_REIMBURSEMENT_ITEM_ID, ZOHO_WRITE_MAX_CALLS,
} from "@/lib/constants/finance";
import { zohoBooksWebUrl } from "@/lib/constants/zoho";
import { formatCurrency } from "@/lib/utils/numbers";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { FinanceInvoiceItem, FinanceInvoiceRow, FinanceInvoiceSteps } from "@/lib/types/finance";

const LOG = "[finance-mutations]";

// Not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;

export type FinanceMutationError =
  | "disabled" | "not_found" | "not_invoice_due" | "no_member" | "no_zoho_customer" | "already_invoiced"
  | "in_progress" | "invalid" | "no_key" | "zoho" | "freshdesk" | "db";

export type FinanceResult<T> = { ok: true; row: T; note?: string } | { ok: false; error: FinanceMutationError; detail?: string; row?: FinanceInvoiceRow };

export type CreateInvoiceInput = {
  ticketId: number;
  /** The member the invoice is for; omitted = the ticket's own member link. */
  memberId?: string | null;
  date: string;
  items: FinanceInvoiceItem[];
  applyCredit: boolean;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const referenceFor = (ticketId: number): string => `FD-${ticketId}`;

async function logCall(entry: { invoiceId: string | null; ticketId: number; actor: MutationActor; system: "zoho" | "freshdesk" | "serene"; step: string; ok: boolean; status?: number | null; detail?: Record<string, unknown> }): Promise<void> {
  const { error } = await db().from("finance_invoice_log").insert({
    invoice_id: entry.invoiceId, ticket_id: entry.ticketId, actor_id: entry.actor.userId, system: entry.system,
    step: entry.step, ok: entry.ok, http_status: entry.status ?? null, detail: entry.detail ?? {},
  });
  if (error) console.error(`${LOG} log write failed:`, error.message);
}

async function patchInvoice(id: string, patch: Partial<FinanceInvoiceRow>): Promise<FinanceInvoiceRow | null> {
  const { data, error } = await db().from("finance_invoices").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (error) { console.error(`${LOG} invoice update failed:`, error.message); return null; }
  return (data as FinanceInvoiceRow | null) ?? null;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 400);
const errorStatus = (e: unknown): number | null => (typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null);

/** The credit to apply, oldest payment first, then credit notes, up to the invoice total. */
function planCredit(total: number, wallet: Awaited<ReturnType<typeof getMemberWallet>>): { application: ZbCreditApplication; applied: number } {
  let left = total;
  const application: ZbCreditApplication = { invoice_payments: [], apply_creditnotes: [] };
  for (const p of wallet.payments) {
    if (left <= 0) break;
    const take = round2(Math.min(left, p.unused));
    if (take > 0) { application.invoice_payments.push({ payment_id: p.payment_id, amount_applied: take }); left = round2(left - take); }
  }
  for (const c of wallet.creditNotes) {
    if (left <= 0) break;
    const take = round2(Math.min(left, c.balance));
    if (take > 0) { application.apply_creditnotes.push({ creditnote_id: c.creditnote_id, amount_applied: take }); left = round2(left - take); }
  }
  return { application, applied: round2(total - left) };
}

/**
 * The Zoho half. Creates (or resumes) the invoice for a ticket in Invoice Due. On success the
 * row is `invoiced`; the Freshdesk half is a separate call so the person sees each half land.
 */
export async function createZohoInvoiceCore(input: CreateInvoiceInput, actor: MutationActor): Promise<FinanceResult<FinanceInvoiceRow>> {
  if (!(await getFinanceSettings()).enabled) return { ok: false, error: "disabled" };

  const ticket = await getFinanceTicket(input.ticketId);
  if (!ticket) return { ok: false, error: "not_found" };
  if (ticket.status !== FINANCE_INVOICE_DUE_STATUS) return { ok: false, error: "not_invoice_due" };

  const memberId = input.memberId ?? ticket.member_id;
  if (!memberId) return { ok: false, error: "no_member" };
  const member = await getFinanceMember(memberId);
  if (!member) return { ok: false, error: "no_member" };
  if (!member.zohoCustomerId) return { ok: false, error: "no_zoho_customer" };

  const items = input.items.filter((i) => i.amount != null && i.amount > 0 && i.description.trim());
  if (items.length === 0 || items.length !== input.items.length) return { ok: false, error: "invalid" };
  const total = round2(items.reduce((s, i) => s + (i.amount as number), 0));

  // One live invoice per ticket. A failed row is taken over with what was just confirmed, unless
  // its invoice already exists in Zoho: then the row keeps its own draft and only resumes.
  let row = await getInvoiceForTicket(input.ticketId);
  if (row?.status === "invoiced") return { ok: false, error: "already_invoiced", row };
  if (row?.status === "creating" && Date.now() - new Date(row.updated_at).getTime() < 90_000) return { ok: false, error: "in_progress", row };

  const draft = { date: input.date, items, apply_credit: input.applyCredit };
  if (row && !row.steps.zoho_created) {
    row = await patchInvoice(row.id, { status: "creating", draft, total, member_id: member.id, zoho_customer_id: member.zohoCustomerId, error: null, created_by: actor.userId, created_by_name: actor.fullName });
  } else if (row) {
    row = await patchInvoice(row.id, { status: "creating", error: null });
  } else {
    const { data, error } = await db().from("finance_invoices").insert({
      ticket_id: input.ticketId, member_id: member.id, zoho_customer_id: member.zohoCustomerId, status: "creating",
      draft, total, steps: {}, created_by: actor.userId, created_by_name: actor.fullName,
    }).select("*").maybeSingle();
    if (error) {
      // 23505: another person confirmed the same ticket in the same second.
      if ((error as { code?: string }).code === "23505") return { ok: false, error: "in_progress" };
      console.error(`${LOG} invoice insert failed:`, error.message);
      return { ok: false, error: "db" };
    }
    row = data as FinanceInvoiceRow;
  }
  if (!row) return { ok: false, error: "db" };

  const budget = createZbBudget(ZOHO_WRITE_MAX_CALLS);
  const steps: FinanceInvoiceSteps = { ...row.steps };
  const fail = async (step: string, e: unknown): Promise<FinanceResult<FinanceInvoiceRow>> => {
    const detail = errorText(e);
    console.error(`${LOG} ${step} failed for ticket ${input.ticketId}:`, detail);
    await logCall({ invoiceId: row!.id, ticketId: input.ticketId, actor, system: "zoho", step, ok: false, status: errorStatus(e), detail: { error: detail } });
    const failed = await patchInvoice(row!.id, { status: "failed", steps, error: detail });
    return { ok: false, error: "zoho", detail, row: failed ?? row! };
  };

  // 1. The invoice. Looked up by its reference first, so an attempt that landed but never
  //    answered is adopted, not repeated.
  if (!steps.zoho_created || !row.zoho_invoice_id) {
    try {
      const reference = referenceFor(input.ticketId);
      const found = await findInvoiceByReference(row.zoho_customer_id, reference, budget);
      const invoice = found ?? await createInvoice({
        customer_id: row.zoho_customer_id, date: row.draft.date, reference_number: reference, salesperson_name: row.created_by_name,
        line_items: row.draft.items.map((i) => ({ item_id: ZOHO_REIMBURSEMENT_ITEM_ID, account_id: ZOHO_REIMBURSEMENT_ACCOUNT_ID, description: i.description, rate: i.amount as number, quantity: 1 })),
      }, budget);
      steps.zoho_created = true;
      if (found && found.status !== "draft") steps.zoho_sent = true;
      await logCall({ invoiceId: row.id, ticketId: input.ticketId, actor, system: "zoho", step: found ? "adopt_invoice" : "create_invoice", ok: true, detail: { invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number, total: invoice.total } });
      row = (await patchInvoice(row.id, { zoho_invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number, total: Number(invoice.total), balance: Number(invoice.balance), steps })) ?? row;
    } catch (e) { return fail("create_invoice", e); }
  }
  const invoiceId = row.zoho_invoice_id as string;

  // 2. Draft → sent. Nobody is emailed; credit cannot be applied to a draft.
  if (!steps.zoho_sent) {
    try {
      await markInvoiceSent(invoiceId, budget);
      steps.zoho_sent = true;
      await logCall({ invoiceId: row.id, ticketId: input.ticketId, actor, system: "zoho", step: "mark_sent", ok: true });
      row = (await patchInvoice(row.id, { steps })) ?? row;
    } catch (e) { return fail("mark_sent", e); }
  }

  // 3. The member's credit. The invoice stands without it: a failure here is said, not fatal,
  //    and what the wallet does not cover stays as balance (the wallet may go negative).
  let note: string | undefined;
  let creditApplied = Number(row.credit_applied) || 0;
  if (row.draft.apply_credit && !steps.credits_applied) {
    try {
      const wallet = await getMemberWallet(row.zoho_customer_id);
      const { application, applied } = planCredit(Number(row.total), wallet);
      if (applied > 0) {
        await applyCreditsToInvoice(invoiceId, application, budget);
        creditApplied = applied;
      }
      steps.credits_applied = true;
      await logCall({ invoiceId: row.id, ticketId: input.ticketId, actor, system: "zoho", step: "apply_credits", ok: true, detail: { applied, payments: application.invoice_payments.length, credit_notes: application.apply_creditnotes.length } });
    } catch (e) {
      note = "The invoice is made, but the member's credit could not be applied. Apply it in Zoho Books.";
      await logCall({ invoiceId: row.id, ticketId: input.ticketId, actor, system: "zoho", step: "apply_credits", ok: false, status: errorStatus(e), detail: { error: errorText(e) } });
    }
  }

  // 4. What Zoho now says the balance is.
  let balance = round2(Number(row.total) - creditApplied);
  try { balance = Number((await getInvoice(invoiceId, budget)).balance); } catch { /* the computed balance stands */ }

  const done = await patchInvoice(row.id, { status: "invoiced", steps, credit_applied: creditApplied, balance, error: note ?? null });
  return done ? { ok: true, row: done, note } : { ok: false, error: "db", row };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function noteHtml(row: FinanceInvoiceRow, by: string, hasPdf: boolean): string {
  const lines = row.draft.items.map((i) => `<li>${esc(i.description)}: ${esc(formatCurrency(i.amount))}</li>`).join("");
  const url = row.zoho_invoice_id ? zohoBooksWebUrl(zohoOrgId(), "invoices", row.zoho_invoice_id) : null;
  return [
    `<p><b>Invoice ${esc(row.invoice_number ?? "")}</b> for ${esc(formatCurrency(Number(row.total)))}, made in Zoho Books by ${esc(by)} through Serene.</p>`,
    `<ul>${lines}</ul>`,
    `<p>Credit applied ${esc(formatCurrency(Number(row.credit_applied)))}. Balance ${esc(formatCurrency(Number(row.balance ?? 0)))}.</p>`,
    hasPdf ? "<p>The invoice is attached.</p>" : "",
    url ? `<p><a href="${url}">Open in Zoho Books</a></p>` : "",
    "<p>Billable is set to Yes and the invoice number is filled. Finance is done with this ticket: once the request itself is complete, it can be resolved.</p>",
  ].join("");
}

/**
 * The Freshdesk half, under the actor's own Freshdesk name: the private note with the invoice
 * PDF, then billable, the invoice number and the tag. Never the status. Safe to call again:
 * a step that landed is skipped.
 */
export async function updateFreshdeskForInvoiceCore(invoiceId: string, actor: MutationActor): Promise<FinanceResult<FinanceInvoiceRow>> {
  if (!(await getFinanceSettings()).enabled) return { ok: false, error: "disabled" };
  let row = await getInvoiceById(invoiceId);
  if (!row || row.status !== "invoiced" || !row.zoho_invoice_id) return { ok: false, error: "not_found" };
  const key = await readFreshdeskKey(actor.userId);
  if (!key) return { ok: false, error: "no_key", row };

  const steps: FinanceInvoiceSteps = { ...row.steps };
  const budget = createFdBudget(FD_WRITE_MAX_CALLS, 2);
  const fail = async (step: string, e: unknown): Promise<FinanceResult<FinanceInvoiceRow>> => {
    const detail = e instanceof FdRequestError && (e.status === 401 || e.status === 403)
      ? "Freshdesk refused your key. Save it again on your profile."
      : errorText(e);
    console.error(`${LOG} ${step} failed for ticket ${row!.ticket_id}:`, errorText(e));
    await logCall({ invoiceId: row!.id, ticketId: row!.ticket_id, actor, system: "freshdesk", step, ok: false, status: errorStatus(e), detail: { error: errorText(e) } });
    const failed = await patchInvoice(row!.id, { steps, error: detail });
    return { ok: false, error: "freshdesk", detail, row: failed ?? row! };
  };

  if (!steps.fd_note) {
    let file: { name: string; bytes: Uint8Array; type: string } | undefined;
    try {
      const bytes = await getInvoicePdf(row.zoho_invoice_id, createZbBudget(2));
      file = { name: `${(row.invoice_number ?? "invoice").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`, bytes, type: "application/pdf" };
    } catch (e) {
      // The note still goes, with the link: a PDF that would not download must not hold the ticket.
      await logCall({ invoiceId: row.id, ticketId: row.ticket_id, actor, system: "zoho", step: "invoice_pdf", ok: false, status: errorStatus(e), detail: { error: errorText(e) } });
    }
    try {
      const noteId = await addPrivateNoteAs(key.key, row.ticket_id, { html: noteHtml(row, key.agentName, Boolean(file)), file }, budget);
      steps.fd_note = true;
      await logCall({ invoiceId: row.id, ticketId: row.ticket_id, actor, system: "freshdesk", step: "add_note", ok: true, detail: { note_id: noteId, pdf: Boolean(file), as_agent: key.agentId } });
      row = (await patchInvoice(row.id, { steps, fd_note_id: noteId })) ?? row;
    } catch (e) { return fail("add_note", e); }
  }

  if (!steps.fd_fields) {
    try {
      // The tags as Freshdesk holds them this second: a PUT replaces the list.
      const live = await getTicket(row.ticket_id, budget);
      const tags = Array.from(new Set([...(Array.isArray(live?.tags) ? (live?.tags as string[]) : []), FINANCE_INVOICED_TAG]));
      await updateTicketFieldsAs(key.key, row.ticket_id, {
        custom_fields: {
          [FINANCE_FD_FIELDS.billable]: FINANCE_FD_BILLABLE_YES,
          [FINANCE_FD_FIELDS.invoiceNumber]: row.invoice_number ?? "",
          [FINANCE_FD_FIELDS.invoiceAmount]: String(row.total),
        },
        tags,
      }, budget);
      steps.fd_fields = true;
      await logCall({ invoiceId: row.id, ticketId: row.ticket_id, actor, system: "freshdesk", step: "set_fields_and_tag", ok: true, detail: { tags, as_agent: key.agentId } });
      row = (await patchInvoice(row.id, { steps, error: null })) ?? row;
    } catch (e) { return fail("set_fields_and_tag", e); }
  }

  // The mirror shows the change now, and the genie hears about it. Neither can fail the invoice.
  await resyncTicket(row.ticket_id).catch(() => false);
  await notifyGenieInvoiced(row).catch((e) => console.warn(`${LOG} genie notification failed:`, errorText(e)));
  return { ok: true, row };
}

/**
 * Free a ticket whose invoice was voided in Zoho, so it can be invoiced again. Serene does not
 * void in Zoho: a person does that there, then releases the row here. Admin and founder.
 */
export async function releaseInvoiceCore(invoiceId: string, actor: MutationActor, reason: string): Promise<FinanceResult<FinanceInvoiceRow>> {
  const row = await getInvoiceById(invoiceId);
  if (!row || row.status === "void") return { ok: false, error: "not_found" };
  const done = await patchInvoice(row.id, { status: "void", error: reason });
  await logCall({ invoiceId: row.id, ticketId: row.ticket_id, actor, system: "serene", step: "release", ok: Boolean(done), detail: { reason, was: row.status, invoice_number: row.invoice_number } });
  return done ? { ok: true, row: done } : { ok: false, error: "db" };
}
