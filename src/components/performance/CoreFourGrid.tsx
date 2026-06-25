"use client";

import { m as motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Trophy, Zap, Clock, Target } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type {
  CoreFourMetrics,
  TeamBenchmarks,
} from "@/lib/services/performance-service";
import { formatDuration } from "@/lib/utils/dates";
import { formatPercent, formatCount } from "@/lib/utils/numbers";
import { EXIT_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";
import { useChartTokens } from "@/components/ui/charts/useChartTokens";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Thin alias kept because formatPct is also passed as a formatter fn to makeBenchmarkLine.
const formatPct = (value: number | null): string =>
  formatPercent(value, { multiplied: true });

function computeDelta(
  current: number | null,
  previous: number | null,
): { sign: "+" | "-" | "="; value: string; pct: number } | null {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { sign: "=", value: "0%", pct: 0 };
  const pct = previous !== 0 ? Math.abs(diff / previous) * 100 : 100;
  const val = `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
  return { sign: diff > 0 ? "+" : "-", value: val, pct };
}

// ─────────────────────────────────────────────
// Card config
// ─────────────────────────────────────────────

type BenchmarkLine = {
  displayValue: string;
  agentCount: number;
  agentBeats: boolean;
};

type CardConfig = {
  eyebrow: string;
  value: string;
  delta: ReturnType<typeof computeDelta>;
  subLabel: string;
  icon: React.ElementType;
  benchmarkLine: BenchmarkLine | null;
  // Real daily series (migration 0146) — present only for count metrics where a
  // daily trend is honest (Leads Won). Rate cards omit it (a daily rate off 0-2
  // closes is noise, not trend). Absent/empty → no sparkline rendered.
  sparkData?: { v: number }[];
  // Whether a higher value is better (false = lower is better, e.g. response time)
  higherIsBetter: boolean;
};

// ─────────────────────────────────────────────
// Mini sparkline
// ─────────────────────────────────────────────

function MiniSparkline({
  data,
  color,
  height = 44,
}: {
  data: { v: number }[];
  color: string;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height, minWidth: 0 }}>
      <ResponsiveContainer
        width="100%"
        height={height}
        minWidth={0}
        initialDimension={{ width: 160, height }}
      >
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-grad-${color.replace(/[^a-z0-9]/gi, "")})`}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip content={() => null} />
      </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Single metric card
// Deliberately NOT ui/StatTile (dry-audit L-8): the delta/sparkline/motion
// decoration is this card's own anatomy. Plain stat tiles compose StatTile.
// ─────────────────────────────────────────────

function MetricCard({
  eyebrow,
  value,
  delta,
  subLabel,
  icon: Icon,
  delay,
  benchmarkLine,
  sparkData,
  higherIsBetter,
  sparkColor,
}: CardConfig & { delay: number; sparkColor: string }) {
  const hasSpark = !!sparkData && sparkData.some((d) => d.v > 0);

  const isPositive = delta
    ? (higherIsBetter ? delta.sign === "+" : delta.sign === "-")
    : null;

  let deltaColor: string;
  let DeltaIcon: React.ElementType;
  let deltaLabel: string;

  if (!delta || delta.sign === "=") {
    deltaColor = "var(--theme-text-tertiary)";
    DeltaIcon = Minus;
    deltaLabel = "No change";
  } else if (isPositive) {
    deltaColor = "var(--color-success-text)";
    DeltaIcon = TrendingUp;
    deltaLabel = `+${delta.value} vs last period`;
  } else {
    deltaColor = "var(--color-danger-text)";
    DeltaIcon = TrendingDown;
    deltaLabel = `-${delta.value} vs last period`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: EXIT_DURATION,
        delay: delay / 1000,
        ease: EASE_OUT_EXPO,
      }}
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-1)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top row: eyebrow + icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-2xs)",
            fontWeight: "var(--weight-medium)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--theme-text-tertiary)",
            margin: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          {eyebrow}
        </p>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            background: "var(--theme-accent-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon
            style={{
              width: "14px",
              height: "14px",
              color: "var(--theme-accent)",
              strokeWidth: 1.5,
            }}
          />
        </div>
      </div>

      {/* Primary value (+ real sparkline when this metric has an honest one) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)" }}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-3xl)",
            fontWeight: "var(--weight-light)",
            color: "var(--theme-text-primary)",
            lineHeight: "var(--leading-tight)",
            margin: 0,
            flexShrink: 0,
          }}
        >
          {value}
        </p>
        {/* Sparkline — real daily series; only count metrics render it */}
        {hasSpark && (
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4px" }}>
            <MiniSparkline data={sparkData!} color={sparkColor} height={40} />
          </div>
        )}
      </div>

      {/* Delta line */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
        <DeltaIcon
          style={{
            width: "12px",
            height: "12px",
            color: deltaColor,
            strokeWidth: 2,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color: deltaColor,
          }}
        >
          {deltaLabel}
        </span>
      </div>

      {/* Benchmark line */}
      {benchmarkLine !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            paddingTop: "2px",
            borderTop: "1px solid var(--theme-paper-border)",
          }}
        >
          {benchmarkLine.agentBeats && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "5px",
                height: "5px",
                borderRadius: "var(--radius-full)",
                background: "var(--theme-accent)",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-2xs)",
              color: "var(--theme-text-tertiary)",
            }}
          >
            Domain avg. {benchmarkLine.displayValue}
            <span
              style={{
                marginLeft: "var(--space-1)",
                color: "var(--theme-text-tertiary)",
                opacity: 0.7,
              }}
            >
              · {benchmarkLine.agentCount} agents
            </span>
          </span>
        </div>
      )}

      {/* Sub-label */}
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          color: "var(--theme-text-tertiary)",
          margin: 0,
          lineHeight: "var(--leading-snug)",
        }}
      >
        {subLabel}
      </p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────

