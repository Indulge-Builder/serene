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
  // height="100%" means "fill my flex parent" (the dashboard spatial-grid case).
  // A plain block + ResponsiveContainer height="100%" measures -1 inside a
  // flex:1/min-h-0 parent during react-grid-layout's deferred layout pass — the
  // flex chain has no resolved height at the moment Recharts measures. Fix: make
  // the frame fill the parent (position:relative) and absolutely position the
  // ResponsiveContainer (inset:0) so 100% always resolves against a concrete box.
  // Numeric heights (every non-dashboard chart) keep the original block layout.
  const isFill = height === '100%';

  return (
    <div
      className={className}
      style={{
        background:   'var(--theme-paper)',
        borderRadius: 'var(--radius-md)',
        ...(isFill
          ? { position: 'relative', width: '100%', height: '100%', minHeight: 0 }
          : null),
        ...style,
      }}
    >
      {isFill ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* initialDimension seeds a positive box on Recharts' synchronous
              first measure. The absolute-inset box + the slot's `measured` gate
              already resolve the height in the common case, but a fill chart can
              still measure -1 for one frame while the flex/grid chain settles
              (react-grid-layout's deferred layout pass) — the seed makes that
              first measure a real number instead of -1, killing the console
              warning. ResizeObserver corrects to the true size next frame. */}
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 320, height: 240 }}
          >
            {children}
          </ResponsiveContainer>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height as number | `${number}%`}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}
