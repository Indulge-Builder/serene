// Budget page queries — single responsibility (ad spend ↔ leads ↔ deals).
// Never add spend queries to leads-service.ts or performance-service.ts.
//
// NO Redis namespace — budget reads are always live, like the campaign RPCs
// (see docs/architecture/caching.md §2). Do not add cache-aside here.

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { resolveDomainFromCampaign } from "@/lib/constants/campaign-domain-map";
import {
  AD_ACCOUNTS,
  resolveAccountFromCampaign,
  accountLabel,
  UNATTRIBUTED_ACCOUNT_KEY,
  type AccountKeyOrUnattributed,
} from "@/lib/constants/ad-accounts";

export type BudgetCampaignRow = {
  campaignKey:     string;
  totalSpend:      number;
  totalResults:    number | null;
  totalImpressions: number | null;
  totalReach:      number | null;
  totalLinkClicks: number | null;
  leadCount:       number;
  dealCount:       number;
  dealRevenue:     number;
  /** null when leadCount === 0 — render "—", never ₹0 */
  costPerLead:     number | null;
  /** null when dealCount === 0 — render "—", never ₹0 */
  costPerDeal:     number | null;
};

/**
 * One row per campaign with spend in the period, joined to lead counts
 * (created_at cohort) and deals (won_at) on the normalised campaign key.
 *
 * get_budget_summary has EXECUTE revoked from `authenticated` (scope-param
 * tier, Q-13) — admin client only; the /budget page role gate (manager+) is
 * the trust boundary.
 */
export async function getBudgetSummary(
  dateFrom: string,
  dateTo: string,
): Promise<BudgetCampaignRow[]> {
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_budget_summary", {
    p_date_from: dateFrom,
    p_date_to:   dateTo,
  });

  if (error || !data) {
    if (error) {
      console.error("[ad-spend-service] get_budget_summary failed:", error);
    }
    return [];
  }

  type BudgetRpcRow = {
    campaign_key:      string;
    total_spend:       number | string | null;
    total_results:     number | string | null;
    total_impressions: number | string | null;
    total_reach:       number | string | null;
    total_link_clicks: number | string | null;
    lead_count:        number | string | null;
    deal_count:        number | string | null;
    deal_revenue:      number | string | null;
  };

  return mapRows<BudgetRpcRow, BudgetCampaignRow>(data, (row) => {
    const spend = Number(row.total_spend ?? 0);
    const leads = Number(row.lead_count ?? 0);
    const deals = Number(row.deal_count ?? 0);
    return {
      campaignKey:      row.campaign_key,
      totalSpend:       spend,
      totalResults:     row.total_results     == null ? null : Number(row.total_results),
      totalImpressions: row.total_impressions == null ? null : Number(row.total_impressions),
      totalReach:       row.total_reach       == null ? null : Number(row.total_reach),
      totalLinkClicks:  row.total_link_clicks == null ? null : Number(row.total_link_clicks),
      leadCount:        leads,
      dealCount:        deals,
      dealRevenue:      Number(row.deal_revenue ?? 0),
      costPerLead:      leads > 0 ? spend / leads : null,
      costPerDeal:      deals > 0 ? spend / deals : null,
    };
  });
}

/**
 * Scope budget rows to one domain via the campaign-prefix → domain map
 * (ad_spend_daily has no domain column — domain is derived from the campaign
 * key exactly like lead ingestion does). Used by the manager dashboard budget
 * widget; the /budget page itself stays admin/founder (all domains).
 */
export function filterBudgetRowsByDomain(
  rows: BudgetCampaignRow[],
  domain: string,
): BudgetCampaignRow[] {
  return rows.filter((r) => resolveDomainFromCampaign(r.campaignKey) === domain);
}

/**
 * Existing (campaign_key, spend_date) pairs for the upload's key set + date
 * window — lets the upload action report inserted vs updated counts.
 */
