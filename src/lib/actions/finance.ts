"use server";

// actions/finance.ts — ALL finance server actions (0250; docs/architecture/finance-plan.md).
// Every one: Zod (parseActionInput) → requireProfile → hasFinanceAccess (finance, admin, founder)
// → a finance-service read or a finance-mutations core → { data, error }.
//
// Making an invoice is TWO actions the ticket page calls one after the other, so the person sees
// each half land and no single request runs long: createTicketInvoiceAction (Zoho) and then
// updateTicketForInvoiceAction (Freshdesk, under their own Freshdesk name).

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { hasFinanceAccess } from "@/lib/utils/route-access";
import { formErrors } from "@/lib/validations/form-errors";
import {
  CreateInvoiceSchema, DraftInvoiceSchema, InvoiceIdSchema, ReleaseInvoiceSchema, SaveFreshdeskKeySchema, SearchInvoiceMemberSchema,
} from "@/lib/validations/finance-schema";
import { buildInvoiceDraft } from "@/lib/services/finance-service";
import { searchMembersForPicker } from "@/lib/services/members-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { zohoOrgId } from "@/lib/services/zoho-api";
import { zohoBooksWebUrl } from "@/lib/constants/zoho";
import {
  createZohoInvoiceCore, releaseInvoiceCore, updateFreshdeskForInvoiceCore, type FinanceMutationError,
} from "@/lib/services/finance-mutations";
import { getFreshdeskKeyStatus, removeFreshdeskKey, saveFreshdeskKey, type SaveKeyError } from "@/lib/services/staff-freshdesk-keys";
import { FRESHDESK_PATH } from "@/lib/constants/freshdesk";
import type { ActionResult, Profile } from "@/lib/types";
import type { FinanceInvoiceDraft, FinanceInvoiceRow, FreshdeskKeyStatus } from "@/lib/types/finance";
import type { MemberPickerHit } from "@/lib/types/member";

const LOG = "[finance-action]";

async function requireFinance(): Promise<{ ok: true; profile: Profile } | { ok: false; result: { data: null; error: string } }> {
  const auth = await requireProfile();
  if (!auth.ok) return auth;
  if (!hasFinanceAccess(auth.profile)) return { ok: false, result: { data: null, error: formErrors.financeNoAccess } };
  return { ok: true, profile: auth.profile };
}

const MUTATION_COPY: Record<FinanceMutationError, string> = {
  disabled: formErrors.financeDisabled,
  not_found: formErrors.financeTicketInvalid,
  not_invoice_due: formErrors.financeNotInvoiceDue,
  no_member: formErrors.financeNoMember,
  no_zoho_customer: formErrors.financeNoZohoCustomer,
  already_invoiced: formErrors.financeAlreadyInvoiced,
  in_progress: formErrors.financeInProgress,
  invalid: formErrors.financeItemsRequired,
  no_key: formErrors.financeKeyRequired,
  zoho: formErrors.financeZohoFailed,
  freshdesk: formErrors.financeFreshdeskFailed,
  db: formErrors.generic,
};

const KEY_COPY: Record<SaveKeyError, string> = {
  vault_off: formErrors.financeKeyVaultOff,
  invalid_key: formErrors.financeKeyInvalid,
  inactive_agent: formErrors.financeKeyInactive,
  db: formErrors.generic,
};

/** What the other system said, after our own sentence: finance needs the reason to fix it. */
const withDetail = (copy: string, detail?: string): string => (detail ? `${copy} (${detail.slice(0, 200)})` : copy);

export type InvoiceActionData = { invoice: FinanceInvoiceRow; note: string | null; zohoUrl: string | null };

const zohoUrlFor = (row: FinanceInvoiceRow): string | null => {
  try { return row.zoho_invoice_id ? zohoBooksWebUrl(zohoOrgId(), "invoices", row.zoho_invoice_id) : null; } catch { return null; }
};

// ─── The draft (reads, writes nothing) ───────────────────────────────────────

