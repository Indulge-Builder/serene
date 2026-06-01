"use client";

import { useState, useTransition, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  getLeadVolumeByPeriodAction,
  getLeadVolumeByDomainsAction,
  getLeadVolumeForDomainAction,
} from "@/lib/actions/dashboard";
import { formatCompact, formatCount } from "@/lib/utils/numbers";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/TabSelector";
import { useChartTokens } from "@/components/ui/charts/useChartTokens";
import type {
  LeadVolumeSummary,
  MultiDomainVolumeSummary,
  VolumePeriod,
} from "@/lib/services/dashboard-service";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { AppDomain } from "@/lib/types/database";
import { DOMAIN_LABELS, GIA_DOMAINS } from "@/lib/constants/domains";
import type { GiaDomain } from '@/lib/constants/domains';

// 4 visually distinct line colours — hardcoded so no two domains ever clash
// regardless of active theme. Chosen across the hue wheel: amber, blue, violet, rose.
const DOMAIN_LINE_COLORS: Record<string, string> = {
  onboarding:  "#F5A623",
  concierge:   "#4A90D9",
  finance:     "#8B6FD4",
  lifestyle:   "#E05C4B",
};
const FALLBACK_COLORS = ["#F5A623", "#4A90D9", "#8B6FD4", "#E05C4B"];

function getDomainColor(domain: string, index: number): string {
  return DOMAIN_LINE_COLORS[domain] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// Period tabs: Month (left) | Week (default, middle) | Today (right)
const PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "today", label: "Today" },
];

type DomainMode = "all" | GiaDomain;

function grandTotalFromMulti(multi: MultiDomainVolumeSummary): number {
  return GIA_DOMAINS.reduce((sum, d) => sum + (multi.totals[d] ?? 0), 0);
}

function domainTabCount(
  mode: DomainMode,
  activeMode: DomainMode,
  multi: MultiDomainVolumeSummary | null,
  single: LeadVolumeSummary | null,
): number | undefined {
  if (mode === "all") {
    if (multi) return grandTotalFromMulti(multi);
    return activeMode !== "all" ? single?.total : undefined;
  }
  if (activeMode === mode && single) return single.total;
  return multi?.totals[mode as AppDomain];
}

function MultiLineTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  colors: string[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-2)",
        padding: "8px 12px",
        fontSize: "var(--text-xs)",
        color: "var(--theme-text-primary)",
        minWidth: "148px",
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          color: "var(--theme-text-tertiary)",
          fontWeight: "var(--weight-medium)",
        }}
      >
        {label}
      </p>
      {payload.map((entry, i) => (
        <div
          key={entry.dataKey}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "3px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: colors[i] ?? entry.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--theme-text-secondary)", flex: 1 }}>
            {DOMAIN_LABELS[entry.dataKey as GiaDomain] ?? entry.dataKey}
          </span>
          <span
            style={{
              fontWeight: "var(--weight-semibold)",
              color: "var(--theme-text-primary)",
            }}
          >
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ManagerLeadVolumeWidget({
  role,
  domain,
  initialData,
  size = 'lg',
}: WidgetProps) {
  const isManagerRole = role === "manager";

  // For managers: seed from RSC initial data. For admin/founder: always fetch multi on mount.
  const seed = isManagerRole ? (initialData?.lead_volume ?? null) : null;

  const [period, setPeriod] = useState<VolumePeriod>("week");
  const [domainMode, setDomainMode] = useState<DomainMode>("all");
  const [singleData, setSingleData] = useState<LeadVolumeSummary | null>(seed);
  const [multiData, setMultiData] = useState<MultiDomainVolumeSummary | null>(
    null,
  );
  const [loaded, setLoaded] = useState(seed !== null);
  const [isPending, startTransition] = useTransition();
  const { series: chartColors } = useChartTokens(); // used for single-domain manager line

  // Initial load — standard cancelled-flag pattern (Strict Mode safe)
  useEffect(() => {
    let cancelled = false;

    if (isManagerRole) {
      if (seed !== null) return; // seeded from RSC, no fetch needed
      startTransition(async () => {
        const result = await getLeadVolumeByPeriodAction(role, domain, "week");
        if (!cancelled && result.data) {
          setSingleData(result.data);
          setLoaded(true);
        }
      });
    } else {
      startTransition(async () => {
        const result = await getLeadVolumeByDomainsAction(
          "week",
          [...GIA_DOMAINS],
        );
        if (!cancelled && result.data) {
          setMultiData(result.data);
          setLoaded(true);
        }
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePeriodChange(p: VolumePeriod) {
    setPeriod(p);
    startTransition(async () => {
      if (isManagerRole) {
        const result = await getLeadVolumeByPeriodAction(role, domain, p);
        if (result.data) setSingleData(result.data);
      } else if (domainMode === "all") {
        const result = await getLeadVolumeByDomainsAction(p, [...GIA_DOMAINS]);
        if (result.data) setMultiData(result.data);
      } else {
        // Specific domain tab selected — use the domain-aware action
        const result = await getLeadVolumeForDomainAction(
          p,
          domainMode as AppDomain,
        );
        if (result.data) setSingleData(result.data);
      }
    });
  }

  function handleDomainChange(mode: DomainMode) {
    setDomainMode(mode);
    startTransition(async () => {
      if (mode === "all") {
        const result = await getLeadVolumeByDomainsAction(
          period,
          [...GIA_DOMAINS],
        );
        if (result.data) setMultiData(result.data);
      } else {
        const result = await getLeadVolumeForDomainAction(
          period,
          mode as AppDomain,
        );
        if (result.data) setSingleData(result.data);
      }
    });
  }

  // Derived
  const isMultiMode = !isManagerRole && domainMode === "all";
  const multiSeries = multiData?.series ?? [];
  const singleSeries = singleData?.series ?? [];

  // Compute chart height dynamically from the size prop so the chart fills the
  // available space as the user resizes the widget.
  //
  // Fixed chrome that never changes:
  //   padding:    20px top + 20px bottom = 40px
  //   header row: 36px  (title + period tab pill)
  //   gap×2:      16px × 2 = 32px  (header→chart, chart→domain tabs or end)
  //
  // For admin/founder the domain tabs row adds:
  //   domain tabs: 36px
  //   extra gap:   16px
  //
  // We parse the pixel value from WIDGET_HEIGHT_BY_SIZE (e.g. "420px" → 420).
  const totalPx = parseInt(WIDGET_HEIGHT_BY_SIZE[size], 10);
  const PADDING   = 40; // 20px × 2
  const HEADER    = 36;
  const GAP       = 16;
  const DOMAIN_ROW = isManagerRole ? 0 : 36 + GAP; // domain tabs + extra gap
  const chartHeight = Math.max(
    120, // never collapse below 120px regardless of size
    totalPx - PADDING - HEADER - GAP * 2 - DOMAIN_ROW,
  );

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
      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <p
          style={{
            fontSize: "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            color: "var(--theme-text-primary)",
            margin: 0,
            lineHeight: 1.2,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Lead Volume<span className="page-title-dot">.</span>
        </p>

        {/* Period tabs — This Month | This Week (default) | Today */}
        <Tabs
          value={period}
          onValueChange={(v) => handlePeriodChange(v as VolumePeriod)}
          variant="pill"
          indicatorLayoutId="lead-volume-period"
          style={{
            flexShrink: 0,
            opacity: isPending ? 0.6 : 1,
            pointerEvents: isPending ? "none" : undefined,
          }}
        >
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Chart — fills remaining space dynamically ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          opacity: isPending ? 0.5 : 1,
          transition: "opacity 200ms",
        }}
      >
        {!loaded ? null : isMultiMode ? (
          multiSeries.length === 0 ? (
            <ChartEmpty height={chartHeight} />
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart
                data={multiSeries}
                margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
              >
                <CartesianGrid
                  horizontal
                  vertical={false}
                  stroke="var(--theme-paper-border)"
                  strokeDasharray="none"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--theme-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--theme-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip
                  content={(props) => (
                    <MultiLineTooltip
                      active={props.active}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      payload={props.payload as any}
                      label={props.label as string}
                      colors={GIA_DOMAINS.map((d, i) => getDomainColor(d, i))}
                    />
                  )}
                  cursor={{
                    stroke: "var(--theme-paper-border)",
                    strokeWidth: 1,
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "6px" }}
                  formatter={(value) => (
                    <span
                      style={{
                        color: "var(--theme-text-secondary)",
                        fontSize: 10,
                      }}
                    >
                      {DOMAIN_LABELS[value as GiaDomain] ?? value}
                    </span>
                  )}
                />
                {GIA_DOMAINS.map((d, i) => (
                  <Line
                    key={d}
                    type="monotone"
                    dataKey={d}
                    stroke={getDomainColor(d, i)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: getDomainColor(d, i),
                      stroke: "var(--theme-paper)",
                      strokeWidth: 2,
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        ) : singleSeries.length === 0 ? (
          <ChartEmpty height={chartHeight} />
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart
              data={singleSeries}
              margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
            >
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="var(--theme-paper-border)"
                strokeDasharray="none"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--theme-text-tertiary)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--theme-text-tertiary)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={(v) => formatCompact(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--theme-paper)",
                  border: "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-2)",
                  fontSize: "var(--text-xs)",
                  color: "var(--theme-text-primary)",
                }}
                cursor={{ stroke: "var(--theme-paper-border)", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={chartColors[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: chartColors[0],
                  stroke: "var(--theme-paper)",
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Domain picker + period totals (admin/founder) ── */}
      {!isManagerRole && (
        <Tabs
          value={domainMode}
          onValueChange={(v) => handleDomainChange(v as DomainMode)}
          variant="connected"
          indicatorLayoutId="lead-volume-domain"
          style={{
            flexShrink: 0,
            opacity: isPending ? 0.6 : 1,
            pointerEvents: isPending ? "none" : undefined,
            width: "100%",
          }}
        >
          <TabsList style={{ width: "100%" }}>
            {(["all", ...GIA_DOMAINS] as DomainMode[]).map((mode) => {
              const isActive = domainMode === mode;
              const count = loaded
                ? domainTabCount(mode, domainMode, multiData, singleData)
                : undefined;

              return (
                <TabsTrigger
                  key={mode}
                  value={mode}
                  style={{
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    padding: "4px 8px",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {count !== undefined && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--weight-semibold)",
                        fontVariantNumeric: "tabular-nums",
                        color: isActive
                          ? "var(--theme-text-primary)"
                          : "var(--theme-text-secondary)",
                        lineHeight: 1,
                      }}
                    >
                      {formatCount(count)}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "var(--text-2xs)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                      color: isActive
                        ? "var(--theme-text-primary)"
                        : "var(--theme-text-tertiary)",
                    }}
                  >
                    {mode === "all" ? "All" : DOMAIN_LABELS[mode]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}
    </div>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "var(--text-sm)",
          color: "var(--theme-text-tertiary)",
          margin: 0,
        }}
      >
        No leads in this period.
      </p>
    </div>
  );
}
