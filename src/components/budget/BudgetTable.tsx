"use client";

// Read-only per-campaign budget grid — a sanctioned Table<T> use case
// (RPC result table; no toolbar, no column picker).

import { Table, type TableColumn } from "@/components/ui/Table";
import { formatCompact, formatCount, formatCurrency, formatCurrencyCompact } from "@/lib/utils/numbers";
import type { BudgetCampaignRow } from "@/lib/services/ad-spend-service";

export type BudgetTableRow = BudgetCampaignRow & { campaignTitle: string };

const COLUMNS: TableColumn<BudgetTableRow>[] = [
  {
    id:     "campaign",
    header: "Campaign",
    cell:   (row) => (
      <span style={{ fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
        {row.campaignTitle}
      </span>
    ),
  },
  {
    id:     "spend",
    header: "Spend",
    align:  "right",
    cell:   (row) => formatCurrency(row.totalSpend),
  },
  {
    id:     "results",
    header: "Results",
    align:  "right",
    cell:   (row) => formatCount(row.totalResults),
  },
  {
    id:     "impressions",
    header: "Impressions",
    align:  "right",
    cell:   (row) => formatCompact(row.totalImpressions),
  },
  {
    id:     "linkClicks",
    header: "Link Clicks",
    align:  "right",
    cell:   (row) => formatCompact(row.totalLinkClicks),
  },
  {
    id:     "leads",
    header: "Leads",
    align:  "right",
    cell:   (row) => formatCount(row.leadCount),
  },
  {
    id:     "cpl",
    header: "Cost / Lead",
    align:  "right",
    cell:   (row) =>
      row.costPerLead === null ? "—" : formatCurrency(Math.round(row.costPerLead)),
  },
  {
    id:     "deals",
    header: "Deals",
    align:  "right",
    cell:   (row) => formatCount(row.dealCount),
  },
  {
    id:     "cpd",
    header: "Cost / Deal",
    align:  "right",
    cell:   (row) =>
      row.costPerDeal === null ? "—" : formatCurrency(Math.round(row.costPerDeal)),
  },
  {
    id:     "revenue",
    header: "Revenue",
    align:  "right",
    cell:   (row) => formatCurrencyCompact(row.dealRevenue),
  },
];

export function BudgetTable({ rows }: { rows: BudgetTableRow[] }) {
  return (
    <Table<BudgetTableRow>
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.campaignKey}
      stickyHeader
    />
  );
}
