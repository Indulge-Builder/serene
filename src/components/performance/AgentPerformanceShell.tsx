'use client';

import { useState, useEffect, Fragment } from 'react';
import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { AgentRecentActivityList } from './AgentRecentActivityList';
import {
  getAgentPulseAction,
  type AgentSelfMetrics,
} from '@/lib/actions/performance';
import { StatTile } from '@/components/ui/StatTile';
import { formatCurrencyCompact, formatCount } from '@/lib/utils/numbers';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type {
  PerformancePeriod,
  AgentTodayPulse,
  AgentTrendPoint,
} from '@/lib/services/performance-service';

// Recharts stays out of the /performance initial chunk (perf audit G-3): the
// shell + Today strip hydrate first; the chart panels stream in behind
// same-shape .skeleton placeholders.
const CoreFourGrid = dynamic(
  () => import('./CoreFourGrid').then((mod) => mod.CoreFourGrid),
  { loading: () => <KpiRowFallback /> },
);
const CallOutcomeBar = dynamic(
  () => import('./CallOutcomeBar').then((mod) => mod.CallOutcomeBar),
  { loading: () => <OutcomeBarFallback /> },
);
const AgentActivityTrendChart = dynamic(
  () => import('./AgentActivityTrendChart').then((mod) => mod.AgentActivityTrendChart),
  { loading: () => <TrendFallback /> },
);

function TrendFallback() {
  return <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />;
}

function KpiRowFallback() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--space-4)' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ height: '168px', borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

function OutcomeBarFallback() {
  return <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} />;
}

// ─────────────────────────────────────────────
// Today strip — since-IST-midnight pulse (Calls / Notes / Won). The ONE
// "today" surface, pinned to the top of the scorecard. Values arrive from the
// pulse RPC (the genuine since-midnight source); skeleton while it resolves.
// ─────────────────────────────────────────────

// Thin vertical rule between cells — mirrors DealsSummaryStrip's StatDivider
// (hidden below sm, where the 2-col grid handles separation).
function StatDivider() {
  return (
    <div
      aria-hidden="true"
      className="max-sm:hidden"
      style={{ width: '1px', alignSelf: 'stretch', background: 'var(--theme-paper-border)', margin: 'var(--space-2) 0', flexShrink: 0 }}
    />
  );
}

