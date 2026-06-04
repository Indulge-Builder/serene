"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BarChart } from "@/components/ui/charts/BarChart";
import type { BarChartSeries } from "@/components/ui/charts/BarChart";
import {
  getLeadsByCampaignAction,
  getLeadsByCampaignForDomainAction,
} from "@/lib/actions/dashboard";
import { formatCompact } from "@/lib/utils/numbers";
import { LEAD_STATUS_LABELS } from "@/lib/constants/lead-statuses";
import { DOMAIN_LABELS, GIA_DOMAINS, type GiaDomain } from "@/lib/constants/domains";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/TabSelector";
import type { AppDomain, LeadStatus } from "@/lib/types/database";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import type { DashboardCampaignStatusMix } from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { DateRange } from "@/lib/utils/date-range";

type DomainMode = "all" | GiaDomain;

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "var(--color-info)",
  touched: "var(--theme-accent)",
  in_discussion: "var(--color-warning)",
  nurturing: "var(--theme-accent-muted)",
  won: "var(--color-success)",
  lost: "var(--color-danger)",
  junk: "var(--theme-text-tertiary)",
};

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "touched",
  "in_discussion",
  "nurturing",
  "won",
  "lost",
  "junk",
];

// Series definition for the BarChart wrapper — keys match STATUS_ORDER and STATUS_COLORS
const CHART_SERIES: BarChartSeries[] = STATUS_ORDER.map((s) => ({
  key: s,
  label: LEAD_STATUS_LABELS[s],
}));

