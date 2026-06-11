'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { useChartTokens, resolveColorMap } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartFrame, cartesianDefaults, CARTESIAN_MARGIN } from './CartesianChartFrame';
import type {
  XAxisProps,
  YAxisProps,
  TooltipProps,
  CartesianGridProps,
} from 'recharts';

export interface BarChartSeries {
  key: string;
  label: string;
  /** Override series colour index */
  colorIndex?: number;
}

export interface BarChartProps {
  data: Record<string, unknown>[];
  series: BarChartSeries[];
  xKey: string;
  height?: number | string;
  stacked?: boolean;
  loading?: boolean;
  themeKey?: string;
  /**
   * Per-key semantic colour override. Keys match the series `key` values.
   * Values are CSS variable strings (e.g. "var(--color-info)") — they are
   * resolved via getComputedStyle so SVG fill works in all browsers.
   * Partial maps are valid: unmatched keys fall back to positional token colours.
   * When provided, the built-in Recharts <Legend> is suppressed — the caller
   * owns the legend and should read from the same colorMap for swatch colours.
   */
  colorMap?: Record<string, string>;
  /** Chart-level margin override */
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  /** barCategoryGap forwarded to Recharts BarChart */
  barCategoryGap?: string | number;
  /** Optional XAxis prop overrides (merged over defaults) */
  xAxisProps?: Partial<XAxisProps>;
  /** Optional YAxis prop overrides (merged over defaults) */
  yAxisProps?: Partial<YAxisProps>;
  /** Optional Tooltip prop overrides (merged over defaults) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tooltipProps?: Partial<TooltipProps<any, any>>;
  /** Optional CartesianGrid prop overrides */
  gridProps?: Partial<CartesianGridProps>;
  className?: string;
  style?: React.CSSProperties;
}

function topRadiusBar(radius: number): [number, number, number, number] {
  return [radius, radius, 0, 0];
}

export function BarChart({
  data,
  series,
  xKey,
  height = 240 as number | string,
  stacked = false,
  loading = false,
  themeKey,
  colorMap,
  margin,
  barCategoryGap,
  xAxisProps,
  yAxisProps,
  tooltipProps,
  gridProps,
  className,
  style,
}: BarChartProps) {
  const tokens = useChartTokens(themeKey);

  // Resolve CSS variable strings in colorMap to computed hex/rgb values.
  // SVG fill does not resolve CSS custom properties in all browsers.
  const [resolvedColorMap, setResolvedColorMap] = useState<Record<string, string> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!colorMap) { setResolvedColorMap(undefined); return; }
    setResolvedColorMap(resolveColorMap(colorMap));
  }, [colorMap]);

  // Re-resolve when theme switches (same MutationObserver pattern as useChartTokens)
  useEffect(() => {
    if (!colorMap) return;
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setResolvedColorMap(resolveColorMap(colorMap));
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [colorMap]);

  if (loading) return <ChartSkeleton height={typeof height === 'number' ? height : 240} />;

  const lastSeriesIdx = series.length - 1;
  // Use resolved map when available, fall back to raw colorMap then tokens
  const effectiveColorMap = resolvedColorMap ?? colorMap;
  const hasColorMap = !!effectiveColorMap;

  const defaults = cartesianDefaults(tokens);

  const chartMargin = {
    top:    margin?.top    ?? CARTESIAN_MARGIN.top,
    right:  margin?.right  ?? CARTESIAN_MARGIN.right,
    bottom: margin?.bottom ?? CARTESIAN_MARGIN.bottom,
    left:   margin?.left   ?? CARTESIAN_MARGIN.left,
  };

  return (
    <ChartFrame height={height} className={className} style={style}>
        <RechartsBarChart
          data={data}
          margin={chartMargin}
          {...(barCategoryGap !== undefined ? { barCategoryGap } : {})}
        >
          <CartesianGrid {...defaults.grid} {...gridProps} />
          <XAxis dataKey={xKey} {...defaults.axis} {...xAxisProps} />
          <YAxis {...defaults.axis} {...yAxisProps} />
          <Tooltip {...defaults.tooltip} {...tooltipProps} />
          {/* Suppress built-in legend when caller provides colorMap (caller owns legend) */}
          {series.length > 1 && !hasColorMap && <Legend {...defaults.legend} />}
          {series.map((s, i) => {
            const positionalColor = tokens.series[(s.colorIndex ?? i) % tokens.series.length];
            const color = effectiveColorMap?.[s.key] ?? positionalColor;
            const isTop = !stacked || i === lastSeriesIdx;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color}
                stackId={stacked ? 'stack' : undefined}
                radius={isTop ? topRadiusBar(4) : [0, 0, 0, 0]}
              >
                {/* Cell colouring for non-stacked bars only; colorMap fills go on Bar directly */}
                {!stacked && !hasColorMap && data.map((_, ci) => (
                  <Cell
                    key={`cell-${ci}`}
                    fill={tokens.series[(s.colorIndex ?? i) % tokens.series.length]}
                  />
                ))}
                {/* Stacked: per-cell radius — only round the top of the last non-zero segment */}
                {stacked && data.map((row, ci) => {
                  // Find which series index is the topmost non-zero for this bar
                  let topIdx = -1;
                  for (let j = lastSeriesIdx; j >= 0; j--) {
                    if ((row[series[j].key] as number) > 0) { topIdx = j; break; }
                  }
                  const cellRadius = topIdx === i ? topRadiusBar(4) : ([0, 0, 0, 0] as [number, number, number, number]);
                  return (
                    <Cell
                      key={`cell-${ci}`}
                      fill={color}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...{ radius: cellRadius } as any}
                    />
                  );
                })}
              </Bar>
            );
          })}
        </RechartsBarChart>
    </ChartFrame>
  );
}
