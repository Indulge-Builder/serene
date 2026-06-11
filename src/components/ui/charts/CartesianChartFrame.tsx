'use client';

import React from 'react';
import { ResponsiveContainer } from 'recharts';
import type { ChartTokens } from './useChartTokens';

/**
 * Shared frame for the Cartesian chart wrappers (AreaChart / LineChart / BarChart).
 *
 * Recharts resolves XAxis/YAxis/Tooltip/etc. by inspecting the *type* of the
 * chart's direct children, so those elements cannot be wrapped in a component —
 * each chart keeps its own JSX. What CAN be shared is (a) the outer paper
 * container + ResponsiveContainer, and (b) the default prop objects every
 * Cartesian chart spreads onto its grid/axes/tooltip/legend. Both live here.
 *
 * Pie/Donut/Butterfly are genuinely different shapes — they do not use this frame.
 */

/** Default chart margin shared by all Cartesian wrappers. */
export const CARTESIAN_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

export interface CartesianDefaults {
  /** Spread onto <CartesianGrid> */
  grid: { stroke: string; strokeDasharray: string; vertical: false };
  /** Spread onto <XAxis> / <YAxis> */
  axis: {
    tick: { fill: string; fontSize: number; fontFamily: string };
    axisLine: false;
    tickLine: false;
  };
  /** Spread onto <Tooltip> */
  tooltip: {
    contentStyle: React.CSSProperties;
    labelStyle: React.CSSProperties;
  };
  /** Spread onto <Legend> */
  legend: { wrapperStyle: React.CSSProperties };
}

/** Token-resolved default props for grid, axes, tooltip, and legend. */
export function cartesianDefaults(tokens: ChartTokens): CartesianDefaults {
  return {
    grid: { stroke: tokens.grid, strokeDasharray: '3 3', vertical: false },
    axis: {
      tick: { fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' },
      axisLine: false,
      tickLine: false,
    },
    tooltip: {
      contentStyle: {
        background:   tokens.tooltipBg,
        border:       `1px solid ${tokens.tooltipBorder}`,
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-2)',
        fontSize:     12,
        fontFamily:   'var(--font-sans)',
      },
      labelStyle: { color: tokens.axisLabel },
    },
    legend: {
      wrapperStyle: { fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel },
    },
  };
}

export interface ChartFrameProps {
  height: number | string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactElement;
}

/** The paper-background container + ResponsiveContainer every Cartesian chart renders. */
export function ChartFrame({ height, className, style, children }: ChartFrameProps) {
  return (
    <div
      className={className}
      style={{
        background:   'var(--theme-paper)',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
    >
      <ResponsiveContainer width="100%" height={height as number | `${number}%`}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
