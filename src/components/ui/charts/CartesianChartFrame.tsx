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

/**
 * A tight, round y-axis for count data: the fewest whole round steps (1, 2, 2.5, 5 × 10ⁿ) that cover
 * `max` in at most `maxSteps`. A chart of ones reads 0–1, 7 reads 0–8 by 2s, 127 reads 0–150 by 50s:
 * never 0–4 for a one, never steps of 35. Pass the result as the YAxis `ticks` and its last value as
 * the domain's top.
 */
export function niceTicks(max: number, maxSteps = 5): number[] {
  if (!(max > 0)) return [0, 1];
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const m of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) {
    const step = Math.round(m * mag * 1000) / 1000;
    if (step < 1 || !Number.isInteger(step)) continue; // counts: whole steps only
    const n = Math.ceil(max / step);
    if (n <= maxSteps) return Array.from({ length: n + 1 }, (_, i) => i * step);
  }
  const step = 10 * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

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
      // Charts sit RAISED on the gradient chart panel — never in a well
      // (README §Charts; the .neu-chart-panel recipe).
      style={{
        background:   'var(--neu-input-bg)',
        border:       '1px solid var(--neu-input-edge)',
        boxShadow:    'var(--neu-shadow-input)',
        borderRadius: 'var(--radius-lg)',
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
