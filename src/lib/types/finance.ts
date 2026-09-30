// types/finance.ts — the Finance module's shapes (0250). Types only.

import type { FinanceInvoiceStatus, FinanceTemplateKey } from "@/lib/constants/finance";

/** One thing the member is billed for. A flower and its delivery are two items on one invoice. */
export type FinanceInvoiceItem = {
  description: string;
  /** Rupees. null = the reader could not tell (a foreign currency, a blank): a person types it. */
  amount: number | null;
  vendor: string | null;
  mode: string | null;
  /** The Freshdesk note this line was read from. */
  noteId: number | null;
  /** The amount as the genie wrote it, when it was not plain rupees ("129 AED"). */
  amountAsWritten: string | null;
};

export type ParsedTemplateNote = {
  isTemplate: boolean;
  /** Every field blank: the scaffold was posted without being filled. */
  isEmpty: boolean;
  fields: Partial<Record<FinanceTemplateKey, string>>;
  items: Omit<FinanceInvoiceItem, "noteId">[];
  /** What a person should look at before confirming. */
  warnings: string[];
};

export type FinanceInvoiceSteps = {
  zoho_created?: boolean;
  zoho_sent?: boolean;
  credits_applied?: boolean;
  fd_note?: boolean;
  fd_fields?: boolean;
};

export type FinanceInvoiceRow = {
  id: string;
  ticket_id: number;
  member_id: string;
  zoho_customer_id: string;
  status: FinanceInvoiceStatus;
  draft: { date: string; items: FinanceInvoiceItem[]; apply_credit: boolean };
  total: number;
  zoho_invoice_id: string | null;
  invoice_number: string | null;
  credit_applied: number;
  balance: number | null;
  steps: FinanceInvoiceSteps;
  fd_note_id: number | null;
  error: string | null;
  created_by: string;
  created_by_name: string;
  genie_nudged_at: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the ticket page shows before anything is written. */
export type FinanceInvoiceDraft = {
  ticketId: number;
  ticketStatus: number;
  member: { id: string; fullName: string; zohoCustomerId: string | null } | null;
  /** Credit the member holds in Zoho right now (unused payments + open credit notes); null = could not be read. */
  walletAvailable: number | null;
  date: string;
  items: FinanceInvoiceItem[];
  warnings: string[];
  /** The notes the items were read from, newest first, as written. */
  sourceNotes: { id: number; at: string; text: string }[];
  /** The invoice already made for this ticket, when there is one. */
  existing: FinanceInvoiceRow | null;
  /** The caller's own Freshdesk key: saved or not, and the name Freshdesk knows it by. */
  key: { saved: boolean; agentName: string | null };
  enabled: boolean;
};

export type FreshdeskKeyStatus = { saved: boolean; agentName: string | null; lastFour: string | null; verifiedAt: string | null };
