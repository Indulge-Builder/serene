// zoho-api.ts — THE Zoho Books REST v3 client (server-only, READ ONLY). The only file that
// talks to Zoho. OAuth 2 refresh-token flow: the hour-long access token is kept in Redis
// (and a module memo) so a page open does not refresh it; a 401 refreshes once and retries.
// Every call runs against a ZbBudget: at most ZOHO_RUN_MAX_CALLS per read, and never below
// ZOHO_DAILY_RESERVE of the day's 10,000 (x-rate-limit-remaining), which the app server shares.
//
// Serene NEVER writes to Zoho. Never import this from a component; only zoho-service.ts calls it.

import "server-only";
import { redis } from "@/lib/redis";
import {
  ZOHO_ACCOUNTS_HOST_DEFAULT,
  ZOHO_API_DOMAIN_DEFAULT,
  ZOHO_BOOKS_API_PREFIX,
  ZOHO_CACHE_TTL,
  ZOHO_DAILY_RESERVE,
  ZOHO_PAGE_SIZE,
  ZOHO_REDIS_KEYS,
  ZOHO_RUN_MAX_CALLS,
} from "@/lib/constants/zoho";
import type {
  ZbAgingInterval,
  ZbBankAccount,
  ZbBill,
  ZbContact,
  ZbCreditNote,
  ZbInvoice,
  ZbInvoiceDashboard,
  ZbInvoiceDetail,
  ZbPageContext,
  ZbPayment,
  ZbReportNode,
} from "@/lib/types/zoho";

const LOG = "[zoho-api]";

// ─── Config ──────────────────────────────────────────────────────────────────

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}
export function zohoOrgId(): string {
  return env("ZOHO_ORGANIZATION_ID");
}
export function isZohoConfigured(): boolean {
  return Boolean(env("ZOHO_CLIENT_ID") && env("ZOHO_CLIENT_SECRET") && env("ZOHO_REFRESH_TOKEN") && zohoOrgId());
}

// ─── Errors + budget ─────────────────────────────────────────────────────────

export class ZbBudgetExhausted extends Error {
  constructor(message = "Zoho call budget exhausted for this read") {
    super(message);
    this.name = "ZbBudgetExhausted";
  }
}
export class ZbRequestError extends Error {
  constructor(public readonly status: number, public readonly path: string, message: string, public readonly zohoCode?: number) {
    super(message);
    this.name = "ZbRequestError";
  }
}

export type ZbBudget = { maxCalls: number; calls: number; dailyRemaining: number | null };

export function createZbBudget(maxCalls = ZOHO_RUN_MAX_CALLS): ZbBudget {
  return { maxCalls, calls: 0, dailyRemaining: null };
}
function assertRoom(b: ZbBudget): void {
  if (b.calls + 1 > b.maxCalls) throw new ZbBudgetExhausted();
  if (b.dailyRemaining != null && b.dailyRemaining - 1 < ZOHO_DAILY_RESERVE) {
    throw new ZbBudgetExhausted(`Zoho daily allowance nearly spent (${b.dailyRemaining} left, reserve ${ZOHO_DAILY_RESERVE})`);
  }
}

// ─── Token ───────────────────────────────────────────────────────────────────

type ZbToken = { access_token: string; api_domain: string; expires_at: number };
let memo: ZbToken | null = null;
/** One refresh at a time: a page fires a dozen reads at once and Zoho throttles token calls. */
let inflight: Promise<ZbToken> | null = null;

async function refreshToken(): Promise<ZbToken> {
  if (inflight) return inflight;
  inflight = refreshTokenNow().finally(() => { inflight = null; });
  return inflight;
}

