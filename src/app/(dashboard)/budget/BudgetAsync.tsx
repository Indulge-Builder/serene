// Async server component — fetches the budget summary + account recharges and
// renders: the totals strip, the per-account report (recharged/spent/balance +
// grand total), the per-campaign table, and the recharge history. Streams
// behind the page Suspense.
//
// Manager scoping (scopeDomain non-null): a manager sees ONLY their own domain's
// campaign-SPEND plane. The campaign rows are filtered by domain via
// filterBudgetRowsByDomain (the mobile budget path's proven helper), the
// recharge fetch is SKIPPED, and the account report / recharge history / balance
// are never rendered — recharges carry no domain, so scoping them against
// domain-filtered spend would misstate finance. The totals strip stays (it is
// entirely spend/lead/deal derived, no recharge) but drops Revenue is kept as-is
// (deal revenue, not recharge). Admin/founder (scopeDomain null) keep the full
// two-plane report byte-for-byte.

import type { AppDomain } from "@/lib/types/database";
import {
  getBudgetSummary,
  getAccountRecharges,
  buildAccountReport,
  filterBudgetRowsByDomain,
} from "@/lib/services/ad-spend-service";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatCount, formatCurrency, formatCurrencyCompact, formatCompact } from "@/lib/utils/numbers";
import { StatTile } from "@/components/ui/StatTile";
import { StatStrip } from "@/components/ui/StatStrip";
import { BudgetEmptyState } from "@/components/budget/BudgetEmptyState";
import { BudgetWorkspace } from "@/components/budget/BudgetWorkspace";
import { BudgetTable } from "@/components/budget/BudgetTable";

type Props = {
  from:      string;
  to:        string;
  canUpload: boolean;
  /** Non-null → manager scope: spend-only plane, filtered to this domain. */
  scopeDomain: AppDomain | null;
};

export async function BudgetAsync({ from, to, canUpload, scopeDomain }: Props) {
  // ── Manager path: domain-scoped campaign-spend plane only ─────────────────
  // No recharge fetch, no account report, no balance — spend is domain-derivable,
  // recharges are org-wide finance (a domain "balance" would be a finance error).
  if (scopeDomain) {
    const allRows = await getBudgetSummary(from, to);
    const rows = filterBudgetRowsByDomain(allRows, scopeDomain);

    if (rows.length === 0) {
      return <BudgetEmptyState canUpload={canUpload} />;
    }

    const totalSpend   = rows.reduce((s, r) => s + r.totalSpend, 0);
    const totalLeads   = rows.reduce((s, r) => s + r.leadCount, 0);
    const totalDeals   = rows.reduce((s, r) => s + r.dealCount, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.dealRevenue, 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Totals strip — one shared card of StatTile cells (spend-derived only) */}
        <StatStrip>
          <StatTile variant="cell" label="Total Spend"   value={formatCurrencyCompact(totalSpend)} />
          <StatTile variant="cell" label="Leads"         value={formatCompact(totalLeads)} />
          <StatTile
            variant="cell"
            label="Cost / Lead"
            value={totalLeads > 0 ? formatCurrency(Math.round(totalSpend / totalLeads)) : "—"}
          />
          <StatTile variant="cell" label="Deals Closed"  value={formatCount(totalDeals)} />
          <StatTile
            variant="cell"
            label="Cost / Deal"
            value={totalDeals > 0 ? formatCurrency(Math.round(totalSpend / totalDeals)) : "—"}
          />
          <StatTile variant="cell" label="Revenue"       value={formatCurrencyCompact(totalRevenue)} />
        </StatStrip>

        {/* Domain caption — a manager's view is pinned to their own domain's spend. */}
        <p
          style={{
            margin:      0,
            paddingLeft: "var(--space-1)",
            fontFamily:  "var(--font-sans)",
            fontSize:    "var(--text-xs)",
            fontStyle:   "italic",
            color:       "var(--theme-text-tertiary)",
          }}
        >
          Showing {DOMAIN_LABELS[scopeDomain]} campaign spend. Leads, deals and
          revenue are attributed to Meta campaigns only — referral, Google and
          walk-in deals are excluded.
        </p>

        {/* Campaign spend plane — the per-campaign grid (no account/balance/recharge). */}
        <BudgetTable
          rows={rows.map((r) => ({ ...r, campaignTitle: r.campaignKey }))}
        />
      </div>
    );
  }

  // ── Admin/founder path: the full two-plane report (unchanged) ─────────────
  const [rows, recharges] = await Promise.all([
    getBudgetSummary(from, to),
    getAccountRecharges(from, to),
  ]);

  // Empty only when there is NO spend AND NO recharge — a recharge with no spend
  // yet is still worth showing (the account has a balance).
  if (rows.length === 0 && recharges.length === 0) {
    return <BudgetEmptyState canUpload={canUpload} />;
  }

  const report = buildAccountReport(rows, recharges);

  const totalSpend   = rows.reduce((s, r) => s + r.totalSpend, 0);
  const totalLeads   = rows.reduce((s, r) => s + r.leadCount, 0);
  const totalDeals   = rows.reduce((s, r) => s + r.dealCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.dealRevenue, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Totals strip — one shared card of StatTile cells */}
      <StatStrip>
        <StatTile variant="cell" label="Total Spend"   value={formatCurrencyCompact(totalSpend)} />
        <StatTile variant="cell" label="Leads"         value={formatCompact(totalLeads)} />
        <StatTile
          variant="cell"
          label="Cost / Lead"
          value={totalLeads > 0 ? formatCurrency(Math.round(totalSpend / totalLeads)) : "—"}
        />
        <StatTile variant="cell" label="Deals Closed"  value={formatCount(totalDeals)} />
        <StatTile
          variant="cell"
          label="Cost / Deal"
          value={totalDeals > 0 ? formatCurrency(Math.round(totalSpend / totalDeals)) : "—"}
        />
        <StatTile variant="cell" label="Revenue"       value={formatCurrencyCompact(totalRevenue)} />
      </StatStrip>

      {/* Attribution caption — this page is an ROI-of-ad-spend view: Leads, Deals
          and Revenue are attributed to Meta campaigns only (joined on the lead's
          utm_campaign). Referral / Google / walk-in deals are deliberately
          excluded so the cost-per-deal and revenue here never overstate the
          return on Meta spend. */}
      <p
        style={{
          margin:     0,
          paddingLeft: "var(--space-1)",
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          fontStyle:  "italic",
          color:      "var(--theme-text-tertiary)",
        }}
      >
        Leads, deals and revenue are attributed to Meta campaigns only — referral,
        Google and walk-in deals are excluded.
      </p>

      {/* Accounts / Campaigns / Recharges workspace (client tabs) */}
      <BudgetWorkspace
        report={report}
        campaignRows={rows.map((r) => ({
          ...r,
          campaignTitle: r.campaignKey,
        }))}
        recharges={recharges}
      />
    </div>
  );
}
