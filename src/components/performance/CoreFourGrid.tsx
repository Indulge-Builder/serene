'use client';

import { motion }                                    from 'framer-motion';
import type { CoreFourMetrics, TeamBenchmarks }       from '@/lib/services/performance-service';
import { formatDuration }                            from '@/lib/utils/dates';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatPct(value: number | null): string {
  if (value === null || value === undefined) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function computeDelta(
  current:  number | null,
  previous: number | null,
): { sign: '+' | '-' | '='; value: string } | null {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { sign: '=', value: '0%' };
  const pct  = previous !== 0 ? Math.abs(diff / previous) * 100 : 100;
  const val  = `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
  return { sign: diff > 0 ? '+' : '-', value: val };
}

// ─────────────────────────────────────────────
// Single metric card
// ─────────────────────────────────────────────

type BenchmarkLine = {
  displayValue: string;
  agentCount:   number;
  agentBeats:   boolean; // true when agent value > domain average
};

type CardProps = {
  eyebrow:       string;
  value:         string;
  delta:         ReturnType<typeof computeDelta>;
  subLabel:      string;
  delay:         number;
  benchmarkLine: BenchmarkLine | null;
};

function MetricCard({ eyebrow, value, delta, subLabel, delay, benchmarkLine }: CardProps) {
  let deltaColor: string;
  let deltaSymbol: string;
  if (!delta || delta.sign === '=') {
    deltaColor  = 'var(--theme-text-tertiary)';
    deltaSymbol = '—';
  } else if (delta.sign === '+') {
    deltaColor  = 'var(--color-success-text)';
    deltaSymbol = `↑ ${delta.value}`;
  } else {
    deltaColor  = 'var(--color-danger-text)';
    deltaSymbol = `↓ ${delta.value}`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-5)",
        boxShadow:    "var(--shadow-1)",
      }}
    >
      {/* Eyebrow — V-10 micro label */}
      <p
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      "10px",
          fontWeight:    "var(--weight-medium)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color:         "var(--theme-text-tertiary)",
          marginBottom:  "var(--space-2)",
        }}
      >
        {eyebrow}
      </p>

      {/* Primary value — Playfair serif, the moment it earns it */}
      <p
        style={{
          fontFamily:    "var(--font-serif)",
          fontSize:      "var(--text-3xl)",
          fontWeight:    "var(--weight-light)",
          color:         "var(--theme-text-primary)",
          lineHeight:    "var(--leading-tight)",
          marginBottom:  "var(--space-2)",
        }}
      >
        {value}
      </p>

      {/* Stats group: delta + benchmark — flex-col gap-1 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* Delta line */}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color:      deltaColor,
            margin:     0,
          }}
        >
          {delta ? deltaSymbol : '—'}
        </p>

        {/* Benchmark line — absent (not "—") when null */}
        {benchmarkLine !== null && (
          <>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-xs)",
                fontWeight: "var(--weight-medium)",
                color:      "var(--theme-text-tertiary)",
                margin:     0,
                display:    "flex",
                alignItems: "center",
                gap:        "5px",
              }}
            >
              {/* Accent pip — only when agent beats domain average */}
              {benchmarkLine.agentBeats && (
                <span
                  aria-hidden="true"
                  style={{
                    display:      "inline-block",
                    width:        "4px",
                    height:       "4px",
                    borderRadius: "var(--radius-full)",
                    background:   "var(--theme-accent)",
                    flexShrink:   0,
                  }}
                />
              )}
              Domain avg. {benchmarkLine.displayValue}
            </p>
            <p
              style={{
                fontFamily:    "var(--font-sans)",
                fontSize:      "10px",
                fontWeight:    "var(--weight-normal)",
                color:         "var(--theme-text-tertiary)",
                letterSpacing: "var(--tracking-wide)",
                margin:        0,
              }}
            >
              across {benchmarkLine.agentCount} agents
            </p>
          </>
        )}

        {/* Sub-label context */}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            margin:     0,
            marginTop:  benchmarkLine !== null ? "2px" : 0,
          }}
        >
          {subLabel}
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────

type Props = {
  current:    CoreFourMetrics;
  /** null when there is no meaningful prior period (all_time). Suppresses all delta badges. */
  previous:   CoreFourMetrics | null;
  /** null when agentCount < 2 or benchmarks unavailable. Suppresses benchmark lines. */
  benchmarks: TeamBenchmarks | null;
};

function makeBenchmarkLine(
  agentValue:      number | null,
  benchmarkValue:  number | null,
  agentCount:      number,
  format:          (v: number | null) => string,
): BenchmarkLine | null {
  if (benchmarkValue === null) return null;
  return {
    displayValue: format(benchmarkValue),
    agentCount,
    // For response time: lower is better, so agent beats when value < benchmark.
    // Caller sets this correctly per metric.
    agentBeats: agentValue !== null && agentValue > benchmarkValue,
  };
}

function makeBenchmarkLineInverse(
  agentValue:      number | null,
  benchmarkValue:  number | null,
  agentCount:      number,
  format:          (v: number | null) => string,
): BenchmarkLine | null {
  if (benchmarkValue === null) return null;
  return {
    displayValue: format(benchmarkValue),
    agentCount,
    // Response time: lower is better — agent beats when value < benchmark
    agentBeats: agentValue !== null && agentValue < benchmarkValue,
  };
}

export function CoreFourGrid({ current, previous, benchmarks }: Props) {
  const bCount = benchmarks?.agentCount ?? 0;

  const cards = [
    {
      eyebrow:       'Leads Won',
      value:         String(current.leadsWon),
      delta:         previous ? computeDelta(current.leadsWon, previous.leadsWon) : null,
      subLabel:      'converted this period',
      // leadsWon excluded from benchmarks by design — absolute count, not a rate
      benchmarkLine: null as BenchmarkLine | null,
    },
    {
      eyebrow:       'Touch Rate',
      value:         formatPct(current.touchRate),
      delta:         previous ? computeDelta(current.touchRate, previous.touchRate) : null,
      subLabel:      'of assigned leads touched',
      benchmarkLine: benchmarks
        ? makeBenchmarkLine(current.touchRate, benchmarks.avgTouchRate, bCount, formatPct)
        : null,
    },
    {
      eyebrow:       'Avg. Response Time',
      value:         formatDuration(current.avgResponseTimeMinutes),
      delta:         previous ? computeDelta(current.avgResponseTimeMinutes, previous.avgResponseTimeMinutes) : null,
      subLabel:      'from lead created to first touch',
      // Response time: lower is better — use inverse comparison
      benchmarkLine: benchmarks
        ? makeBenchmarkLineInverse(current.avgResponseTimeMinutes, benchmarks.avgResponseTimeMinutes, bCount, formatDuration)
        : null,
    },
    {
      eyebrow:       'Conversion Rate',
      value:         formatPct(current.conversionRate),
      delta:         previous ? computeDelta(current.conversionRate, previous.conversionRate) : null,
      subLabel:      'win rate vs closed leads',
      benchmarkLine: benchmarks
        ? makeBenchmarkLine(current.conversionRate, benchmarks.avgConversionRate, bCount, formatPct)
        : null,
    },
  ];

  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap:                 "var(--space-4)",
      }}
    >
      {cards.map((card, i) => (
        <MetricCard key={card.eyebrow} {...card} delay={i * 60} />
      ))}
    </div>
  );
}
