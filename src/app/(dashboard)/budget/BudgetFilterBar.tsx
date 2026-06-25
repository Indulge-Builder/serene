"use client";

// The /budget filter strip: the shared PerformanceFilters bar (Range presets +
// custom Dates) with the Accounts|Campaigns TabSelector mounted in its far-right
// tabSlot — the same single-paper-strip layout /performance uses (tabs share the
// filter-bar strip on the right edge, never a separate row). Tab state is read
// from the BudgetTabProvider so the content switch (BudgetWorkspace, below
// Suspense) stays in lockstep.

import { TabSelector } from "@/components/ui/TabSelector";
import { PerformanceFilters } from "@/components/performance/PerformanceFilters";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import { useBudgetTab, type BudgetTab } from "./budget-tab-context";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "campaigns", label: "Campaigns" },
];

export function BudgetFilterBar() {
  const { tab, setTab } = useBudgetTab();
  const isMobile = useMediaQuery(MQ.mobile);

  // accent variant + a distinct indicatorLayoutId so the shared-layout pill
  // never collides with another <Tabs> group on the page (TabSelector rule).
  const tabs = (
    <div
      style={{
        maxWidth:       "100%",
        minWidth:       0,
        overflowX:      "auto",
        scrollbarWidth: "none",
        flexShrink:     0,
        ...(isMobile ? { flex: "1 1 0" } : null),
      }}
    >
      <TabSelector
        tabs={TABS}
        activeTab={tab}
        onChange={(id) => setTab(id as BudgetTab)}
        variant="accent"
        indicatorLayoutId="budget-workspace-tabs"
        fullWidth={isMobile}
      />
    </div>
  );

  return (
    <PerformanceFilters
      showSearch
      searchPlaceholder="Search campaigns…"
      searchAriaLabel="Search campaigns"
      tabSlot={tabs}
    />
  );
}
