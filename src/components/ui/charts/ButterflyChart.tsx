'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';

export interface ButterflyRow {
  label: string;
  left: number;
  right: number;
}

export interface ButterflyChartProps {
  data: ButterflyRow[];
  leftLabel?: string;
  rightLabel?: string;
  height?: number;
  loading?: boolean;
  themeKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Butterfly (population pyramid) chart.
 * Left series uses negative values so bars extend leftward.
 * XAxis formatter strips the leading minus sign on display.
 */
export function ButterflyChart({
  data,
  leftLabel = 'Left',
  rightLabel = 'Right',
  height = 300,
  loading = false,
  themeKey,
  className,
  style,
}: ButterflyChartProps) {
  const tokens = useChartTokens(themeKey);

  if (loading) return <ChartSkeleton height={height} />;

  const chartData = data.map((row) => ({
    label: row.label,
    [leftLabel]:  -Math.abs(row.left),
    [rightLabel]: Math.abs(row.right),
  }));

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
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 8, right: 16, bottom: 0, left: 16 }}
          stackOffset="sign"
        >
          <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => String(Math.abs(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            width={60}
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
            formatter={(v, name) => [typeof v === 'number' ? Math.abs(v) : v, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel }}
          />
          <Bar dataKey={leftLabel}  fill={tokens.series[0]} stackId="butterfly" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={`left-${i}`} fill={tokens.series[0]} />
            ))}
          </Bar>
          <Bar dataKey={rightLabel} fill={tokens.series[1]} stackId="butterfly" radius={[4, 0, 0, 4]}>
            {chartData.map((_, i) => (
              <Cell key={`right-${i}`} fill={tokens.series[1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
