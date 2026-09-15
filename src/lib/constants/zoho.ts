// constants/zoho.ts — THE Zoho Books vocabulary as Serene reads it (read-only, never a write).
//
// The organisation lives in Zoho's India data centre (accounts.zoho.in → api domain
// https://www.zohoapis.in), Books API v3, OAuth 2 refresh-token flow (access tokens live an
// hour). The plan allows 10,000 calls a day (x-rate-limit-limit) and about 100 a minute;
// every read runs against a ZbBudget so a page can never eat the day. Amounts are INR,
// the financial year starts in April (organisation settings, read live 2026-09-15).

export const ZOHO_BOOKS_PATH = "/books";

/** The accounts host of the data centre the organisation lives in. */
export const ZOHO_ACCOUNTS_HOST_DEFAULT = "accounts.zoho.in";
/** Used only until the first token refresh tells us the real api_domain. */
export const ZOHO_API_DOMAIN_DEFAULT = "https://www.zohoapis.in";
export const ZOHO_BOOKS_API_PREFIX = "/books/v3";

/** Calls one read may spend (a page open, a card open). */
export const ZOHO_RUN_MAX_CALLS = 25;
/** Never spend below this many of the day's allowance — the app server shares the org. */
export const ZOHO_DAILY_RESERVE = 500;
/** Zoho's list page cap. */
export const ZOHO_PAGE_SIZE = 200;

/** How long a read is served from Redis before Zoho is asked again. */
export const ZOHO_CACHE_TTL = {
  /** The org-wide /books overview: ~14 calls; five minutes keeps a busy day under 4k calls. */
  OVERVIEW: 300,
  /** One client's money on the finance page: 4 calls. */
  CLIENT: 60,
  /** The OAuth access token (Zoho issues 3600 s; we keep 60 s of slack). */
  TOKEN: 3540,
} as const;

export const ZOHO_REDIS_KEYS = {
  token: "zoho:books:token:v1",
  overview: "zoho:books:overview:v1",
  client: (zohoCustomerId: string) => `zoho:books:client:${zohoCustomerId}:v1`,
} as const;

/** Invoice statuses Zoho returns on the list, with the tone the pill takes. */
export const ZOHO_INVOICE_STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "info" },
  unpaid: { label: "Unpaid", tone: "warning" },
  partially_paid: { label: "Partly paid", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "neutral" },
  writeoff: { label: "Written off", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: "neutral" | "info" | "warning" | "danger" | "success" }>;
export type ZohoInvoiceStatus = keyof typeof ZOHO_INVOICE_STATUS;

export function zohoInvoiceStatus(status: string): { label: string; tone: "neutral" | "info" | "warning" | "danger" | "success" } {
  return (ZOHO_INVOICE_STATUS as Record<string, { label: string; tone: "neutral" | "info" | "warning" | "danger" | "success" }>)[status]
    ?? { label: status.replace(/_/g, " "), tone: "neutral" };
}

/** The Zoho Books web app, for "open in Zoho" links (no API call). */
export function zohoBooksWebUrl(orgId: string, kind: "invoices" | "customerpayments" | "contacts" | "creditnotes" | "bills", id: string): string {
  return `https://books.zoho.in/app/${orgId}#/${kind}/${id}`;
}
