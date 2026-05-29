'use client';

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useChartTokens } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';

export interface DonutSlice {
  label: string;
  value: number;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  loading?: boolean;
  themeKey?: string;
  showLegend?: boolean;
  /** Optional label rendered in the donut centre */
  centerLabel?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function DonutChart({
  data,
  height = 240,
  loading = false,
  themeKey,
  showLegend = true,
  centerLabel,
  className,
  style,
}: DonutChartProps) {
  const tokens = useChartTokens(themeKey);

  if (loading) return <ChartSkeleton height={height} />;

  return (
    <div
      className={className}
      style={{
        background:   'var(--theme-paper)',
        borderRadius: 'var(--radius-md)',
        position:     'relative',
        ...style,
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={55}
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
        </PieChart>
      </ResponsiveContainer>

      {centerLabel && (
        <div
          style={{
            position:       'absolute',
            top:            '50%',
            left:           '50%',
            transform:      'translate(-50%, -50%)',
            textAlign:      'center',
            pointerEvents:  'none',
          }}
        >
          {centerLabel}
        </div>
      )}
    </div>
  );
}
