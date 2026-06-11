'use client';

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartFrame, cartesianDefaults, CARTESIAN_MARGIN } from './CartesianChartFrame';

export interface LineChartSeries {
  key: string;
  label: string;
}

export interface LineChartProps {
  data: Record<string, unknown>[];
  series: LineChartSeries[];
  xKey: string;
  height?: number;
  loading?: boolean;
  themeKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function LineChart({
  data,
  series,
  xKey,
  height = 240,
  loading = false,
  themeKey,
  className,
  style,
}: LineChartProps) {
  const tokens = useChartTokens(themeKey);

  if (loading) return <ChartSkeleton height={height} />;

  const defaults = cartesianDefaults(tokens);

  return (
    <ChartFrame height={height} className={className} style={style}>
      <RechartsLineChart data={data} margin={CARTESIAN_MARGIN}>
        <CartesianGrid {...defaults.grid} />
        <XAxis dataKey={xKey} {...defaults.axis} />
        <YAxis {...defaults.axis} />
        <Tooltip {...defaults.tooltip} />
        {series.length > 1 && <Legend {...defaults.legend} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={tokens.series[i % tokens.series.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: tokens.series[i % tokens.series.length] }}
          />
        ))}
      </RechartsLineChart>
    </ChartFrame>
  );
}
