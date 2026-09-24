// zoho-service.ts — ALL Zoho Books reads the pages use (server-only). Two shapes:
//   getBooksOverview()   — the organisation-wide money picture for /books (admin/founder),
//                          ~14 API calls, served from Redis for five minutes; Refresh busts it.
//   getMemberFinance(id) — one member's ledger for /members/[id]/finance, keyed by the Zoho
//                          customer id on the spine; 4 calls, cached a minute.
// Zoho is the ledger and stays so: nothing here is written back, nothing is copied into
// Postgres (member-ticket-plan.md: never cached balances beyond a short TTL).

import "server-only";
import { withRedisCache } from "@/lib/services/cache-helpers";
import { redis } from "@/lib/redis";
import { getISTMonthStart, toIst, istToUtc } from "@/lib/utils/ist";
import { ZOHO_CACHE_TTL, ZOHO_REDIS_KEYS, ZOHO_UNCATEGORISED_MAX_ACCOUNTS } from "@/lib/constants/zoho";
import {
  createZbBudget,
  getArAgingSummary,
  getContact,
  getInvoiceDashboard,
  getOrganization,
  getProfitAndLoss,
  isZohoConfigured,
  listBankAccounts,
  listBills,
  listCreditNotes,
  listCustomerPayments,
  listInvoices,
  reportTotal,
  zbAmount, listUncategorisedBankTransactions } from "@/lib/services/zoho-api";
import type { BooksOverview, MemberFinance, ZbBankAccount, ZbContact } from "@/lib/types/zoho";

const LOG = "[zoho-service]";

