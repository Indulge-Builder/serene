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
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useChartTokens, resolveColorMap } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';
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
  height?: number;
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
  height = 240,
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

  if (loading) return <ChartSkeleton height={height} />;

  const lastSeriesIdx = series.length - 1;
  // Use resolved map when available, fall back to raw colorMap then tokens
  const effectiveColorMap = resolvedColorMap ?? colorMap;
  const hasColorMap = !!effectiveColorMap;

  const chartMargin = {
    top:    margin?.top    ?? 8,
    right:  margin?.right  ?? 8,
    bottom: margin?.bottom ?? 0,
    left:   margin?.left   ?? 0,
  };

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
        <RechartsBarChart
          data={data}
          margin={chartMargin}
          {...(barCategoryGap !== undefined ? { barCategoryGap } : {})}
        >
          <CartesianGrid
            stroke={tokens.grid}
            strokeDasharray="3 3"
            vertical={false}
            {...gridProps}
          />
          <XAxis
            dataKey={xKey}
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            {...xAxisProps}
          />
          <YAxis
            tick={{ fill: tokens.axisLabel, fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            {...yAxisProps}
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
            {...tooltipProps}
          />
          {/* Suppress built-in legend when caller provides colorMap (caller owns legend) */}
          {series.length > 1 && !hasColorMap && (
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: tokens.axisLabel }}
            />
          )}
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
              </Bar>
            );
          })}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
