// subscriptions-service.ts — read-only DB queries for the Subscriptions & Bills
// Tracker. Session client + RLS throughout (the SELECT policy scopes to
// admin/founder + finance/tech). Writes live in actions/subscriptions.ts (admin
// client). database.ts includes these tables (regen 2026-08-22); rows are narrowed
// once per query to the hand-declared union-typed rows in types/subscription.ts.
//
// No Redis — internal-scale data (dozens of subscriptions); freshness via
// revalidatePath('/subscriptions') on write.
import { createClient } from "@/lib/supabase/server";
import type { AppDomain } from "@/lib/types/database";
import type {
  SubscriptionType,
  SubscriptionStatus,
  SubscriptionCurrency,
} from "@/lib/constants/subscription-constants";
import type {
  SubscriptionRow,
  SubscriptionPaymentRow,
  SubscriptionTopupRow,
  SubscriptionListItem,
} from "@/lib/types/subscription";
import { computeSubscriptionStatus, istTodayISO } from "@/lib/utils/subscription-status";
import { toIst } from "@/lib/utils/ist";
import { mapRows } from "@/lib/utils/rows";

export type SubscriptionFilters = {
  archived?: boolean; // false (default) = active tab; true = archived tab
  departments?: AppDomain[];
  types?: SubscriptionType[];
  statuses?: SubscriptionStatus[]; // computed — filtered in JS
  search?: string;
};

/**
 * The subscription list for the tracker table. Fetches subscriptions (dept/type/
 * archived filtered in SQL), then batch-fetches their payments + top-ups to compute
 * each row's status + latest-INR-paid. The status filter is applied in JS because
 * status is computed, not stored.
 */
