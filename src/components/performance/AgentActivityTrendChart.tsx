'use client';

// Daily activity trend for the agent self-scorecard (replaces the old
// single-series AgentCallTrendChart). Period-scoped MULTI-series — Calls ·
// Notes · Won (≤3 series, so ≤3 colours, V-rule) — over the selected range.
// When the range is too short to plot a period series (period === 'today',
// ≤1 bucket) it falls back to the pulse's existing 14-day call trend so the
// panel never renders a single dot — no extra fetch (that data is already
// loaded). Composes ChartFrame + cartesianDefaults (the Cartesian frame rule);
// only the series renderers are local.

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  ChartFrame,
  cartesianDefaults,
  CARTESIAN_MARGIN,
} from '@/components/ui/charts/CartesianChartFrame';
import { useChartTokens } from '@/components/ui/charts/useChartTokens';
import { formatDate } from '@/lib/utils/dates';
import type { AgentTrendPoint } from '@/lib/services/performance-service';

type Props = {
  /** Period daily series (oldest first). When < 2 points, fallback14d renders. */
  trend: AgentTrendPoint[];
  /** The pulse's 14-day call trend — rendered when the period series is too short. */
  fallback14d?: { day: string; count: number }[];
};

export function AgentActivityTrendChart({ trend, fallback14d }: Props) {
  const tokens   = useChartTokens();
  const defaults = cartesianDefaults(tokens);

  // Colour assignment mirrors the retired EffortGrid so the meaning carries:
  // Calls = success (green), Notes = accent, Won = info.
  const callsColor = tokens.series[2];
  const notesColor = tokens.series[0];
  const wonColor   = tokens.series[1];

  // Fall back to the single-series 14-day call trend when the period series
  // can't plot meaningfully (one point).
  if (trend.length < 2) {
    const data = (fallback14d ?? []).map((d) => ({
      label: formatDate(d.day, 'dd MMM'),
      count: d.count,
    }));
    return (
      <ChartFrame height={180}>
        <AreaChart data={data} margin={CARTESIAN_MARGIN}>
          <defs>
            <linearGradient id="agent-activity-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={callsColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={callsColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...defaults.grid} />
          <XAxis dataKey="label" {...defaults.axis} interval="preserveStartEnd" />
          <YAxis {...defaults.axis} allowDecimals={false} width={28} />
          <Tooltip {...defaults.tooltip} />
          <Area
            type="monotone"
            dataKey="count"
            name="Calls"
            stroke={callsColor}
            strokeWidth={1.5}
            fill="url(#agent-activity-trend-fill)"
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive
          />
        </AreaChart>
      </ChartFrame>
    );
  }

  const data = trend.map((d) => ({
    label: formatDate(d.day, 'dd MMM'),
    calls: d.calls,
    notes: d.notes,
    won:   d.leadsWon,
  }));

  return (
    <ChartFrame height={180}>
      <LineChart data={data} margin={CARTESIAN_MARGIN}>
        <CartesianGrid {...defaults.grid} />
        <XAxis dataKey="label" {...defaults.axis} interval="preserveStartEnd" />
        <YAxis {...defaults.axis} allowDecimals={false} width={28} />
        <Tooltip {...defaults.tooltip} />
        <Legend {...defaults.legend} />
        <Line type="monotone" dataKey="calls" name="Calls" stroke={callsColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive />
        <Line type="monotone" dataKey="notes" name="Notes" stroke={notesColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive />
        <Line type="monotone" dataKey="won"   name="Won"   stroke={wonColor}   strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive />
      </LineChart>
    </ChartFrame>
  );
}
