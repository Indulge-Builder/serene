// Budget page queries — single responsibility (ad spend ↔ leads ↔ deals).
// Never add spend queries to leads-service.ts or performance-service.ts.
//
// NO Redis namespace — budget reads are always live, like the campaign RPCs
// (see docs/architecture/caching.md §2). Do not add cache-aside here.

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";

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