async function refreshTokenNow(): Promise<ZbToken> {
  const host = env("ZOHO_ACCOUNTS_HOST") || ZOHO_ACCOUNTS_HOST_DEFAULT;
  const body = new URLSearchParams({
    refresh_token: env("ZOHO_REFRESH_TOKEN"),
    client_id: env("ZOHO_CLIENT_ID"),
    client_secret: env("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://${host}/oauth/v2/token`, { method: "POST", body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; api_domain?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new ZbRequestError(res.status, "/oauth/v2/token", `Zoho token refresh failed: ${json.error ?? res.statusText}`);
  }
  const token: ZbToken = {
    access_token: json.access_token,
    api_domain: (json.api_domain ?? ZOHO_API_DOMAIN_DEFAULT).replace(/\/+$/, ""),
    expires_at: Date.now() + Math.min(json.expires_in ?? 3600, ZOHO_CACHE_TTL.TOKEN) * 1000,
  };
  memo = token;
  try {
    await redis.setex(ZOHO_REDIS_KEYS.token, ZOHO_CACHE_TTL.TOKEN, token);
  } catch (e) {
    console.warn(`${LOG} token cache write failed`, e instanceof Error ? e.message : e);
  }
  return token;
}

async function getToken(force = false): Promise<ZbToken> {
  if (!force && memo && memo.expires_at - Date.now() > 60_000) return memo;
  if (!force) {
    try {
      const hit = await redis.get<ZbToken>(ZOHO_REDIS_KEYS.token);
      if (hit && hit.expires_at - Date.now() > 60_000) {
        memo = hit;
        return hit;
      }
    } catch (e) {
      console.warn(`${LOG} token cache read failed`, e instanceof Error ? e.message : e);
    }
  }
  return refreshToken();
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

type Params = Record<string, string | number | boolean | null | undefined>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One GET against Books v3. Returns the parsed JSON envelope (Zoho's `code` 0 = success). */
export async function zbGet<T extends { code?: number; message?: string }>(path: string, params: Params, budget: ZbBudget): Promise<T> {
  if (!isZohoConfigured()) throw new ZbRequestError(0, path, "Zoho Books is not configured (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN / ORGANIZATION_ID)");
  let token = await getToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    assertRoom(budget);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    qs.set("organization_id", zohoOrgId());
    const url = `${token.api_domain}${ZOHO_BOOKS_API_PREFIX}${path}?${qs.toString()}`;
    budget.calls += 1;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}`, Accept: "application/json" }, cache: "no-store" });
    const remaining = Number(res.headers.get("x-rate-limit-remaining"));
    if (Number.isFinite(remaining)) budget.dailyRemaining = Math.floor(remaining);

    if (res.status === 401 && attempt === 0) {
      token = await getToken(true);
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const json = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || !json || (typeof json.code === "number" && json.code !== 0)) {
      throw new ZbRequestError(res.status, path, `Zoho ${path} failed: ${json?.message ?? res.statusText}`, json?.code);
    }
    return json;
  }
  throw new ZbRequestError(429, path, "Zoho rate limited");
}

/** Page through a list endpoint (per_page 200) up to `maxPages`; says whether more remained. */
async function zbList<T>(path: string, key: string, params: Params, budget: ZbBudget, maxPages = 1): Promise<{ rows: T[]; more: boolean }> {
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await zbGet<{ code: number; page_context?: ZbPageContext } & Record<string, unknown>>(path, { ...params, page, per_page: ZOHO_PAGE_SIZE }, budget);
    rows.push(...((json[key] as T[] | undefined) ?? []));
    if (!json.page_context?.has_more_page) return { rows, more: false };
  }
  return { rows, more: true };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export type InvoiceListFilter = {
  customer_id?: string;
  status?: string;
  date_start?: string;
  date_end?: string;
  due_date_start?: string;
  due_date_end?: string;
  sort_column?: "date" | "due_date" | "total" | "balance" | "created_time";
  sort_order?: "A" | "D";
};

export function listInvoices(f: InvoiceListFilter, budget: ZbBudget, maxPages = 1) {
  return zbList<ZbInvoice>("/invoices", "invoices", f, budget, maxPages);
}
export async function getInvoice(invoiceId: string, budget: ZbBudget): Promise<ZbInvoiceDetail> {
  return (await zbGet<{ code: number; invoice: ZbInvoiceDetail }>(`/invoices/${invoiceId}`, {}, budget)).invoice;
}
export function listCustomerPayments(f: { customer_id?: string; date_start?: string; date_end?: string; sort_column?: "date" | "amount"; sort_order?: "A" | "D" }, budget: ZbBudget, maxPages = 1) {
  return zbList<ZbPayment>("/customerpayments", "customerpayments", f, budget, maxPages);
}
export function listCreditNotes(f: { customer_id?: string; status?: string }, budget: ZbBudget, maxPages = 1) {
  return zbList<ZbCreditNote>("/creditnotes", "creditnotes", f, budget, maxPages);
}
export function listBills(f: { status?: string; vendor_id?: string }, budget: ZbBudget, maxPages = 1) {
  return zbList<ZbBill>("/bills", "bills", f, budget, maxPages);
}
export async function listBankAccounts(budget: ZbBudget): Promise<ZbBankAccount[]> {
  return (await zbGet<{ code: number; bankaccounts: ZbBankAccount[] }>("/bankaccounts", {}, budget)).bankaccounts ?? [];
}
export async function getContact(contactId: string, budget: ZbBudget): Promise<ZbContact> {
  return (await zbGet<{ code: number; contact: ZbContact }>(`/contacts/${contactId}`, {}, budget)).contact;
}
export async function getInvoiceDashboard(budget: ZbBudget): Promise<ZbInvoiceDashboard> {
  const json = await zbGet<{ code: number; data: { dashboard_details: ZbInvoiceDashboard } }>("/invoices/dashboard", {}, budget);
  return json.data.dashboard_details;
}
export async function getArAgingSummary(asOf: string, budget: ZbBudget): Promise<{ total: number; intervals: ZbAgingInterval[] }> {
  const json = await zbGet<{ code: number; invoice: { total: number; intervals: ZbAgingInterval[] } }>("/reports/aragingsummary", { date: asOf }, budget);
  return { total: Number(json.invoice?.total ?? 0), intervals: json.invoice?.intervals ?? [] };
}
export async function getProfitAndLoss(fromDate: string, toDate: string, budget: ZbBudget): Promise<ZbReportNode[]> {
  const json = await zbGet<{ code: number; profit_and_loss: ZbReportNode[] }>("/reports/profitandloss", { from_date: fromDate, to_date: toDate }, budget);
  return json.profit_and_loss ?? [];
}

/** The organisation's name and currency (one call; cached by the service). */
export async function getOrganization(budget: ZbBudget): Promise<{ name: string; currency_code: string }> {
  const json = await zbGet<{ code: number; organization: { name: string; currency_code: string } }>(`/organizations/${zohoOrgId()}`, {}, budget);
  return { name: json.organization.name, currency_code: json.organization.currency_code };
}

/** Zoho's dashboard strings arrive as "26,17,885.15" (Indian grouping). */
export function zbAmount(s: string | number | null | undefined): number {
  if (typeof s === "number") return s;
  const n = Number(String(s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Find a report total by its label (case-insensitive contains), anywhere in the tree. */
export function reportTotal(nodes: ZbReportNode[], label: string): number | null {
  const want = label.toLowerCase();
  const walk = (list: ZbReportNode[]): number | null => {
    for (const n of list) {
      const l = (n.total_label ?? n.name ?? "").toLowerCase();
      if (l.includes(want) && typeof n.total === "number") return n.total;
      if (n.account_transactions) {
        const hit = walk(n.account_transactions);
        if (hit != null) return hit;
      }
    }
    return null;
  };
  return walk(nodes);
}