/** yyyy-mm-dd in IST, the calendar Zoho's org runs on (Asia/Calcutta). */
function istDate(d: Date): string {
  const { year, month, day } = toIst(d);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The financial year starts 1 April (organisation setting). */
function fyStart(now: Date): Date {
  const { year, month } = toIst(now);
  return istToUtc(month >= 3 ? year : year - 1, 3, 1, 0, 0);
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export { isZohoConfigured };

// ─── The organisation ────────────────────────────────────────────────────────

async function fetchBooksOverview(): Promise<BooksOverview> {
  const budget = createZbBudget();
  const now = new Date();
  const today = istDate(now);
  const monthFrom = istDate(getISTMonthStart(now));
  const fyFrom = istDate(fyStart(now));

  const [org, dashboard, aging, banks, bills, overdueBills, monthPayments, overdueInvoices, recentInvoices, recentPayments, plMonth, plFy] = await Promise.all([
    getOrganization(budget),
    getInvoiceDashboard(budget),
    getArAgingSummary(today, budget),
    listBankAccounts(budget),
    listBills({ status: "open" }, budget, 1),
    listBills({ status: "overdue" }, budget, 1),
    listCustomerPayments({ date_start: monthFrom, date_end: today, sort_column: "date", sort_order: "D" }, budget, 5),
    listInvoices({ status: "overdue", sort_column: "due_date", sort_order: "A" }, budget, 1),
    listInvoices({ sort_column: "date", sort_order: "D" }, budget, 1),
    listCustomerPayments({ sort_column: "date", sort_order: "D" }, budget, 1),
    getProfitAndLoss(monthFrom, today, budget),
    getProfitAndLoss(fyFrom, today, budget),
  ]);

  const active = banks.filter((a) => a.is_active);
  const byType = (t: string) => sum(active.filter((a) => a.account_type === t).map((a) => a.balance));

  // The Banking queue (2026-09-24): the founder asked twice for "unrecorded transactions" and the
  // overview could only show payments not applied to invoices. One call per active bank or card
  // account (capped so the read stays inside the run budget); a failure leaves the section null.
  const feedAccounts = active.filter((a) => a.account_type === "bank" || a.account_type === "credit_card").slice(0, ZOHO_UNCATEGORISED_MAX_ACCOUNTS);
  let uncategorised: BooksOverview["uncategorised"] = null;
  try {
    const perAccount = await Promise.all(
      feedAccounts.map(async (a) => {
        const { rows } = await listUncategorisedBankTransactions(a.account_id, budget);
        const inflow = sum(rows.filter((t) => t.debit_or_credit === "credit").map((t) => t.amount));
        const outflow = sum(rows.filter((t) => t.debit_or_credit === "debit").map((t) => t.amount));
        return { account: a.account_name, count: rows.length, inflow, outflow };
      }),
    );
    uncategorised = {
      count: sum(perAccount.map((x) => x.count)),
      inflow: sum(perAccount.map((x) => x.inflow)),
      outflow: sum(perAccount.map((x) => x.outflow)),
      byAccount: perAccount.filter((x) => x.count > 0),
    };
  } catch (e) {
    console.warn("[zoho-service] uncategorised feed unavailable:", e instanceof Error ? e.message : e);
  }

  return {
    org: { name: org.name, currency: org.currency_code },
    receivables: {
      totalDue: zbAmount(dashboard.total_due),
      overdue: zbAmount(dashboard.overdue),
      dueToday: zbAmount(dashboard.due_today),
      dueWithin30: zbAmount(dashboard.due_within_30_days),
      averageDaysToPay: dashboard.average_days_for_full_pay ? zbAmount(dashboard.average_days_for_full_pay) : null,
      aging: aging.intervals,
    },
    payables: {
      open: sum(bills.rows.map((b) => b.balance)),
      openCount: bills.rows.length,
      overdue: sum(overdueBills.rows.map((b) => b.balance)),
      more: bills.more,
    },
    cash: { banks: byType("bank"), cards: byType("credit_card"), clearing: byType("payment_clearing"), accounts: active },
    uncategorised,
    thisMonth: {
      invoiced: reportTotal(plMonth, "Total Operating Income") ?? 0,
      received: sum(monthPayments.rows.map((p) => p.amount)),
      expenses: reportTotal(plMonth, "Total Operating Expense") ?? 0,
      from: monthFrom,
    },
    fyToDate: {
      income: reportTotal(plFy, "Total Operating Income") ?? 0,
      expenses: reportTotal(plFy, "Total Operating Expense") ?? 0,
      netProfit: reportTotal(plFy, "Net Profit") ?? 0,
      from: fyFrom,
    },
    overdueInvoices: overdueInvoices.rows.slice(0, 50),
    recentInvoices: recentInvoices.rows.slice(0, 25),
    recentPayments: recentPayments.rows.slice(0, 25),
    fetchedAt: now.toISOString(),
    apiCalls: budget.calls,
    dailyRemaining: budget.dailyRemaining,
  };
}

/** The /books page read. Null when Zoho is not configured; throws on a Zoho failure. */
export async function getBooksOverview(): Promise<BooksOverview | null> {
  if (!isZohoConfigured()) return null;
  return withRedisCache(ZOHO_REDIS_KEYS.overview, ZOHO_CACHE_TTL.OVERVIEW, fetchBooksOverview);
}

/** Refresh now: drop the cached overview so the next read asks Zoho again. */
export async function invalidateBooksOverview(): Promise<void> {
  try {
    await redis.del(ZOHO_REDIS_KEYS.overview);
  } catch (e) {
    console.warn(`${LOG} overview cache del failed`, e instanceof Error ? e.message : e);
  }
}

// ─── One member ──────────────────────────────────────────────────────────────

async function fetchMemberFinance(zohoCustomerId: string): Promise<MemberFinance> {
  const budget = createZbBudget(8);
  const [contactRes, invoices, payments, creditNotes] = await Promise.all([
    getContact(zohoCustomerId, budget).catch((e) => { console.warn(`${LOG} contact read failed`, e instanceof Error ? e.message : e); return null as ZbContact | null; }),
    listInvoices({ customer_id: zohoCustomerId, sort_column: "date", sort_order: "D" }, budget, 1),
    listCustomerPayments({ customer_id: zohoCustomerId, sort_column: "date", sort_order: "D" }, budget, 1),
    listCreditNotes({ customer_id: zohoCustomerId }, budget, 1),
  ]);
  const live = invoices.rows.filter((i) => i.status !== "void" && i.status !== "draft");
  return {
    contact: contactRes,
    invoices: invoices.rows,
    payments: payments.rows,
    creditNotes: creditNotes.rows,
    totals: {
      invoiced: sum(live.map((i) => i.total)),
      paid: sum(payments.rows.map((p) => p.amount)),
      outstanding: contactRes ? contactRes.outstanding_receivable_amount : sum(live.map((i) => i.balance)),
      credits: contactRes ? contactRes.unused_credits_receivable_amount : sum(creditNotes.rows.map((c) => c.balance)),
      invoiceCount: live.length,
    },
    fetchedAt: new Date().toISOString(),
    apiCalls: budget.calls,
  };
}

/** The finance page's live read for one member. Null when Zoho is not configured. */
export async function getMemberFinance(zohoCustomerId: string): Promise<MemberFinance | null> {
  if (!isZohoConfigured()) return null;
  return withRedisCache(ZOHO_REDIS_KEYS.member(zohoCustomerId), ZOHO_CACHE_TTL.CLIENT, () => fetchMemberFinance(zohoCustomerId));
}

export async function invalidateMemberFinance(zohoCustomerId: string): Promise<void> {
  try {
    await redis.del(ZOHO_REDIS_KEYS.member(zohoCustomerId));
  } catch (e) {
    console.warn(`${LOG} member cache del failed`, e instanceof Error ? e.message : e);
  }
}

export type { ZbBankAccount };
