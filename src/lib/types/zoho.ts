// Zoho Books shapes — the fields Serene reads (the API returns many more; everything
// unused is dropped at the boundary). Types only, no runtime values. Vocabulary in
// constants/zoho.ts. Verified against the live organisation on 2026-09-15.

// ─── API rows (as Zoho returns them) ─────────────────────────────────────────

export type ZbPageContext = { page: number; per_page: number; has_more_page: boolean };

export type ZbInvoice = {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  date: string;          // yyyy-mm-dd
  due_date: string;
  total: number;
  balance: number;
  currency_code: string;
  reference_number?: string;
  last_payment_date?: string;
  payment_expected_date?: string;
  is_viewed_by_member?: boolean;
  cf_queendon?: string;
};

export type ZbInvoiceDetail = ZbInvoice & {
  sub_total?: number;
  tax_total?: number;
  notes?: string;
  payment_made?: number;
  credits_applied?: number;
  write_off_amount?: number;
  line_items?: { line_item_id?: string; name?: string; description?: string; quantity?: number; rate?: number; item_total?: number }[];
};

export type ZbPayment = {
  payment_id: string;
  payment_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  amount: number;
  unused_amount: number;
  payment_mode: string;
  invoice_numbers: string;
  reference_number: string;
  account_name: string;
  description?: string;
};

export type ZbCreditNote = {
  creditnote_id: string;
  creditnote_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  date: string;
  total: number;
  balance: number;
  reference_number?: string;
};

export type ZbBill = {
  bill_id: string;
  bill_number: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
};

export type ZbBankAccount = {
  account_id: string;
  account_name: string;
  account_type: string;   // bank | credit_card | cash | payment_clearing | …
  currency_code: string;
  balance: number;        // the books balance
  bank_balance: number;   // the feed balance (0 when no feed)
  is_active: boolean;
  bank_name?: string;
};

export type ZbContact = {
  contact_id: string;
  contact_name: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  contact_type: string;
  customer_sub_type?: string;
  status: string;
  currency_code: string;
  outstanding_receivable_amount: number;
  unused_credits_receivable_amount: number;
  payment_terms_label?: string;
  gst_no?: string;
  gst_treatment?: string;
  created_time?: string;
  last_modified_time?: string;
  notes?: string;
  cf_queendon?: string;
  billing_address?: { address?: string; city?: string; state?: string; zip?: string; country?: string };
  contact_persons?: { contact_person_id?: string; first_name?: string; last_name?: string; email?: string; phone?: string; mobile?: string; is_primary_contact?: boolean }[];
};

/** GET /invoices/dashboard → data.dashboard_details (amounts arrive as "26,17,885.15"). */
export type ZbInvoiceDashboard = {
  total_due: string;
  overdue: string;
  due_today: string;
  due_within_30_days: string;
  average_days_for_full_pay: string;
};

/** GET /reports/aragingsummary → invoice.{total, intervals[]}. */
export type ZbAgingInterval = { amount: number; interval: string; interval_formatted: string };

/** A node of the profit-and-loss / balance-sheet / cash-flow trees. */
export type ZbReportNode = {
  total?: number;
  total_label?: string;
  name?: string;
  account_transactions?: ZbReportNode[];
};

// ─── What the pages read (shaped in zoho-service.ts) ─────────────────────────

export type BooksOverview = {
  org: { name: string; currency: string };
  receivables: {
    totalDue: number;
    overdue: number;
    dueToday: number;
    dueWithin30: number;
    averageDaysToPay: number | null;
    aging: ZbAgingInterval[];
  };
  payables: { open: number; openCount: number; overdue: number; more: boolean };
  cash: { banks: number; cards: number; clearing: number; accounts: ZbBankAccount[] };
  thisMonth: { invoiced: number; received: number; expenses: number; from: string };
  fyToDate: { income: number; expenses: number; netProfit: number; from: string };
  overdueInvoices: ZbInvoice[];
  recentInvoices: ZbInvoice[];
  recentPayments: ZbPayment[];
  fetchedAt: string;
  apiCalls: number;
  dailyRemaining: number | null;
};

export type MemberFinance = {
  contact: ZbContact | null;
  invoices: ZbInvoice[];
  payments: ZbPayment[];
  creditNotes: ZbCreditNote[];
  totals: { invoiced: number; paid: number; outstanding: number; credits: number; invoiceCount: number };
  fetchedAt: string;
  apiCalls: number;
};
