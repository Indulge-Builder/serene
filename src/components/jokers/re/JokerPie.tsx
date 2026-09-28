"use client";

// A pie with a colour per slice, given by the caller (owner, 2026-09-28: different colours for each
// slice, not shades of one colour). A slice, or its legend row, opens the items it counts. Pie charts
// are exempt from the Cartesian frame.

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useChartTokens, resolveColorMap } from "@/components/ui/charts/useChartTokens";
import { cartesianDefaults } from "@/components/ui/charts/CartesianChartFrame";
import { EmptyState } from "@/components/ui/EmptyState";
import { READABLE_TOOLTIP } from "@/components/jokers/JokerWidget";

export type PieSlice = { key: string; label: string; ids: string[] };

export function JokerPie({ slices, colorOf, ariaLabel, onPick }: { slices: PieSlice[]; colorOf: (key: string, index: number) => string; ariaLabel: string; onPick: (s: PieSlice) => void }) {
  const tokens = useChartTokens();
  // The CSS expression paints the HTML legend (the same string on the server and in the browser);
  // SVG fills need the browser's resolved colour, re-resolved when the theme changes.
  const shades = useMemo(() => Object.fromEntries(slices.map((s, k) => [s.key, colorOf(s.key, k)])), [slices, colorOf]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => resolveColorMap(shades), [shades, tokens]);
  const tooltip = cartesianDefaults(tokens).tooltip;
  const data = slices.map((s) => ({ key: s.key, name: s.label, value: s.ids.length }));
  if (!data.some((d) => d.value)) return <EmptyState variant="inline" title="Nothing here for this period" description="Try a longer period or clear a filter." />;

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltip} {...READABLE_TOOLTIP} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius="78%"
              stroke={tokens.tooltipBg}
              strokeWidth={2}
              // A thin slice keeps its number in the legend only (their labels collide). The number is
              // in ink, never the slice's pastel (a pale label vanished on the paper).
              label={(p: { x?: number; y?: number; value?: number; percent?: number; textAnchor?: "start" | "middle" | "end" | "inherit" }) =>
                (p.percent ?? 0) >= 0.03 ? (
                  <text x={p.x} y={p.y} textAnchor={p.textAnchor} dominantBaseline="central" fill={tokens.axisLabel} fontSize={12} fontFamily="var(--font-mono)">{p.value}</text>
                ) : null}
              labelLine={false}
              isAnimationActive
              cursor="pointer"
              onClick={(_, i) => { const s = slices[i]; if (s) onPick(s); }}
            >
              {data.map((d) => <Cell key={d.key} fill={colors[d.key]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-1) var(--space-4)" }}>
        {slices.map((s) => (
          <button key={s.key} type="button" onClick={() => onPick(s)} style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-2)", background: "none", border: 0, padding: "var(--space-1) 0",
            font: "inherit", fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)", cursor: "pointer",
          }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: shades[s.key] }} />
            {s.label} · {s.ids.length}
          </button>
        ))}
      </div>
    </div>
  );
}