export async function draftTicketInvoiceAction(input: unknown): Promise<ActionResult<FinanceInvoiceDraft>> {
  const parsed = parseActionInput(DraftInvoiceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  try {
    const draft = await buildInvoiceDraft(parsed.data.ticketId, auth.profile.id, parsed.data.memberId ?? null);
    return draft ? { data: draft, error: null } : { data: null, error: formErrors.financeTicketInvalid };
  } catch (e) {
    console.error(`${LOG} draft failed`, e);
    return { data: null, error: formErrors.generic };
  }
}

/** The member an invoice is for, when the ticket is linked to none. Finance sees every queendom's members by name. */
export async function searchMembersForInvoiceAction(input: unknown): Promise<ActionResult<MemberPickerHit[]>> {
  const parsed = parseActionInput(SearchInvoiceMemberSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  if (parsed.data.q.length < 2) return { data: [], error: null };
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  try {
    return { data: await searchMembersForPicker(parsed.data.q, 8, createAdminClient()), error: null };
  } catch (e) {
    console.error(`${LOG} member search failed`, e);
    return { data: null, error: formErrors.generic };
  }
}

// ─── The invoice ─────────────────────────────────────────────────────────────

/** Half one: the invoice in Zoho Books. The person's Freshdesk key must already be saved, so half two cannot strand it. */
export async function createTicketInvoiceAction(input: unknown): Promise<ActionResult<InvoiceActionData>> {
  const parsed = parseActionInput(CreateInvoiceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  const key = await getFreshdeskKeyStatus(auth.profile.id);
  if (!key.saved) return { data: null, error: formErrors.financeKeyRequired };
  try {
    const res = await createZohoInvoiceCore({
      ticketId: parsed.data.ticketId,
      memberId: parsed.data.memberId ?? null,
      date: parsed.data.date,
      items: parsed.data.items.map((i) => ({ ...i, amountAsWritten: null })),
      applyCredit: parsed.data.applyCredit,
    }, actorFromProfile(auth.profile));
    revalidatePath(`${FRESHDESK_PATH}/${parsed.data.ticketId}`);
    if (!res.ok) return { data: null, error: withDetail(MUTATION_COPY[res.error], res.error === "zoho" ? res.detail : undefined) };
    return { data: { invoice: res.row, note: res.note ?? null, zohoUrl: zohoUrlFor(res.row) }, error: null };
  } catch (e) {
    console.error(`${LOG} create failed`, e);
    return { data: null, error: formErrors.generic };
  }
}

/** Half two: the note with the PDF, billable, the invoice number and the tag, as the person themselves. Safe to press again. */
export async function updateTicketForInvoiceAction(input: unknown): Promise<ActionResult<InvoiceActionData>> {
  const parsed = parseActionInput(InvoiceIdSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  try {
    const res = await updateFreshdeskForInvoiceCore(parsed.data.invoiceId, actorFromProfile(auth.profile));
    if (res.row) revalidatePath(`${FRESHDESK_PATH}/${res.row.ticket_id}`);
    revalidatePath(FRESHDESK_PATH);
    if (!res.ok) return { data: null, error: withDetail(MUTATION_COPY[res.error], res.error === "freshdesk" ? res.detail : undefined) };
    return { data: { invoice: res.row, note: null, zohoUrl: zohoUrlFor(res.row) }, error: null };
  } catch (e) {
    console.error(`${LOG} ticket update failed`, e);
    return { data: null, error: formErrors.generic };
  }
}

/** Free a ticket whose invoice was voided in Zoho, so it can be invoiced again. Admin and founder. */
export async function releaseInvoiceAction(input: unknown): Promise<ActionResult<FinanceInvoiceRow>> {
  const parsed = parseActionInput(ReleaseInvoiceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const res = await releaseInvoiceCore(parsed.data.invoiceId, actorFromProfile(auth.profile), parsed.data.reason);
  if (!res.ok) return { data: null, error: MUTATION_COPY[res.error] };
  revalidatePath(`${FRESHDESK_PATH}/${res.row.ticket_id}`);
  return { data: res.row, error: null };
}

// ─── The person's own Freshdesk key ──────────────────────────────────────────

export async function saveFreshdeskKeyAction(input: unknown): Promise<ActionResult<FreshdeskKeyStatus>> {
  const parsed = parseActionInput(SaveFreshdeskKeySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  const res = await saveFreshdeskKey(auth.profile.id, parsed.data.apiKey);
  if (!res.ok) return { data: null, error: KEY_COPY[res.error] };
  revalidatePath("/profile");
  return { data: res.status, error: null };
}

export async function removeFreshdeskKeyAction(): Promise<ActionResult<FreshdeskKeyStatus>> {
  const auth = await requireFinance();
  if (!auth.ok) return auth.result;
  if (!(await removeFreshdeskKey(auth.profile.id))) return { data: null, error: formErrors.generic };
  revalidatePath("/profile");
  return { data: { saved: false, agentName: null, lastFour: null, verifiedAt: null }, error: null };
}