export async function getSubscriptions(
  filters: SubscriptionFilters = {},
): Promise<SubscriptionListItem[]> {
  const supabase = await createClient();
  const archived = filters.archived ?? false;

  let query = supabase
    .from("subscriptions")
    .select("*, tool:subscription_tools(name)")
    .eq("is_archived", archived)
    .order("created_at", { ascending: false });

  if (filters.departments && filters.departments.length > 0) {
    query = query.overlaps("departments", filters.departments);
  }
  if (filters.types && filters.types.length > 0) {
    query = query.in("type", filters.types);
  }
  if (filters.search && filters.search.trim()) {
    // Match the TOOL name as well as the subscription's own name. One tool holds
    // several subscriptions (the Claude case: 3 accounts, 2 tech + 1 concierge),
    // and people search for the tool — "wifi" has to find the row whose name is
    // an account label. A PostgREST `.or()` cannot reach through an embed, so
    // the matching tool ids are resolved first and OR-ed in by id.
    const term = filters.search.trim();
    // `,` and `)` would break the .or() filter string; `%`/`*` are wildcards.
    const safe = term.replace(/[,()*%]/g, " ").trim();
    if (safe) {
      const { data: toolRows } = await supabase
        .from("subscription_tools")
        .select("id")
        .ilike("name", `%${safe}%`);
      const toolIds = ((toolRows as { id: string }[] | null) ?? []).map((t) => t.id);
      query = toolIds.length
        ? query.or(`name.ilike.%${safe}%,tool_id.in.(${toolIds.join(",")})`)
        : query.ilike("name", `%${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error("[subscriptions-service] getSubscriptions error:", error);
    return [];
  }
  const subs = data as unknown as (SubscriptionRow & { tool: { name: string } | null })[];
  if (subs.length === 0) return [];

  const ids = subs.map((s) => s.id);
  const [paymentsRes, topupsRes] = await Promise.all([
    supabase.from("subscription_payments").select("*").in("subscription_id", ids),
    supabase.from("subscription_topups").select("*").in("subscription_id", ids),
  ]);
  const payments = (paymentsRes.data ?? []) as unknown as SubscriptionPaymentRow[];
  const topups = (topupsRes.data ?? []) as unknown as SubscriptionTopupRow[];

  const paymentsBySub = groupBy(payments, (p) => p.subscription_id);
  const topupsBySub = groupBy(topups, (t) => t.subscription_id);

  const now = new Date();
  let items: SubscriptionListItem[] = subs.map((sub) => {
    const subPayments = paymentsBySub.get(sub.id) ?? [];
    const subTopups = topupsBySub.get(sub.id) ?? [];
    const computed = computeSubscriptionStatus(sub, subPayments, now);

    // Cycles already settled by a payment — keyed the same way isCyclePaid matches
    // (year-month for monthly/other, year for yearly). Powers the Calendar view's
    // per-month status; [] for top_up (no due cycle).
    const paidCycleKeys =
      sub.type === "top_up"
        ? []
        : Array.from(
            new Set(
              subPayments.map((p) =>
                sub.type === "yearly" ? p.due_date.slice(0, 4) : p.due_date.slice(0, 7),
              ),
            ),
          );

    let latestPaidInr: number | null = null;
    let latestPaidAt: string | null = null;
    if (sub.type === "top_up") {
      const latest = maxBy(subTopups, (t) => t.topped_up_at);
      if (latest) {
        latestPaidInr = Number(latest.paid_amount_inr);
        latestPaidAt = latest.topped_up_at;
      }
    } else {
      const latest = maxBy(subPayments, (p) => p.paid_at);
      if (latest) {
        latestPaidInr = Number(latest.paid_amount_inr);
        latestPaidAt = latest.paid_at;
      }
    }

    const { tool, ...subRow } = sub;
    return {
      ...subRow,
      toolName: tool?.name ?? null,
      password: null, // encrypted at rest (0166) — never exposed in list payloads
      status: computed.status,
      daysOverdue: computed.daysOverdue,
      currentDueDate: computed.currentDueDate,
      latestPaidInr,
      latestPaidAt,
      paidCycleKeys,
    };
  });

  if (filters.statuses && filters.statuses.length > 0) {
    const wanted = new Set(filters.statuses);
    items = items.filter((it) => it.status != null && wanted.has(it.status));
  }

  return items;
}

/**
 * One subscription + its full payment + top-up history (newest first). The password
 * is NEVER returned here (encrypted at rest, 0166) — `hasPassword` tells the UI
 * whether to offer a reveal; the plaintext comes only from revealSubscriptionPasswordAction.
 */
export type PasswordReveal = {
  revealed_at: string;
  revealed_by_name: string | null;
};

/**
 * Who has looked at this subscription's password.
 *
 * The ledger has been written since migration 0167 — every reveal inserts a row
 * BEFORE the plaintext leaves the server, and fails closed. It had no reader,
 * which makes an audit trail only half an audit: nobody could see it without
 * opening the database. This is that reader.
 *
 * Session client on purpose: the 0167 RLS is admin/founder SELECT only, so a
 * manager who can use the tracker still cannot see who read a credential.
 * Append-only — there is no writer here and never should be.
 */
export async function getPasswordReveals(subscriptionId: string): Promise<PasswordReveal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_password_reveals")
    .select("revealed_at, profile:profiles!subscription_password_reveals_revealed_by_fkey(full_name)")
    .eq("subscription_id", subscriptionId)
    .order("revealed_at", { ascending: false })
    .limit(20);
  if (error) {
    // Not fatal: a manager reading the tracker is DENIED this by RLS, and the
    // credential panel must still render for them.
    return [];
  }
  return mapRows<
    { revealed_at: string; profile: { full_name: string | null } | null },
    PasswordReveal
  >(data, (r) => ({ revealed_at: r.revealed_at, revealed_by_name: r.profile?.full_name ?? null }));
}

export async function getSubscriptionDetail(id: string): Promise<{
  subscription: SubscriptionRow;
  toolName: string | null;
  hasPassword: boolean;
  payments: SubscriptionPaymentRow[];
  topups: SubscriptionTopupRow[];
  /** Who has revealed this password (admin/founder only — [] for everyone else). */
  reveals: PasswordReveal[];
} | null> {
  const supabase = await createClient();
  const [subRes, paymentsRes, topupsRes] = await Promise.all([
    supabase.from("subscriptions").select("*, tool:subscription_tools(name)").eq("id", id).maybeSingle(),
    supabase
      .from("subscription_payments")
      .select("*")
      .eq("subscription_id", id)
      .order("due_date", { ascending: false }),
    supabase
      .from("subscription_topups")
      .select("*")
      .eq("subscription_id", id)
      .order("topped_up_at", { ascending: false }),
  ]);
  if (subRes.error || !subRes.data) return null;
  const { tool: rawTool, ...raw } = subRes.data as unknown as SubscriptionRow & {
    tool: { name: string } | null;
  };
  return {
    subscription: { ...raw, password: null },
    toolName: rawTool?.name ?? null,
    hasPassword: raw.password != null,
    payments: (paymentsRes.data ?? []) as unknown as SubscriptionPaymentRow[],
    topups: (topupsRes.data ?? []) as unknown as SubscriptionTopupRow[],
    reveals: await getPasswordReveals(id),
  };
}

// ── Spending Overview ─────────────────────────────────────────────────────────
export type SpendingOverviewFilters = {
  /** Restrict to these departments — amounts count only the attributable share
   *  (a [tech, concierge] bill filtered to tech contributes half). */
  departments?: AppDomain[];
  /** 'YYYY-MM-DD' inclusive. Either side may be open. When set, the tiles gain a
   *  range total and the breakdowns cover the range instead of year-to-date. */
  from?: string | null;
  to?: string | null;
};

export type SpendingOverview = {
  monthToDateInr: number;
  yearToDateInr: number;
  rangeInr: number | null;   // total inside the explicit from/to range; null when no range set
  rangeCount: number | null; // payments + top-ups inside the range; null when no range set
  activeCount: number;
  byType: { type: SubscriptionType; inr: number }[];
  byDepartment: { domain: AppDomain; inr: number }[];
  /** Per-tool ranking. Untooled subscriptions rank under their own name, so the
   *  list always covers 100% of spend. */
  byTool: { tool: string; inr: number }[];
  monthlyTrend: { month: string; label: string; inr: number }[]; // last 12 IST months
};

/**
 * INR outflow analytics (spending is always the manually-entered INR — never a
 * currency conversion). Department spend is split equally across a subscription's
 * departments; a department filter counts only that attributable share, so
 * "how much did tech spend" means tech's share of shared bills. Breakdowns cover
 * the selected from/to range when one is set, year-to-date otherwise. The trend
 * is always the trailing 12 IST months (department-filtered, range-independent).
 */
export async function getSpendingOverview(
  filters: SpendingOverviewFilters = {},
): Promise<SpendingOverview> {
  const supabase = await createClient();
  const [subsRes, paymentsRes, topupsRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, name, type, departments, is_archived, tool:subscription_tools(name)"),
    supabase.from("subscription_payments").select("subscription_id, paid_at, paid_amount_inr").limit(10000),
    supabase.from("subscription_topups").select("subscription_id, topped_up_at, paid_amount_inr").limit(10000),
  ]);

  const subs = (subsRes.data ?? []) as unknown as (Pick<
    SubscriptionRow,
    "id" | "name" | "type" | "departments" | "is_archived"
  > & { tool: { name: string } | null })[];
  const payments = (paymentsRes.data ?? []) as unknown as {
    subscription_id: string;
    paid_at: string;
    paid_amount_inr: number;
  }[];
  const topups = (topupsRes.data ?? []) as unknown as {
    subscription_id: string;
    topped_up_at: string;
    paid_amount_inr: number;
  }[];

  const deptFilter = filters.departments && filters.departments.length > 0
    ? new Set<AppDomain>(filters.departments)
    : null;
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const hasRange = from != null || to != null;
  const inRange = (dateISO: string) =>
    (from == null || dateISO >= from) && (to == null || dateISO <= to);

  const subMap = new Map(subs.map((s) => [s.id, s]));
  const now = new Date();
  const todayISO = istTodayISO(now);
  const curMonth = todayISO.slice(0, 7);
  const curYear = todayISO.slice(0, 4);

  const outflows = [
    ...payments.map((p) => ({ subId: p.subscription_id, dateISO: p.paid_at, inr: Number(p.paid_amount_inr) })),
    ...topups.map((t) => ({ subId: t.subscription_id, dateISO: t.topped_up_at, inr: Number(t.paid_amount_inr) })),
  ];

  let monthToDateInr = 0;
  let yearToDateInr = 0;
  let rangeInr = 0;
  let rangeCount = 0;
  const byTypeMap = new Map<SubscriptionType, number>();
  const byDeptMap = new Map<AppDomain, number>();
  const byToolMap = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const trendMonths = lastTwelveMonths(now);
  for (const m of trendMonths) byMonth.set(m, 0);

  for (const o of outflows) {
    if (!Number.isFinite(o.inr)) continue;
    const sub = subMap.get(o.subId);
    if (!sub) continue;
    const depts = sub.departments ?? [];

    // The amount attributable to the selected departments (equal split).
    let scoped = o.inr;
    if (deptFilter) {
      const matched = depts.filter((d) => deptFilter.has(d)).length;
      if (matched === 0 || depts.length === 0) continue;
      scoped = (o.inr / depts.length) * matched;
    }

    const month = o.dateISO.slice(0, 7);
    const year = o.dateISO.slice(0, 4);
    if (month === curMonth) monthToDateInr += scoped;
    if (year === curYear) yearToDateInr += scoped;
    if (byMonth.has(month)) byMonth.set(month, (byMonth.get(month) ?? 0) + scoped);
    if (hasRange && inRange(o.dateISO)) {
      rangeInr += scoped;
      rangeCount += 1;
    }

    // Breakdowns cover the range when set, year-to-date otherwise.
    const inScope = hasRange ? inRange(o.dateISO) : year === curYear;
    if (!inScope) continue;
    byTypeMap.set(sub.type, (byTypeMap.get(sub.type) ?? 0) + scoped);
    const toolKey = sub.tool?.name ?? sub.name;
    byToolMap.set(toolKey, (byToolMap.get(toolKey) ?? 0) + scoped);
    if (depts.length > 0) {
      const share = o.inr / depts.length;
      for (const d of depts) {
        if (deptFilter && !deptFilter.has(d)) continue;
        byDeptMap.set(d, (byDeptMap.get(d) ?? 0) + share);
      }
    }
  }

  const activeSubs = subs.filter((s) => !s.is_archived);
  const activeCount = deptFilter
    ? activeSubs.filter((s) => (s.departments ?? []).some((d) => deptFilter.has(d))).length
    : activeSubs.length;

  return {
    monthToDateInr: Math.round(monthToDateInr),
    yearToDateInr: Math.round(yearToDateInr),
    rangeInr: hasRange ? Math.round(rangeInr) : null,
    rangeCount: hasRange ? rangeCount : null,
    activeCount,
    byType: [...byTypeMap.entries()]
      .map(([type, inr]) => ({ type, inr: Math.round(inr) }))
      .sort((a, b) => b.inr - a.inr),
    byDepartment: [...byDeptMap.entries()]
      .map(([domain, inr]) => ({ domain, inr: Math.round(inr) }))
      .sort((a, b) => b.inr - a.inr),
    byTool: [...byToolMap.entries()]
      .map(([tool, inr]) => ({ tool, inr: Math.round(inr) }))
      .sort((a, b) => b.inr - a.inr),
    monthlyTrend: trendMonths.map((m) => ({
      month: m,
      label: monthLabel(m),
      inr: Math.round(byMonth.get(m) ?? 0),
    })),
  };
}

// ── Monthly report (export data) ──────────────────────────────────────────────
export type MonthlyReportRow = {
  name: string;
  departments: AppDomain[];
  type: SubscriptionType;
  currency: SubscriptionCurrency;
  originalAmount: number; // payment.rate or topup.amount
  inrPaid: number;
  dueDate: string | null; // payment cycle date; null for a top-up
  paidDate: string; // paid_at or topped_up_at
};

/**
 * Every payment + top-up whose paid/top-up date falls in the given IST month
 * ('YYYY-MM'), joined to its subscription's name/departments/type/currency — the
 * flat rows the client turns into CSV/XLSX (buildCSV/buildXLSXWorkbook).
 */
export async function getSubscriptionMonthlyReport(month: string): Promise<MonthlyReportRow[]> {
  const supabase = await createClient();
  const { start, endExclusive } = monthBounds(month);

  const [subsRes, paymentsRes, topupsRes] = await Promise.all([
    supabase.from("subscriptions").select("id, name, departments, type, currency"),
    supabase
      .from("subscription_payments")
      .select("subscription_id, due_date, paid_at, rate, paid_amount_inr")
      .gte("paid_at", start)
      .lt("paid_at", endExclusive),
    supabase
      .from("subscription_topups")
      .select("subscription_id, topped_up_at, amount, paid_amount_inr")
      .gte("topped_up_at", start)
      .lt("topped_up_at", endExclusive),
  ]);

  const subMap = new Map(
    ((subsRes.data ?? []) as unknown as Pick<
      SubscriptionRow,
      "id" | "name" | "departments" | "type" | "currency"
    >[]).map((s) => [s.id, s]),
  );

  const payments = (paymentsRes.data ?? []) as unknown as {
    subscription_id: string;
    due_date: string;
    paid_at: string;
    rate: number;
    paid_amount_inr: number;
  }[];
  const topups = (topupsRes.data ?? []) as unknown as {
    subscription_id: string;
    topped_up_at: string;
    amount: number;
    paid_amount_inr: number;
  }[];

  const rows: MonthlyReportRow[] = [];
  for (const p of payments) {
    const sub = subMap.get(p.subscription_id);
    if (!sub) continue;
    rows.push({
      name: sub.name,
      departments: sub.departments,
      type: sub.type,
      currency: sub.currency,
      originalAmount: Number(p.rate),
      inrPaid: Number(p.paid_amount_inr),
      dueDate: p.due_date,
      paidDate: p.paid_at,
    });
  }
  for (const t of topups) {
    const sub = subMap.get(t.subscription_id);
    if (!sub) continue;
    rows.push({
      name: sub.name,
      departments: sub.departments,
      type: sub.type,
      currency: sub.currency,
      originalAmount: Number(t.amount),
      inrPaid: Number(t.paid_amount_inr),
      dueDate: null,
      paidDate: t.topped_up_at,
    });
  }
  rows.sort((a, b) => (a.paidDate < b.paidDate ? -1 : a.paidDate > b.paidDate ? 1 : 0));
  return rows;
}

// ── local helpers ─────────────────────────────────────────────────────────────
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function maxBy<T>(items: T[], keyFn: (item: T) => string): T | null {
  let best: T | null = null;
  let bestKey = "";
  for (const item of items) {
    const key = keyFn(item);
    if (best === null || key > bestKey) {
      best = item;
      bestKey = key;
    }
  }
  return best;
}

/** The trailing 12 IST months as 'YYYY-MM', oldest → newest (inclusive of now). */
function lastTwelveMonths(now: Date): string[] {
  const { year, month } = toIst(now); // month 0-indexed
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`;
}

/** { start: 'YYYY-MM-01', endExclusive: first day of next month } for a 'YYYY-MM'. */
function monthBounds(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number); // m = 1..12
  const start = `${month}-01`;
  const next = new Date(Date.UTC(y, m, 1)); // m (0-idx) = next month
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, endExclusive };
}
