"use client";

// Budget workspace — two tabs over the same period's data:
//   Accounts   — per-account recharged/spent/balance report + recharge history
//   Campaigns  — the full per-campaign table (the original /budget grid)
// The Add Recharge action lives in the page header (admin/founder), alongside
// Upload Spend — this is display-only.

import { useState } from "react";
import { TabSelector } from "@/components/ui/TabSelector";
import { AccountReportSection } from "@/components/budget/AccountReportSection";
import { RechargeHistoryTable } from "@/components/budget/RechargeHistoryTable";
import { BudgetTable, type BudgetTableRow } from "@/components/budget/BudgetTable";
import type { AccountReport, AccountRecharge } from "@/lib/services/ad-spend-service";

type Props = {
  report:       AccountReport;
  campaignRows: BudgetTableRow[];
  recharges:    AccountRecharge[];
};

const TABS = [
  { id: "accounts",  label: "Accounts" },
  { id: "campaigns", label: "Campaigns" },
];

export function BudgetWorkspace({ report, campaignRows, recharges }: Props) {
  const [tab, setTab] = useState<string>("accounts");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <TabSelector
        tabs={TABS}
        activeTab={tab}
        onChange={setTab}
        indicatorLayoutId="budget-workspace-tabs"
      />

      {tab === "accounts" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <AccountReportSection report={report} />

          {/* Recharge history */}
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   "var(--text-lg)",
                color:      "var(--theme-text-primary)",
                margin:     0,
              }}
            >
              Recharge History
            </h2>
            <div className="rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
              <RechargeHistoryTable rows={recharges} />
            </div>
          </section>
        </div>
      ) : (
        <BudgetTable rows={campaignRows} />
      )}
    </div>
  );
}
