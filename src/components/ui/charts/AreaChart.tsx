'use client';

import React from 'react';
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartFrame, cartesianDefaults, CARTESIAN_MARGIN } from './CartesianChartFrame';

export interface AreaChartSeries {
  key: string;
  label: string;
}

export interface AreaChartProps {
  data: Record<string, unknown>[];
  series: AreaChartSeries[];
  xKey: string;
  height?: number;
  loading?: boolean;
  stacked?: boolean;
  themeKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AreaChart({
  data,
  series,
  xKey,
  height = 240,
  loading = false,
  stacked = false,
  themeKey,
  className,
  style,
}: AreaChartProps) {
  const tokens = useChartTokens(themeKey);

  if (loading) return <ChartSkeleton height={height} />;

  const defaults = cartesianDefaults(tokens);

  return (
    <ChartFrame height={height} className={className} style={style}>
      <RechartsAreaChart data={data} margin={CARTESIAN_MARGIN}>
        <defs>
          {series.map((s, i) => {
            const color = tokens.series[i % tokens.series.length];
            return (
              <linearGradient key={s.key} id={`area-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid {...defaults.grid} />
        <XAxis dataKey={xKey} {...defaults.axis} />
        <YAxis {...defaults.axis} />
        <Tooltip {...defaults.tooltip} />
        {series.length > 1 && <Legend {...defaults.legend} />}
        {series.map((s, i) => {
          const color = tokens.series[i % tokens.series.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#area-grad-${s.key})`}
              stackId={stacked ? 'stack' : undefined}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          );
        })}
      </RechartsAreaChart>
    </ChartFrame>
  );
}