export async function getExistingSpendKeys(
  campaignKeys: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Set<string>> {
  if (campaignKeys.length === 0) return new Set();
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("ad_spend_daily")
    .select("campaign_key, spend_date")
    .eq("source", "meta_csv")
    .in("campaign_key", campaignKeys)
    .gte("spend_date", dateFrom)
    .lte("spend_date", dateTo);

  if (error || !data) return new Set();

  return new Set(
    (data as { campaign_key: string; spend_date: string }[]).map(
      (r) => `${r.campaign_key}::${r.spend_date}`,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Per-account recharge ledger + the /budget per-account report.
//
// Recharges live in ad_account_recharges (a finance ledger, separate from
// ad_spend_daily). Account on the SPEND side is DERIVED from the campaign key
// via resolveAccountFromCampaign — never stored on spend. Balance = recharged −
// spent, INR-ONLY (never subtract a non-INR recharge from INR spend).
//
// No Redis, admin client — same posture as the rest of this file.
// ─────────────────────────────────────────────────────────────────────────

export type AccountRecharge = {
  id:          string;
  adAccount:   string;
  platform:    string;
  amount:      number;
  currency:    string;
  rechargedAt: string;   // YYYY-MM-DD
  method:      string | null;
  note:        string | null;
  doneBy:      string;
  doneByName:  string | null;
};

/**
 * All recharges with recharged_at inside the period, newest first, with the
 * recharger's name joined for the history table. Admin client (manager+ read
 * gate is the /budget page).
 */
export async function getAccountRecharges(
  dateFrom: string,
  dateTo: string,
): Promise<AccountRecharge[]> {
  const supabase = createAdminClient();

  // The page resolves from/to as ISO timestamps (IST-anchored); recharged_at is
  // a calendar date — compare against the date portion of each bound so the
  // window matches the day the recharge is dated to.
  const fromDate = dateFrom.slice(0, 10);
  const toDate   = dateTo.slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("ad_account_recharges")
    // Explicit FK-constraint embed (the leads/deals service convention) — the
    // bare `profiles:done_by(...)` shorthand can be ambiguous to PostgREST.
    .select(
      "id, ad_account, platform, amount, currency, recharged_at, method, note, done_by, profiles:profiles!ad_account_recharges_done_by_fkey(full_name)",
    )
    .gte("recharged_at", fromDate)
    .lte("recharged_at", toDate)
    .order("recharged_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("[ad-spend-service] getAccountRecharges failed:", error);
    return [];
  }

  type RechargeRow = {
    id:           string;
    ad_account:   string;
    platform:     string | null;
    amount:       number | string | null;
    currency:     string | null;
    recharged_at: string;
    method:       string | null;
    note:         string | null;
    done_by:      string;
    profiles:     { full_name: string | null } | null;
  };

  return mapRows<RechargeRow, AccountRecharge>(data, (row) => ({
    id:          row.id,
    adAccount:   row.ad_account,
    platform:    row.platform ?? "meta",
    amount:      Number(row.amount ?? 0),
    currency:    row.currency ?? "INR",
    rechargedAt: row.recharged_at,
    method:      row.method,
    note:        row.note,
    doneBy:      row.done_by,
    doneByName:  row.profiles?.full_name ?? null,
  }));
}

export type AccountReportBlock = {
  key:          AccountKeyOrUnattributed;
  label:        string;
  /** INR recharged into this account in the period. */
  recharged:    number;
  /** INR spend attributed to this account's campaigns in the period. */
  spent:        number;
  /** recharged − spent (INR only). Can be negative (overspent). */
  balance:      number;
  /** The campaign rows that attributed to this account (for the expander). */
  campaigns:    BudgetCampaignRow[];
  /** Non-INR recharges into this account — recorded, excluded from `balance`. */
  nonInr:       { currency: string; total: number }[];
};

export type AccountReport = {
  blocks:           AccountReportBlock[];
  /** Grand-total INR Meta spend across all accounts (incl. Unattributed). */
  grandTotalSpend:  number;
  /** Grand-total INR recharged across all accounts. */
  grandTotalRecharged: number;
  /** True when any non-INR recharge exists in the period (drives the footnote). */
  hasNonInr:        boolean;
};

/**
 * Build the /budget per-account report from already-fetched budget rows +
 * recharges. Pure (no IO) so it is trivially testable and the caller controls
 * the two queries.
 *
 * - Spend is grouped by resolveAccountFromCampaign over the campaign rows; an
 *   unresolved campaign lands in the visible "Unattributed" block, never merged
 *   into a real account.
 * - Balance arithmetic is INR-ONLY. Non-INR recharges are summed per currency
 *   into `nonInr` for display and EXCLUDED from `recharged`/`balance`.
 * - Every live account in AD_ACCOUNTS gets a block even with zero activity, so
 *   the report is a stable 3-up grid; "Unattributed" appears only when it has
 *   spend or a (mis-keyed) recharge.
 */
export function buildAccountReport(
  campaignRows: BudgetCampaignRow[],
  recharges: AccountRecharge[],
): AccountReport {
  type Bucket = {
    spent:     number;
    recharged: number;
    campaigns: BudgetCampaignRow[];
    nonInr:    Map<string, number>;
  };
  const buckets = new Map<AccountKeyOrUnattributed, Bucket>();
  const bucket = (key: AccountKeyOrUnattributed): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { spent: 0, recharged: 0, campaigns: [], nonInr: new Map() };
      buckets.set(key, b);
    }
    return b;
  };

  // Seed the three live accounts so they always render (stable grid).
  for (const a of AD_ACCOUNTS) bucket(a.key);

  // Spend → account by campaign key.
  for (const row of campaignRows) {
    const key = resolveAccountFromCampaign(row.campaignKey);
    const b = bucket(key);
    b.spent += row.totalSpend;
    b.campaigns.push(row);
  }

  // Recharges → account. INR into `recharged`; non-INR into `nonInr` only.
  for (const r of recharges) {
    // A recharge always carries a real account key (the dropdown is AD_ACCOUNTS);
    // resolve defensively so a future stray value can't crash the report.
    const key: AccountKeyOrUnattributed =
      AD_ACCOUNTS.some((a) => a.key === r.adAccount)
        ? (r.adAccount as AccountKeyOrUnattributed)
        : UNATTRIBUTED_ACCOUNT_KEY;
    const b = bucket(key);
    if (r.currency === "INR") {
      b.recharged += r.amount;
    } else {
      b.nonInr.set(r.currency, (b.nonInr.get(r.currency) ?? 0) + r.amount);
    }
  }

  const blocks: AccountReportBlock[] = [];
  let grandTotalSpend = 0;
  let grandTotalRecharged = 0;
  let hasNonInr = false;

  for (const [key, b] of buckets) {
    // Drop an empty Unattributed bucket (only show it when it has signal).
    if (
      key === UNATTRIBUTED_ACCOUNT_KEY &&
      b.spent === 0 &&
      b.recharged === 0 &&
      b.nonInr.size === 0
    ) {
      continue;
    }
    grandTotalSpend += b.spent;
    grandTotalRecharged += b.recharged;
    const nonInr = [...b.nonInr.entries()].map(([currency, total]) => ({ currency, total }));
    if (nonInr.length > 0) hasNonInr = true;
    blocks.push({
      key,
      label:     accountLabel(key),
      recharged: b.recharged,
      spent:     b.spent,
      balance:   b.recharged - b.spent,
      campaigns: b.campaigns.sort((x, y) => y.totalSpend - x.totalSpend),
      nonInr,
    });
  }

  // Live accounts first (in AD_ACCOUNTS order), Unattributed last.
  const order = new Map<AccountKeyOrUnattributed, number>(
    AD_ACCOUNTS.map((a, i) => [a.key, i]),
  );
  blocks.sort(
    (x, y) =>
      (order.get(x.key) ?? 99) - (order.get(y.key) ?? 99),
  );

  return { blocks, grandTotalSpend, grandTotalRecharged, hasNonInr };
}

// ─────────────────────────────────────────────────────────────────────────
// Budget fuel gauge — the org-wide "tank" the dashboard widget renders.
//
// A single roll-up of the /budget per-account report (R-01: built ON TOP of
// buildAccountReport so the gauge can never disagree with the per-account
// blocks): total recharged = the full tank, total spend = fuel burned,
// remaining = recharged − spent. INR-ONLY, exactly like the per-account
// balance — a non-INR recharge is NEVER subtracted from INR spend; its
// presence only sets `hasNonInr` so the widget can footnote it.
//
// Lead/deal outcomes (leadCount/dealCount/dealRevenue) ride along from the
// campaign rows so the gauge can show the ROI sub-line (ROAS, CPL) without a
// second query.
// ─────────────────────────────────────────────────────────────────────────

export type BudgetGaugeSummary = {
  /** INR recharged across all accounts in the period (the full tank). */
  recharged:   number;
  /** INR Meta spend across all accounts in the period (fuel burned). */
  spent:       number;
  /** recharged − spent (INR only). Negative = overspent past recharge. */
  remaining:   number;
  /**
   * Fraction of the tank consumed, 0–1+ (spent / recharged). null when there
   * is no recharge to measure against (render "no recharge yet", never ÷0).
   * Can exceed 1 when overspent — the widget clamps the BAR but shows the raw %.
   */
  consumed:    number | null;
  /** Total leads attributed to spend in the period. */
  leadCount:   number;
  /** Deals closed (won) attributed in the period. */
  dealCount:   number;
  /** Won-deal revenue attributed in the period (for ROAS). */
  dealRevenue: number;
  /** spend ÷ leads — null at zero leads (render "—", never ₹0). */
  costPerLead: number | null;
  /** dealRevenue ÷ spent — null at zero spend (render "—", never 0×). */
  roas:        number | null;
  /** Campaigns with spend in the period (the "N campaigns" footnote). */
  campaignCount: number;
  /** True when any non-INR recharge exists — drives the gauge footnote. */
  hasNonInr:   boolean;
};

/**
 * Collapse spend + recharges into ONE org-wide fuel gauge. Pure (no IO).
 * Built over `buildAccountReport` so it inherits the INR-only balance rule and
 * the resolve-account-from-campaign attribution wholesale (never re-implement
 * the grouping). Used by the dashboard Campaign Budget widget (seed + refresh).
 */
export function buildBudgetGaugeSummary(
  campaignRows: BudgetCampaignRow[],
  recharges: AccountRecharge[],
): BudgetGaugeSummary {
  const report = buildAccountReport(campaignRows, recharges);

  const recharged = report.grandTotalRecharged;
  const spent     = report.grandTotalSpend;

  // Lead/deal roll-up straight off the campaign rows (same numbers the totals
  // strip on /budget sums).
  let leadCount = 0;
  let dealCount = 0;
  let dealRevenue = 0;
  for (const r of campaignRows) {
    leadCount   += r.leadCount;
    dealCount   += r.dealCount;
    dealRevenue += r.dealRevenue;
  }

  return {
    recharged,
    spent,
    remaining:     recharged - spent,
    consumed:      recharged > 0 ? spent / recharged : null,
    leadCount,
    dealCount,
    dealRevenue,
    costPerLead:   leadCount > 0 ? spent / leadCount : null,
    roas:          spent > 0 ? dealRevenue / spent : null,
    campaignCount: campaignRows.length,
    hasNonInr:     report.hasNonInr,
  };
}