function TodayStrip({ pulse }: { pulse: AgentTodayPulse | null }) {
  // The SAME shared StatTile-cell bar the /deals summary strip uses — mono
  // accent value over a micro label, divided cells in one paper card. Values
  // go through the canonical formatters; null → "—" until the pulse resolves
  // (the formatter null contract — no bespoke skeleton needed).
  const cells: { label: string; value: string }[] = [
    { label: 'Calls',   value: formatCount(pulse?.callsToday.total) },
    { label: 'Notes',   value: formatCount(pulse?.notesToday) },
    { label: 'Won',     value: formatCount(pulse?.deals.dealCount) },
    { label: 'Revenue', value: formatCurrencyCompact(pulse?.deals.revenue) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>Today</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
          since midnight IST
        </span>
      </div>

      {/* Deals-style stat bar: StatTile cells + dividers in one paper card */}
      <div
        className="grid grid-cols-2 sm:flex sm:items-stretch"
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        {cells.map(({ label, value }, i) => (
          <Fragment key={label}>
            {i > 0 && <StatDivider />}
            <StatTile variant="cell" label={label} value={value} />
          </Fragment>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Pipeline line — live pipeline + period revenue, one calm row (replaces the
// retired EffortGrid live-pipeline cards + the old Today-tab pills). In
// Discussion / Nurturing are LIVE counts from the summary RPC; Revenue is the
// period deal revenue from the pulse.
// ─────────────────────────────────────────────

function PipelineLine({
  inDiscussion,
  nurturing,
  revenue,
}: {
  inDiscussion: number;
  nurturing:    number;
  revenue:      number | undefined;
}) {
  const items: { label: string; value: string | undefined; dot: string }[] = [
    { label: 'In Discussion', value: formatCount(inDiscussion), dot: 'var(--color-info)'   },
    { label: 'Nurturing',     value: formatCount(nurturing),    dot: 'var(--color-warning)' },
    { label: 'Revenue',       value: revenue === undefined ? undefined : formatCurrencyCompact(revenue), dot: 'var(--theme-accent)' },
  ];

  return (
    <div
      className="flex flex-wrap items-center"
      style={{
        gap:          'var(--space-5)',
        padding:      'var(--space-3) var(--space-5)',
        background:   'var(--theme-paper-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {items.map(({ label, value, dot }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: dot, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
            {label}
          </span>
          {value === undefined ? (
            <div className="skeleton" style={{ width: '32px', height: '16px', borderRadius: 'var(--radius-sm)' }} />
          ) : (
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>
              {value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// AgentPerformanceShell — the lean single-page self-scorecard.
//
// Layout (one scrollable column): Today strip → period KPIs → activity trend
// + pipeline line → call-outcome mix → recent activity. No tabs. The metrics
// arrive server-fetched per range (initialData + trend, key-remounted per
// range — D-2 one-RPC-per-view). The ONLY client fetch is the Today pulse,
// fired exactly once per mount (the since-IST-midnight source for the strip).
// ─────────────────────────────────────────────

type Props = {
  agentId:     string;
  agentDomain: string;
  period:      PerformancePeriod;
  customFrom:  string | null;
  customTo:    string | null;
  initialData: AgentSelfMetrics;
  /** Real daily series for the period (migration 0146) — feeds the trend chart
      and the one honest KPI sparkline (Leads Won). */
  trend:       AgentTrendPoint[];
};

export function AgentPerformanceShell({
  agentId: _agentId,
  period,
  customFrom,
  customTo,
  initialData,
  trend,
}: Props) {
  const data = initialData;

  // Today pulse — the genuine since-IST-midnight source for the Today strip and
  // the period revenue. ONE fetch per mount (the shell key-remounts per range,
  // so a range change is a fresh mount). Plain promise + cancelled ref (no
  // startTransition — it would defer setPulse(null)).
  const [pulse, setPulse] = useState<AgentTodayPulse | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAgentPulseAction(period, customFrom ?? undefined, customTo ?? undefined)
      .then((result) => {
        if (cancelled) return;
        if (result.data) setPulse(result.data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [period, customFrom, customTo]);

  // The trend chart shows the period series; when the range can't plot one
  // (today → ≤1 bucket) it falls back to the pulse's 14-day call trend.
  const showingFallbackTrend = trend.length < 2;
  const trendLabel = showingFallbackTrend ? 'Daily Calls · Last 14 Days' : 'Activity · This Period';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

      {/* ① Today strip */}
      <TodayStrip pulse={pulse} />

      {/* ② Period KPIs — the honest four (Leads Won carries the real sparkline) */}
      <CoreFourGrid
        current={data.core}
        previous={data.previous}
        benchmarks={data.benchmarks}
        wonTrend={trend.map((p) => p.leadsWon)}
      />

      {/* ③ Activity over time + live-pipeline line */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.06, ease: EASE_OUT_EXPO }}
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-1)',
          padding:      'var(--space-5)',
          display:      'flex',
          flexDirection:'column',
          gap:          'var(--space-4)',
        }}
      >
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
          {trendLabel}
        </span>
        <AgentActivityTrendChart trend={trend} fallback14d={pulse?.callTrend} />
        <PipelineLine
          inDiscussion={data.effort.inDiscussionCount}
          nurturing={data.effort.nurturingCount}
          revenue={pulse?.deals.revenue}
        />
      </motion.div>

      {/* ④ Call outcome mix — once, display-only */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.1, ease: EASE_OUT_EXPO }}
      >
        <CallOutcomeBar breakdown={data.outcomes} />
      </motion.div>

      {/* ⑤ Recent lead activity */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.16, ease: EASE_OUT_EXPO }}
      >
        <AgentRecentActivityList />
      </motion.div>
    </div>
  );
}
