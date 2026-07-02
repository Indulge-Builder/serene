"use client";

import { useCallback, useState, useEffect } from "react";
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
  getLeadVolumeByDomainsAction,
  getLeadVolumeForDomainAction,
} from "@/lib/actions/dashboard";
import { formatCompact, formatCount } from "@/lib/utils/numbers";
import { useChartTokens, resolveColorMap } from "@/components/ui/charts/useChartTokens";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  LeadVolumeSummary,
  MultiDomainVolumeSummary,
} from "@/lib/services/dashboard-service";
import type {
  DashboardLeadVolumeSummary,
  DashboardMultiDomainVolumeSummary,
} from "@/lib/types";
import { DOMAIN_LINE_COLORS } from "@/lib/constants/domain-colors";
import type { WidgetProps } from "../DashboardWidgetSlot";
import { DOMAIN_LABELS, GIA_DOMAINS } from "@/lib/constants/domains";
import type { GiaDomain } from '@/lib/constants/domains';
import type { DateRange } from "@/lib/utils/date-range";
import { resolvePresetToRange } from "@/lib/utils/date-range";
import { useDashboardCohortSync } from "@/hooks/useDashboardCohortSync";
import { useWidgetData } from "@/hooks/useWidgetData";

// One state slot for both chart modes — exactly one side is non-null at a time.
type VolumeView = {
  single: LeadVolumeSummary | null;
  multi: MultiDomainVolumeSummary | null;
};

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
  initialData,
  dateRange: dateRangeProp,
  scopeDomain,
}: WidgetProps & { dateRange?: DateRange }) {
  const isManagerRole = role === "manager";

  const dateRange: DateRange = dateRangeProp ?? resolvePresetToRange('week');

  // Single-line mode when a manager (own domain) OR admin/founder scoped to one
  // domain; multi-line ("All domains") only for admin/founder with no scope.
  const isMultiMode = !isManagerRole && scopeDomain == null;

  // Single-line seed: the manager seed lands in lead_volume; an admin/founder
  // scoped to one domain ALSO seeds lead_volume (page.tsx). Multi seed only
  // exists for the all-domains view.
  const singleSeed = !isMultiMode
    ? (initialData?.lead_volume as DashboardLeadVolumeSummary | null) ?? null
    : null;
  const multiSeed = isMultiMode
    ? (initialData?.lead_volume_multi as DashboardMultiDomainVolumeSummary | null) ?? null
    : null;
  const seed: VolumeView | null = singleSeed
    ? { single: singleSeed, multi: null }
    : multiSeed
      ? { single: null, multi: multiSeed }
      : null;

  const { series: chartColors } = useChartTokens();

  // The ONE fetcher (refresh button) — multi action for "All domains" (different
  // return shape), single-domain action when scoped to one domain.
  const loadVolume = useCallback(
    async (): Promise<{ data: VolumeView | null }> => {
      if (isMultiMode) {
        const result = await getLeadVolumeByDomainsAction(dateRange.from, dateRange.to, [...GIA_DOMAINS]);
        return { data: result.data ? { single: null, multi: result.data } : null };
      }
      // scopeDomain may be null here only for managers; the server pins them to
      // their own domain regardless of what is sent, so pass it through.
      const result = await getLeadVolumeForDomainAction(
        dateRange.from,
        dateRange.to,
        scopeDomain ?? GIA_DOMAINS[0],
      );
      return { data: result.data ? { single: result.data, multi: null } : null };
    },
    [dateRange.from, dateRange.to, isMultiMode, scopeDomain],
  );

  const { data, loaded, isPending, apply } = useWidgetData<VolumeView>({
    seed,
    fetcher: loadVolume,
    // The RSC always seeds the current scope; no mount fetch ever needed.
    autoFetch: false,
    deps: [dateRange.from, dateRange.to, scopeDomain],
  });
  const singleData = data?.single ?? null;
  const multiData = data?.multi ?? null;

  const applySingleVolume = useCallback(
    (next: LeadVolumeSummary) => apply({ single: next, multi: null }),
    [apply],
  );

  const applyMultiVolume = useCallback(
    (next: MultiDomainVolumeSummary) => apply({ single: null, multi: next }),
    [apply],
  );

  // Single-line sync when scoped (manager or admin/founder domain); multi when
  // admin/founder on "All domains". The RSC reseeds on every domain pick.
  useDashboardCohortSync(
    singleSeed,
    dateRange,
    !isMultiMode,
    applySingleVolume,
  );

  useDashboardCohortSync(
    multiSeed,
    dateRange,
    isMultiMode,
    applyMultiVolume,
  );

  const [resolvedDomainColors, setResolvedDomainColors] = useState<Record<string, string>>(
    () => resolveColorMap(DOMAIN_LINE_COLORS),
  );
  useEffect(() => {
    setResolvedDomainColors(resolveColorMap(DOMAIN_LINE_COLORS));
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setResolvedDomainColors(resolveColorMap(DOMAIN_LINE_COLORS));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Derived
  const multiSeries = multiData?.series ?? [];
  const singleSeries = singleData?.series ?? [];
  const totalInRange = isMultiMode
    ? Object.values(multiData?.totals ?? {}).reduce((s, n) => s + n, 0)
    : (singleData?.total ?? 0);

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
        height: "100%",
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
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          Lead Volume<span className="page-title-dot">.</span>
        </p>

        {loaded && (
          <div
            aria-label={`${totalInRange} leads in selected range`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexShrink: 0,
              opacity: isPending ? 0.45 : 1,
              transition: "opacity 200ms",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--theme-accent)",
                animation: "serene-page-dot-blink 2.4s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--weight-semibold)",
                color: "var(--theme-text-primary)",
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCount(totalInRange)}
            </span>
          </div>
        )}
      </div>

      {/* ── Chart — fills remaining space dynamically ── */}
      {/* position:relative + an absolute-inset inner box so ResponsiveContainer
          height="100%" resolves against a concrete pixel box — a bare flex:1
          parent reports -1 during react-grid-layout's deferred layout pass. */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          opacity: isPending ? 0.5 : 1,
          transition: "opacity 200ms",
        }}
      >
       <div style={{ position: "absolute", inset: 0 }}>
        {!loaded ? null : isMultiMode ? (
          multiSeries.length === 0 ? (
            <ChartEmpty height="100%" />
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 320, height: 240 }}
            >
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
                      colors={GIA_DOMAINS.map((d) => resolvedDomainColors[d] ?? chartColors[0])}
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
                {GIA_DOMAINS.map((d) => (
                  <Line
                    key={d}
                    type="monotone"
                    dataKey={d}
                    stroke={resolvedDomainColors[d] ?? chartColors[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: resolvedDomainColors[d] ?? chartColors[0],
                      stroke: "var(--theme-paper)",
                      strokeWidth: 2,
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        ) : singleSeries.length === 0 ? (
          <ChartEmpty height="100%" />
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 240 }}
          >
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
      </div>
    </div>
  );
}

function ChartEmpty({ height }: { height: number | string }) {
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <EmptyState title="No leads in this period." style={{ padding: 0 }} />
    </div>
  );
}