type Props = {
  current: CoreFourMetrics;
  previous: CoreFourMetrics | null;
  benchmarks: TeamBenchmarks | null;
  /** Real daily Leads-Won series (migration 0146) for the one honest sparkline.
      Rate cards (touch/response/conversion) intentionally get no series. */
  wonTrend?: number[];
};

function makeBenchmarkLine(
  agentValue: number | null,
  benchmarkValue: number | null,
  agentCount: number,
  format: (v: number | null) => string,
  lowerIsBetter = false,
): BenchmarkLine | null {
  if (benchmarkValue === null) return null;
  const agentBeats = agentValue !== null
    ? (lowerIsBetter ? agentValue < benchmarkValue : agentValue > benchmarkValue)
    : false;
  return {
    displayValue: format(benchmarkValue),
    agentCount,
    agentBeats,
  };
}

export function CoreFourGrid({ current, previous, benchmarks, wonTrend }: Props) {
  const tokens = useChartTokens();
  const bCount = benchmarks?.agentCount ?? 0;

  const cards: CardConfig[] = [
    {
      eyebrow: "Leads Won",
      value: formatCount(current.leadsWon),
      delta: previous ? computeDelta(current.leadsWon, previous.leadsWon) : null,
      subLabel: "converted this period",
      icon: Trophy,
      benchmarkLine: null,
      // The ONE honest sparkline — real daily Leads-Won series (migration 0146).
      sparkData: wonTrend?.map((v) => ({ v })),
      higherIsBetter: true,
    },
    {
      eyebrow: "Touch Rate",
      value: formatPct(current.touchRate),
      delta: previous ? computeDelta(current.touchRate, previous.touchRate) : null,
      subLabel: "of assigned leads touched",
      icon: Zap,
      benchmarkLine: benchmarks
        ? makeBenchmarkLine(current.touchRate, benchmarks.avgTouchRate, bCount, formatPct)
        : null,
      higherIsBetter: true,
    },
    {
      eyebrow: "Avg. Response Time",
      value: formatDuration(current.avgResponseTimeMinutes),
      delta: previous
        ? computeDelta(current.avgResponseTimeMinutes, previous.avgResponseTimeMinutes)
        : null,
      subLabel: "first touch after lead arrives",
      icon: Clock,
      benchmarkLine: benchmarks
        ? makeBenchmarkLine(
            current.avgResponseTimeMinutes,
            benchmarks.avgResponseTimeMinutes,
            bCount,
            formatDuration,
            true,
          )
        : null,
      higherIsBetter: false,
    },
    {
      eyebrow: "Conversion Rate",
      value: formatPct(current.conversionRate),
      delta: previous
        ? computeDelta(current.conversionRate, previous.conversionRate)
        : null,
      subLabel: "win rate vs closed leads",
      icon: Target,
      benchmarkLine: benchmarks
        ? makeBenchmarkLine(current.conversionRate, benchmarks.avgConversionRate, bCount, formatPct)
        : null,
      higherIsBetter: true,
    },
  ];

  // Sparkline colours: accent for won, info for touch rate, warning for response time, success for conversion
  const sparkColors = [
    tokens.series[0], // accent
    tokens.series[1], // info
    tokens.series[3], // warning
    tokens.series[2], // success
  ];

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      style={{
        gap: "var(--space-4)",
        alignItems: "stretch",
      }}
    >
      {cards.map((card, i) => (
        <MetricCard
          key={card.eyebrow}
          {...card}
          delay={i * 60}
          sparkColor={sparkColors[i]}
        />
      ))}
    </div>
  );
}
