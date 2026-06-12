"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { getBudgetSummaryWidgetAction } from "@/lib/actions/dashboard";
import { resolvePresetToRange } from "@/lib/utils/date-range";
import { formatCount, formatCurrencyCompact } from "@/lib/utils/numbers";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import { useWidgetData } from "@/hooks/useWidgetData";
import { useDashboardCohortSync } from "@/hooks/useDashboardCohortSync";
import type { BudgetCampaignRow } from "@/lib/services/ad-spend-service";
import type { WidgetProps } from "../DashboardWidgetSlot";

/**
 * Campaign Budget — ad spend joined to lead/deal outcomes for the active
 * date range. Data is the /budget pipeline (getBudgetSummary) reused as a
 * widget: RSC-seeded on first paint, refetched through
 * getBudgetSummaryWidgetAction on range changes/refresh. Managers see only
 * their own domain's campaigns (pinned server-side via effectiveWidgetDomain).
 */
export function ManagerBudgetWidget({ role, initialData, size = "md", dateRange }: WidgetProps) {
  const rscBudget = initialData?.budget_summary ?? null;
  const range = dateRange ?? resolvePresetToRange("week");

  const { data, loaded, isPending, refetch, apply } = useWidgetData<BudgetCampaignRow[]>({
    seed: rscBudget,
    fetcher: async () => {
      const result = await getBudgetSummaryWidgetAction(range.from, range.to);
      return { data: result.data };
    },
    deps: [range.from, range.to],
  });
  useDashboardCohortSync(rscBudget, dateRange, true, apply);

  const rows = data ?? [];
  const totalSpend   = rows.reduce((s, r) => s + r.totalSpend, 0);
  const totalLeads   = rows.reduce((s, r) => s + r.leadCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.dealRevenue, 0);
  const costPerLead  = totalLeads > 0 ? totalSpend / totalLeads : null;

  return (
    <div
      style={{
        borderRadius:  "var(--radius-lg)",
        border:        "1px solid var(--theme-paper-border)",
        background:    "var(--theme-paper)",
        boxShadow:     "var(--shadow-1)",
        padding:       "var(--space-5)",
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--space-3)",
        height:        WIDGET_HEIGHT_BY_SIZE[size],
        overflow:      "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <p
          style={{
            fontSize:   "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            color:      "var(--theme-text-primary)",
            margin:     0,
          }}
        >
          Campaign Budget<span className="page-title-dot">.</span>
        </p>
        <Button
          variant="ghost"
          onClick={() => refetch()}
          loading={isPending}
          title="Refresh"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            border: "1px solid var(--theme-paper-border)",
            flexShrink: 0,
          }}
          iconLeft={RefreshCcw}
          size="xs"
        />
      </div>

      {loaded && rows.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-tertiary)",
            textAlign:  "center",
            margin:     0,
            flex:       1,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}
        >
          No ad spend recorded in this period.
        </p>
      ) : (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            alignContent:        "center",
            flex:                1,
            minHeight:           0,
            opacity:             isPending ? 0.5 : 1,
            transition:          "opacity 200ms",
          }}
        >
          <StatTile variant="cell" label="Spend" value={formatCurrencyCompact(totalSpend)} />
          <StatTile variant="cell" label="Leads" value={formatCount(totalLeads)} />
          <StatTile
            variant="cell"
            label="Cost / Lead"
            value={costPerLead === null ? "—" : formatCurrencyCompact(costPerLead)}
          />
          <StatTile variant="cell" label="Deal Revenue" value={formatCurrencyCompact(totalRevenue)} />
        </div>
      )}

      <p
        style={{
          fontSize:   "var(--text-2xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
          flexShrink: 0,
        }}
      >
        {formatCount(rows.length)} campaign{rows.length === 1 ? "" : "s"} with spend in this period
        {role === "manager" ? " · your domain" : ""}
      </p>
    </div>
  );
}
