"use client";

// Budget workspace — two views over the same period's data:
//   Accounts   — per-account recharged/spent/balance report + recharge history
//   Campaigns  — the full per-campaign table (the original /budget grid)
// The Accounts|Campaigns TabSelector lives in the filter-bar tabSlot
// (BudgetFilterBar) — this reads the active tab from the shared BudgetTabProvider
// so the selector and the content switch stay in lockstep. The Add Recharge
// action lives in the page header (admin/founder), alongside Upload Spend — this
// is display-only.
//
// Campaign search (?search=, the shared PerformanceFilters bar): filtered
// CLIENT-SIDE over the campaign rows already on the page — the Campaigns-tab grid
// and the campaigns nested inside each Accounts-tab block. The account-level
// recharged/spent/balance stats are NEVER recomputed from the filtered subset
// (recharges aren't campaign-scoped — that would be a finance error); search only
// narrows which campaign ROWS show inside each expander.

import { useSearchParams } from "next/navigation";
import { AccountReportSection } from "@/components/budget/AccountReportSection";
import { RechargeHistoryTable } from "@/components/budget/RechargeHistoryTable";
import { BudgetSectionHeader, SectionHeaderDatum } from "@/components/budget/BudgetSectionHeader";
import { BudgetTable, type BudgetTableRow } from "@/components/budget/BudgetTable";
import { useBudgetTab } from "@/app/(dashboard)/budget/budget-tab-context";
import { formatCurrency } from "@/lib/utils/numbers";
import type { AccountReport, AccountRecharge } from "@/lib/services/ad-spend-service";

type Props = {
  report:       AccountReport;
  campaignRows: BudgetTableRow[];
  recharges:    AccountRecharge[];
};

export function BudgetWorkspace({ report, campaignRows, recharges }: Props) {
  const { tab } = useBudgetTab();
  const search = (useSearchParams().get("search") ?? "").trim().toLowerCase();

  // Campaigns-tab grid: filter by displayed title OR raw campaign key.
  const visibleCampaignRows = search
    ? campaignRows.filter(
        (r) =>
          r.campaignTitle.toLowerCase().includes(search) ||
          r.campaignKey.toLowerCase().includes(search),
      )
    : campaignRows;

  // Accounts-tab: narrow each block's campaign list (the expander rows) while
  // keeping the recharged/spent/balance stats — those are real finance totals,
  // never re-derived from a filtered subset.
  const reportForView: AccountReport = search
    ? {
        ...report,
        blocks: report.blocks.map((block) => ({
          ...block,
          campaigns: block.campaigns.filter((c) =>
            c.campaignKey.toLowerCase().includes(search),
          ),
        })),
      }
    : report;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {tab === "accounts" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <AccountReportSection report={reportForView} />

          {/* Recharge history */}
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <BudgetSectionHeader
              title="Recharge History"
              meta={
                <SectionHeaderDatum
                  label="Total Recharged"
                  value={formatCurrency(Math.round(report.grandTotalRecharged))}
                />
              }
            />
            <div className="rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
              <RechargeHistoryTable rows={recharges} />
            </div>
          </section>
        </div>
      ) : (
        <BudgetTable rows={visibleCampaignRows} />
      )}
    </div>
  );
}
