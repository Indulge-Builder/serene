"use client";

// Spending overview — INR outflow analytics. All figures are the manually-entered
// INR paid (never a currency conversion). Recharts is code-split per the perf rule
// (non-dashboard consumers dynamic-import the chart wrappers at the call site).

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { ChartSkeleton } from "@/components/ui/charts/ChartSkeleton";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/numbers";
import { SUBSCRIPTION_TYPE_LABELS } from "@/lib/constants/subscription-constants";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import type { SpendingOverview as SpendingOverviewData } from "@/lib/services/subscriptions-service";

const SpendDonut = dynamic(
  () => import("@/components/subscriptions/SpendDonut").then((m) => m.SpendDonut),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);
const BarChart = dynamic(() => import("@/components/ui/charts/BarChart").then((m) => m.BarChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={240} />,
});

export function SpendingOverview({ data }: { data: SpendingOverviewData }) {
  const hasData = data.yearToDateInr > 0 || data.monthlyTrend.some((m) => m.inr > 0);

  const typeData = data.byType.map((t) => ({
    label: SUBSCRIPTION_TYPE_LABELS[t.type],
    value: t.inr,
  }));
  const deptData = data.byDepartment.map((d) => ({
    label: DOMAIN_LABELS[d.domain],
    value: d.inr,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {data.rangeInr != null ? (
          <>
            <StatTile label="Spent in Range" value={formatCurrency(data.rangeInr, "INR")} />
            <StatTile label="Payments in Range" value={String(data.rangeCount ?? 0)} />
          </>
        ) : (
          <>
            <StatTile label="Spent This Month" value={formatCurrency(data.monthToDateInr, "INR")} />
            <StatTile label="Spent This Year" value={formatCurrency(data.yearToDateInr, "INR")} />
          </>
        )}
        <StatTile label="Active Subscriptions" value={String(data.activeCount)} />
      </div>

      {!hasData ? (
        <EmptyState
          icon={Receipt}
          title="No spending recorded yet"
          description="Record a payment or top-up and your spending analytics will appear here."
          framed
        />
      ) : (
        <>
          {/* Breakdowns */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--space-6)",
            }}
          >
            <ChartCard title="By Billing Type">
              {typeData.length > 0 ? (
                <SpendDonut data={typeData} height={240} />
              ) : (
                <EmptyState variant="inline" title="No data yet." />
              )}
            </ChartCard>
            <ChartCard title="By Department">
              {deptData.length > 0 ? (
                <SpendDonut data={deptData} height={240} />
              ) : (
                <EmptyState variant="inline" title="No data yet." />
              )}
            </ChartCard>
          </div>

          {/* Per-tool ranking */}
          <ChartCard title="By Tool">
            {data.byTool.length > 0 ? (
              <ToolRanking rows={data.byTool} />
            ) : (
              <EmptyState variant="inline" title="No data yet." />
            )}
          </ChartCard>

          {/* Trend */}
          <ChartCard title="Monthly Spend (last 12 months)">
            <BarChart
              data={data.monthlyTrend as unknown as Record<string, unknown>[]}
              series={[{ key: "inr", label: "INR Spend" }]}
              xKey="label"
              height={260}
              yAxisProps={{ tickFormatter: (v: number) => formatCurrencyCompact(Number(v), "INR") }}
              tooltipProps={{
                formatter: (v: unknown) => [formatCurrency(Number(v), "INR"), "Spend"],
              }}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}


const TOOL_RANKING_MAX = 8;

/** Ranked per-tool spend list: name + INR + a proportional track. Static widths
 *  (no width animation — Never-Do list applies to animation, not layout). */
function ToolRanking({ rows }: { rows: { tool: string; inr: number }[] }) {
  const top = rows.slice(0, TOOL_RANKING_MAX);
  const rest = rows.slice(TOOL_RANKING_MAX);
  const restInr = rest.reduce((sum, r) => sum + r.inr, 0);
  const max = Math.max(...top.map((r) => r.inr), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {top.map((r) => (
        <div key={r.tool}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "var(--space-3)",
              marginBottom: "var(--space-1)",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--theme-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.tool}
            </span>
            <span
              style={{
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--theme-text-secondary)",
                flexShrink: 0,
              }}
            >
              {formatCurrency(r.inr, "INR")}
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: "var(--radius-full)",
              background: "var(--theme-paper-subtle)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max((r.inr / max) * 100, 2)}%`,
                height: "100%",
                borderRadius: "var(--radius-full)",
                background: "var(--theme-accent)",
              }}
            />
          </div>
        </div>
      ))}
      {rest.length > 0 && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            color: "var(--theme-text-tertiary)",
          }}
        >
          + {rest.length} more {rest.length === 1 ? "tool" : "tools"} · {formatCurrency(restInr, "INR")}
        </p>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <h3
        style={{
          margin: "0 0 var(--space-4)",
          fontFamily: "var(--font-serif)",
          fontSize: "var(--text-base)",
          fontWeight: "var(--weight-normal)",
          color: "var(--theme-text-primary)",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--theme-paper)",
  border: "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-1)",
  padding: "var(--space-5)",
};
