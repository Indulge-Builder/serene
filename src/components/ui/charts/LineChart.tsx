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
  ResponsiveContainer,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';

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

  return (
    <div
      className={className}
      style={{
        background:   'var(--theme-paper)',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background:   tokens.tooltipBg,
              border:       `1px solid ${tokens.tooltipBorder}`,
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-2)',
              fontSize:     12,
              fontFamily:   'var(--font-sans)',
            }}
            labelStyle={{ color: tokens.axisLabel }}
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel }}
            />
          )}
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
      </ResponsiveContainer>
    </div>
  );
}