export function ManagerCampaignWidget({
  role,
  domain,
  initialData,
  size = 'xl',
  dateRange,
}: WidgetProps & { dateRange?: DateRange }) {
  const isManagerRole = role === "manager";
  const seed = initialData?.campaigns ?? null;
  const [campaigns, setCampaigns] = useState<DashboardCampaignStatusMix[]>(
    seed ?? [],
  );
  const [loaded, setLoaded] = useState(seed !== null);
  const [domainMode, setDomainMode] = useState<DomainMode>("all");
  const [isPending, startTransition] = useTransition();

  // Fetch on mount (when no seed) and whenever dateRange changes
  useEffect(() => {
    // Use seeded data only on first render when no date filter is active
    if (seed !== null && !dateRange) { setLoaded(true); return; }
    let cancelled = false;
    startTransition(async () => {
      const result = await getLeadsByCampaignAction(role, domain, dateRange?.from, dateRange?.to);
      if (!cancelled && result.data) {
        setCampaigns(result.data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.from, dateRange?.to]);

  function handleDomainChange(mode: DomainMode) {
    setDomainMode(mode);
    startTransition(async () => {
      if (mode === "all") {
        const result = await getLeadsByCampaignAction(role, domain, dateRange?.from, dateRange?.to);
        if (result.data) setCampaigns(result.data);
      } else {
        const result = await getLeadsByCampaignForDomainAction(mode as AppDomain, dateRange?.from, dateRange?.to);
        if (result.data) setCampaigns(result.data);
      }
    });
  }

  function handleRefresh() {
    startTransition(async () => {
      if (domainMode === "all") {
        const result = await getLeadsByCampaignAction(role, domain, dateRange?.from, dateRange?.to);
        if (result.data) setCampaigns(result.data);
      } else {
        const result = await getLeadsByCampaignForDomainAction(domainMode as AppDomain, dateRange?.from, dateRange?.to);
        if (result.data) setCampaigns(result.data);
      }
    });
  }

  // Silent 30s auto-poll — mirrors handleRefresh, no loading state
  useEffect(() => {
    const id = setInterval(() => {
      let cancelled = false;
      startTransition(async () => {
        if (domainMode === "all") {
          const result = await getLeadsByCampaignAction(role, domain, dateRange?.from, dateRange?.to);
          if (!cancelled && result.data) setCampaigns(result.data);
        } else {
          const result = await getLeadsByCampaignForDomainAction(domainMode as AppDomain, dateRange?.from, dateRange?.to);
          if (!cancelled && result.data) setCampaigns(result.data);
        }
      });
      return () => { cancelled = true; };
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainMode, role, domain, dateRange?.from, dateRange?.to]);


  // Keep the full campaign name in data — label wrapping is handled by the
  // custom XAxis tick renderer below, not by slicing the string here.
  const chartData = campaigns.map((c) => ({
    campaign: c.campaign,
    ...Object.fromEntries(STATUS_ORDER.map((s) => [s, c.mix[s] ?? 0])),
  }));

  const activeStatuses = STATUS_ORDER.filter((s) =>
    campaigns.some((c) => c.mix[s]),
  );

  // Compute a concrete pixel chart height so ResponsiveContainer always gets a
  // positive number. height="100%" on a flex:1 parent returns -1 in Recharts.
  //
  // Fixed chrome:
  //   padding:      40px (20 top + 20 bottom)
  //   header:       36px
  //   gap × 2:      32px  (header→chart, chart→legend)
  //   legend pills: 32px  (one row, when data is present)
  //   domain row:   52px  (borderTop 1px + paddingTop 12px + tab 28px + gap 16px) — admin/founder only
  const totalPx    = parseInt(WIDGET_HEIGHT_BY_SIZE[size], 10);
  const PADDING    = 40;
  const HEADER     = 36;
  const GAP        = 16;
  const LEGEND     = 32;
  const DOMAIN_ROW = isManagerRole ? 0 : 52 + GAP;
  const chartHeight = Math.max(
    120,
    totalPx - PADDING - HEADER - GAP * 2 - LEGEND - DOMAIN_ROW,
  );

  // Background tints for legend pills — mirrors LeadPipeline scorecard
  const STATUS_BG: Record<LeadStatus, string> = {
    new:           "var(--color-info-light)",
    touched:       "var(--color-warning-light)",
    in_discussion: "var(--theme-accent-surface)",
    nurturing:     "var(--theme-accent-surface)",
    won:           "var(--color-success-light)",
    lost:          "var(--color-danger-light)",
    junk:          "var(--color-danger-light)",
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        height: WIDGET_HEIGHT_BY_SIZE[size],
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontSize: "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            color: "var(--theme-text-primary)",
            margin: 0,
          }}
        >
          Campaign Performance<span className="page-title-dot">.</span>
        </p>
        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isPending}
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

      {/* Chart — fills remaining space */}
      {loaded && campaigns.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-tertiary)",
            textAlign: "center",
            margin: 0,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Leads with UTM campaign data will appear here.
        </p>
      ) : loaded ? (
        <div
          style={{
            height: chartHeight,
            flexShrink: 0,
            opacity: isPending ? 0.5 : 1,
            transition: "opacity 200ms",
          }}
        >
          <BarChart
            data={chartData}
            series={CHART_SERIES}
            xKey="campaign"
            height={chartHeight}
            stacked
            colorMap={STATUS_COLORS}
            margin={{ top: 4, right: 4, bottom: 48, left: -24 }}
            barCategoryGap="30%"
            gridProps={{
              horizontal: true,
              vertical: false,
              strokeDasharray: "none",
            }}
            xAxisProps={{
              tick: <WrappedXTick />,
              interval: 0,
            }}
            yAxisProps={{
              allowDecimals: false,
              tickFormatter: (v: number) => formatCompact(v),
              tick: { fontSize: 10, fill: "var(--theme-text-tertiary)" },
            }}
            tooltipProps={{
              contentStyle: {
                background: "var(--theme-paper)",
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-2)",
                fontSize: "var(--text-xs)",
                color: "var(--theme-text-primary)",
              },
              cursor: { fill: "var(--theme-paper-subtle)" },
            }}
            style={{ background: "transparent", borderRadius: 0 }}
          />
        </div>
      ) : null}

      {/* Legend pills — same tint/colour vocabulary as LeadPipeline scorecard */}
      {loaded && activeStatuses.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          {activeStatuses.map((s) => (
            <div
              key={s}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "5px",
                background:   STATUS_BG[s],
                border:       "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-full)",
                padding:      "3px 8px 3px 6px",
              }}
            >
              <span
                style={{
                  width:        8,
                  height:       8,
                  borderRadius: "50%",
                  background:   STATUS_COLORS[s],
                  flexShrink:   0,
                  display:      "block",
                }}
              />
              <span
                style={{
                  fontSize:   "var(--text-2xs)",
                  fontWeight: "var(--weight-medium)",
                  color:      STATUS_COLORS[s],
                  whiteSpace: "nowrap",
                }}
              >
                {LEAD_STATUS_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Domain picker — pinned to bottom, admin/founder only */}
      {!isManagerRole && (
        <div
          style={{
            paddingTop:  "var(--space-3)",
            borderTop:   "1px solid var(--theme-paper-border)",
            flexShrink:  0,
          }}
        >
          <Tabs
            value={domainMode}
            onValueChange={(v) => handleDomainChange(v as DomainMode)}
            variant="connected"
            indicatorLayoutId="campaign-domain"
            style={{
              opacity:       isPending ? 0.6 : 1,
              pointerEvents: isPending ? "none" : undefined,
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {GIA_DOMAINS.map((d) => (
                <TabsTrigger key={d} value={d}>
                  {DOMAIN_LABELS[d]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// Custom XAxis tick that wraps long campaign names across two lines.
// Recharts renders this as SVG so we use <tspan> for line breaks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WrappedXTick({ x, y, payload }: any) {
  if (!payload?.value) return null;

  const name: string = payload.value;
  const MAX = 12; // max chars per line

  // Always truncate both lines to MAX, then add … only if the original was longer.
  // This ensures every label is visually consistent — no label ever exceeds two
  // short lines regardless of where spaces fall or whether they exist at all.
  let line1: string;
  let line2: string | null = null;

  if (name.length <= MAX) {
    line1 = name;
  } else {
    // Find the last space within the first MAX chars so line1 breaks cleanly
    let split = name.lastIndexOf(" ", MAX);
    if (split <= 0) split = MAX; // no space — hard cut
    line1 = name.slice(0, split).trim();
    const rest = name.slice(split).trim();
    line2 = rest.length > MAX ? `${rest.slice(0, MAX - 1)}…` : rest;
  }

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="hanging"
      fill="var(--theme-text-tertiary)"
      fontSize={9}
    >
      <tspan x={x} dy={4}>
        {line1}
      </tspan>
      {line2 && (
        <tspan x={x} dy={13}>
          {line2}
        </tspan>
      )}
    </text>
  );
}
