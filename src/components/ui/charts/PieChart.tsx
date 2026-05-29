'use client';

import React from 'react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';

export interface PieSlice {
  label: string;
  value: number;
}

export interface PieChartProps {
  data: PieSlice[];
  height?: number;
  loading?: boolean;
  themeKey?: string;
  showLegend?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PieChart({
  data,
  height = 240,
  loading = false,
  themeKey,
  showLegend = true,
  className,
  style,
}: PieChartProps) {
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
        <RechartsPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={80}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell
                key={`cell-${i}`}
                fill={tokens.series[i % tokens.series.length]}
              />
            ))}
          </Pie>
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
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel }}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
