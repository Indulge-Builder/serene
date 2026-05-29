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
  ResponsiveContainer,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';

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
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel }}
            />
          )}
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
      </ResponsiveContainer>
    </div>
  );
}
