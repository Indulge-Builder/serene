'use client';

// 14-day daily call-count trend for the agent Today view.
// Composes ChartFrame + cartesianDefaults (the Cartesian frame rule) — only
// the series renderer is local. One colour (accent).

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  ChartFrame,
  cartesianDefaults,
  CARTESIAN_MARGIN,
} from '@/components/ui/charts/CartesianChartFrame';
import { useChartTokens } from '@/components/ui/charts/useChartTokens';
import { formatDate } from '@/lib/utils/dates';

type Props = {
  /** Oldest-first daily buckets — day is an IST calendar date (YYYY-MM-DD) */
  trend: { day: string; count: number }[];
};

export function AgentCallTrendChart({ trend }: Props) {
  const tokens   = useChartTokens();
  const defaults = cartesianDefaults(tokens);
  const accent   = tokens.series[0];

  const data = trend.map((d) => ({
    label: formatDate(d.day, 'dd MMM'),
    count: d.count,
  }));

  return (
    <ChartFrame height={180}>
      <AreaChart data={data} margin={CARTESIAN_MARGIN}>
        <defs>
          <linearGradient id="agent-call-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
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
          stroke={accent}
          strokeWidth={1.5}
          fill="url(#agent-call-trend-fill)"
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive
        />
      </AreaChart>
    </ChartFrame>
  );
}
