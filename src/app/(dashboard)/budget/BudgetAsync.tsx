// Async server component — fetches the budget summary + account recharges and
// renders: the totals strip, the per-account report (recharged/spent/balance +
// grand total), the per-campaign table, and the recharge history. Streams
// behind the page Suspense.

import {
  getBudgetSummary,
  getAccountRecharges,
  buildAccountReport,
} from "@/lib/services/ad-spend-service";
import { formatCount, formatCurrency, formatCurrencyCompact, formatCompact } from "@/lib/utils/numbers";
import { StatTile } from "@/components/ui/StatTile";
import { BudgetEmptyState } from "@/components/budget/BudgetEmptyState";
import { BudgetWorkspace } from "@/components/budget/BudgetWorkspace";

type Props = {
  from:      string;
  to:        string;
  canUpload: boolean;
};

export async function BudgetAsync({ from, to, canUpload }: Props) {
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
      <div
        className="rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}
      >
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
      </div>

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
