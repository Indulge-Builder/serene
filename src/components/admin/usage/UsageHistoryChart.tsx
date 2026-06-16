'use client';

// UsageHistoryChart — daily active-minutes over the history window, stacked by
// domain. Models AgentCallTrendChart (the canonical Cartesian time-series
// wrapper): ChartFrame + cartesianDefaults(tokens) + CARTESIAN_MARGIN, colours
// via resolveColorMap(DOMAIN_LINE_COLORS). Lazy-loaded via next/dynamic at the
// call site so Recharts stays out of the /admin/usage initial chunk (G-3).

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import {
  ChartFrame,
  cartesianDefaults,
  CARTESIAN_MARGIN,
} from '@/components/ui/charts/CartesianChartFrame';
import { useChartTokens, resolveColorMap } from '@/components/ui/charts/useChartTokens';
import { DOMAIN_LINE_COLORS } from '@/lib/constants/domain-colors';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { formatDate } from '@/lib/utils/dates';
import { IST_OFFSET_MS } from '@/lib/utils/ist';
import type { AppDomain } from '@/lib/types/database';
import type { AgentUsageHistoryPoint } from '@/lib/types/usage';

type Props = {
  history: AgentUsageHistoryPoint[];
  /** Domains that actually appear in the data — one stacked Area per domain. */
  domains: AppDomain[];
  /** Length of the contiguous day window to render (zero-filled). Default 30. */
  windowDays?: number;
};

/** Add `n` days to a 'YYYY-MM-DD' string, returning a 'YYYY-MM-DD' string.
 *  These are IST calendar dates treated as opaque day labels — UTC-noon
 *  arithmetic keeps the date component stable across the +n shift (no zone
 *  drift, no DST since IST has none). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today's IST calendar date ('YYYY-MM-DD') — the window anchor when history
 *  is empty (canonical IST offset; never re-fork the +5:30 math). */
function todayIstDay(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function UsageHistoryChart({ history, domains, windowDays = 30 }: Props) {
  const tokens = useChartTokens();
  const defaults = cartesianDefaults(tokens);
  const domainColors = resolveColorMap(DOMAIN_LINE_COLORS);

  // Wide format: one row per day, one numeric column per domain. Aggregate
  // active minutes across all agents per (day, domain) — this is the ORG-wide
  // daily active-minute trend split by domain.
  const byDay = new Map<string, Record<string, number>>();
  for (const p of history) {
    let row = byDay.get(p.day);
    if (!row) {
      row = {};
      byDay.set(p.day, row);
    }
    row[p.domain] = (row[p.domain] ?? 0) + p.active_minutes;
  }

  // Materialise a CONTIGUOUS day axis. usage_daily only holds rows for days
  // with activity, so an org-idle day (weekend/holiday/pre-tracking) is absent
  // — left as-is, Recharts would collapse the gap and read activity straight
  // across it, distorting the slope. Anchor the window on the latest day in the
  // data (or today's IST date when empty) and walk back windowDays, zero-filling
  // every domain on each missing day so idle stretches render as real zeros.
  const present = Array.from(byDay.keys()).sort();
  const lastDay = present.length > 0 ? present[present.length - 1] : todayIstDay();
  const days: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    days.push(addDays(lastDay, -i));
  }

  const data = days.map((day) => {
    const mins = byDay.get(day) ?? {};
    const row: Record<string, string | number> = { label: formatDate(day, 'dd MMM') };
    for (const domain of domains) {
      row[domain] = mins[domain] ?? 0; // explicit 0 → the stack reads zero, never a gap
    }
    return row;
  });

  return (
    <ChartFrame height={260}>
      <AreaChart data={data} margin={CARTESIAN_MARGIN}>
        <CartesianGrid {...defaults.grid} />
        <XAxis dataKey="label" {...defaults.axis} interval="preserveStartEnd" />
        <YAxis {...defaults.axis} allowDecimals={false} width={32} />
        <Tooltip {...defaults.tooltip} />
        <Legend {...defaults.legend} />
        {domains.map((domain) => (
          <Area
            key={domain}
            type="monotone"
            dataKey={domain}
            name={DOMAIN_LABELS[domain]}
            stackId="usage"
            stroke={domainColors[domain]}
            fill={domainColors[domain]}
            fillOpacity={0.18}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive
          />
        ))}
      </AreaChart>
    </ChartFrame>
  );
}
