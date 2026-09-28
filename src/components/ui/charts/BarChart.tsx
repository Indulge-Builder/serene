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
  LabelList,
} from 'recharts';
import { useChartTokens, resolveColorMap } from './useChartTokens';
import { ChartSkeleton } from './ChartSkeleton';
import { ChartFrame, cartesianDefaults, CARTESIAN_MARGIN, niceTicks } from './CartesianChartFrame';
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
  /** Click a bar (a stacked segment names its series): drill into what it counts. */
  onBarClick?: (row: Record<string, unknown>, seriesKey: string) => void;
  /** Print each bar's value (a stacked bar: its total) above it. */
  showValues?: boolean;
  /** How a printed value reads ("35%"); the number as is by default. */
  valueFormat?: (value: number) => string;
  /**
   * Long category names (titles, people) sit straight under their bar on up to two lines of about
   * this many characters, the second ending in "…" when cut: never angled, never clipped.
   */
  wrapLabels?: number;
  /** The thickest a bar may grow (px), so a chart with few bars does not paint slabs. */
  maxBarSize?: number;
  /** The y-axis follows the data in round whole steps (niceTicks): a chart of ones reads 0–1. */
  niceAxis?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function topRadiusBar(radius: number): [number, number, number, number] {
  return [radius, radius, 0, 0];
}

/** Words into at most `max` lines of about `chars` characters; the last line ends in "…" when cut. */
function wrapWords(text: string, chars: number, max = 2): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= chars) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const kept = lines.slice(0, max).map((l) => (l.length > chars ? `${l.slice(0, chars - 1)}…` : l));
  if (lines.length > max && !kept[max - 1].endsWith('…')) kept[max - 1] = `${kept[max - 1].slice(0, chars - 1)}…`;
  return kept;
}

/** The X-axis tick for `wrapLabels`: the name centred under its bar, one tspan a line, never wider
 *  than its bar's slot (the slot = the axis width over the ticks shown, about 6px a character). */
function WrappedTick(props: { x?: number; y?: number; payload?: { value?: unknown }; width?: number; visibleTicksCount?: number; chars: number; ink: string; size: number; family: string }) {
  const slot = props.width && props.visibleTicksCount ? props.width / props.visibleTicksCount : 0;
  const chars = slot ? Math.max(4, Math.min(props.chars, Math.floor(slot / 6))) : props.chars;
  const lines = wrapWords(String(props.payload?.value ?? ''), chars);
  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <text textAnchor="middle" fill={props.ink} fontSize={props.size} fontFamily={props.family}>
        {lines.map((l, i) => <tspan key={i} x={0} dy={i === 0 ? 11 : 12}>{l}</tspan>)}
      </text>
    </g>
  );
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
  onBarClick,
  showValues = false,
  valueFormat,
  wrapLabels,
  maxBarSize,
  niceAxis = false,
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

  // Re-resolve when theme OR dark mode switches (same MutationObserver
  // pattern as useChartTokens — data-neu flips the pastel/status palettes)
  useEffect(() => {
    if (!colorMap) return;
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.type === 'attributes' &&
          (m.attributeName === 'data-theme' || m.attributeName === 'data-neu')
        ) {
          setResolvedColorMap(resolveColorMap(colorMap));
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-neu'] });
    return () => observer.disconnect();
  }, [colorMap]);

  if (loading) return <ChartSkeleton height={typeof height === 'number' ? height : 240} />;

  const lastSeriesIdx = series.length - 1;
  // Use resolved map when available, fall back to raw colorMap then tokens
  const effectiveColorMap = resolvedColorMap ?? colorMap;
  const hasColorMap = !!effectiveColorMap;

  const defaults = cartesianDefaults(tokens);

  // niceAxis: the tallest bar (a stacked bar: its total) sets a tight, round scale.
  const niceY = niceAxis
    ? (() => {
        const top = Math.max(0, ...data.map((row) =>
          stacked
            ? series.reduce((t, x) => t + Number(row[x.key] ?? 0), 0)
            : Math.max(0, ...series.map((x) => Number(row[x.key] ?? 0)))));
        const ticks = niceTicks(top);
        return { ticks, domain: [0, ticks[ticks.length - 1]] as [number, number] };
      })()
    : null;

  const chartMargin = {
    // Printed values sit above the tallest bar: give them room.
    top:    margin?.top    ?? (showValues ? 20 : CARTESIAN_MARGIN.top),
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
          <XAxis
            dataKey={xKey}
            {...defaults.axis}
            {...(wrapLabels
              ? {
                  interval: 0,
                  height: 36,
                  tick: <WrappedTick chars={wrapLabels} ink={defaults.axis.tick.fill} size={defaults.axis.tick.fontSize} family={defaults.axis.tick.fontFamily} />,
                }
              : null)}
            {...xAxisProps}
          />
          <YAxis {...defaults.axis} {...niceY} {...yAxisProps} />
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
                radius={isTop ? topRadiusBar(6) : [0, 0, 0, 0]}
                {...(maxBarSize !== undefined ? { maxBarSize } : {})}
                cursor={onBarClick ? 'pointer' : undefined}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={onBarClick ? (d: any) => onBarClick((d?.payload ?? d) as Record<string, unknown>, s.key) : undefined}
              >
                {/* Stacked: the total prints on each bar's topmost non-empty segment (an empty
                    segment is null and draws no label, so the last series alone is not enough). */}
                {showValues && (stacked || isTop) && (
                  <LabelList
                    position="top"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    valueAccessor={(e: any) => {
                      const row = (e?.payload ?? {}) as Record<string, unknown>;
                      if (stacked) {
                        let top = -1;
                        for (let j = lastSeriesIdx; j >= 0; j--) if (Number(row[series[j].key] ?? 0) > 0) { top = j; break; }
                        if (top !== i) return '';
                      }
                      const v = stacked ? series.reduce((t, x) => t + Number(row[x.key] ?? 0), 0) : Number(row[s.key] ?? 0);
                      return v ? (valueFormat ? valueFormat(v) : v) : '';
                    }}
                    style={{ fill: tokens.axisLabel, fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  />
                )}
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
                  const cellRadius = topIdx === i ? topRadiusBar(6) : ([0, 0, 0, 0] as [number, number, number, number]);
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
