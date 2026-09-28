"use client";

// The client's side's messages over the period (a day at a time; one day = its 24 hours). Composes
// ChartFrame + cartesianDefaults (the Cartesian frame rule). A point opens its messages.

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import { ChartFrame, cartesianDefaults, CARTESIAN_MARGIN, niceTicks } from "@/components/ui/charts/CartesianChartFrame";
import { useChartTokens } from "@/components/ui/charts/useChartTokens";
import { READABLE_TOOLTIP } from "@/components/jokers/JokerWidget";
import type { Slot } from "@/lib/utils/client-activity";

export function MessagesLine({ slots, onPick, height = 240 }: { slots: Slot[]; onPick: (slot: Slot) => void; height?: number | string }) {
  const tokens = useChartTokens();
  const defaults = cartesianDefaults(tokens);
  const accent = tokens.series[0];
  const data = slots.map((s) => ({ label: s.label, key: s.key, messages: s.msgs }));
  const showValues = slots.length <= 14;
  const ticks = niceTicks(Math.max(0, ...slots.map((s) => s.msgs)));

  return (
    <ChartFrame height={height}>
      <AreaChart
        data={data}
        margin={{ ...CARTESIAN_MARGIN, top: 18, left: 8, right: 24, bottom: 4 }}
        onClick={(e) => {
          const i = typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : Number(e?.activeTooltipIndex);
          if (Number.isFinite(i) && slots[i]) onPick(slots[i]);
        }}
        style={{ cursor: "pointer" }}
      >
        <defs>
          <linearGradient id="jokers-activity-messages-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...defaults.grid} />
        <XAxis dataKey="label" {...defaults.axis} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...defaults.axis} allowDecimals={false} width={36} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip {...defaults.tooltip} {...READABLE_TOOLTIP} />
        <Area
          type="monotone"
          dataKey="messages"
          name="Client messages"
          stroke={accent}
          strokeWidth={2}
          fill="url(#jokers-activity-messages-fill)"
          dot={{ r: 3, fill: tokens.tooltipBg, stroke: accent, strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          isAnimationActive
        >
          {showValues && <LabelList dataKey="messages" position="top" style={{ fill: tokens.axisLabel, fontSize: 11, fontFamily: "var(--font-mono)" }} />}
        </Area>
      </AreaChart>
    </ChartFrame>
  );
}
