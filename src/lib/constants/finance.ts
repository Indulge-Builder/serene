// constants/finance.ts — THE Finance vocabulary (0250, docs/architecture/finance-plan.md).
// Step 1 is one thing: the reimbursement invoice for a Freshdesk ticket in Invoice Due.
// The SQL CHECKs in the migration mirror these lists.

import { defineEnum } from "@/lib/constants/define-enum";

/** Freshdesk status id 9, "Invoice Due": the genie paid, wrote the template note and handed over. */
export const FINANCE_INVOICE_DUE_STATUS = 9;

/** The tag Serene adds once the invoice exists. Finance's list is "Invoice Due and not this tag". */
export const FINANCE_INVOICED_TAG = "Invoice Done";

/** The Freshdesk custom fields the close form asks for; Serene fills them so the genie's close is one click. */
export const FINANCE_FD_FIELDS = {
  billable: "cf_is_the_request_billable",
  invoiceNumber: "cf_invoice_number",
  invoiceAmount: "cf_invoice_amount",
} as const;
export const FINANCE_FD_BILLABLE_YES = "Yes";

/**
 * Zoho Books, read from the live organisation 2026-09-28. Every reimbursement invoice is ONE item
 * (Reimbursement Of Expenses) and its line sits on the account of the same name (the "head"); the
 * item's own default account is Sales, so the line names the account. No tax.
 */
export const ZOHO_REIMBURSEMENT_ITEM_ID = "1204503000003268193";
export const ZOHO_REIMBURSEMENT_ACCOUNT_ID = "1204503000003273043";
export const ZOHO_REIMBURSEMENT_ITEM_NAME = "Reimbursement Of Expenses";

export const FINANCE_INVOICE_STATUSES = defineEnum([
  { id: "creating", label: "In progress" },
  { id: "invoiced", label: "Invoiced" },
  { id: "failed", label: "Failed" },
  { id: "void", label: "Voided" },
]);
export type FinanceInvoiceStatus = (typeof FINANCE_INVOICE_STATUSES.values)[number];

export const FINANCE_SETTING_KEYS = { enabled: "finance_invoicing_enabled" } as const;

/** Calls one invoice may spend: Zoho (create, mark sent, payments, credit notes, apply, pdf) and Freshdesk (ticket, note, fields). */
export const ZOHO_WRITE_MAX_CALLS = 8;
export const FD_WRITE_MAX_CALLS = 4;

export const FINANCE_MAX_ITEMS = 12;
export const FINANCE_DESCRIPTION_MAX = 240;
export const FINANCE_AMOUNT_MAX = 50_000_000;

/** The nudge ladder: the genie is reminded once, then the bishops and the queen are told. */
export const FINANCE_NUDGE_AFTER_HOURS = 24;
export const FINANCE_ESCALATE_AFTER_HOURS = 48;

/**
 * The labels of the team's template, in the order they are written. `key` is what the reader
 * fills. "Date- Subject-Location-Pax" on the scaffold's Description line is NOT four fields: it
 * is the hint for how a description is written, which is also how the invoice line reads in Zoho.
 */
export const FINANCE_TEMPLATE_LABELS = [
  { key: "client", label: "Client name" },
  { key: "description", label: "Description" },
  { key: "cost", label: "Cost Price" },
  { key: "sell", label: "Selling Price" },
  { key: "vendor", label: "Name & Bill of vendor" },
  { key: "mode", label: "Payment done via" },
  { key: "note", label: "Note" },
] as const;
export type FinanceTemplateKey = (typeof FINANCE_TEMPLATE_LABELS)[number]["key"];
