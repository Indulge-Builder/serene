'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TabSelector } from '@/components/ui/TabSelector';
import { EffortGrid } from './EffortGrid';
import { AgentRecentActivityList } from './AgentRecentActivityList';
import {
  getAgentPulseAction,
  type AgentSelfMetrics,
} from '@/lib/actions/performance';
import { formatCurrencyCompact, formatCount } from '@/lib/utils/numbers';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { PerformancePeriod, AgentTodayPulse } from '@/lib/services/performance-service';

// Recharts stays out of the /performance initial chunk (perf audit G-3): the
// shell, period selector, and effort cards hydrate first; the two chart panels
// stream in behind same-shape placeholders (the MetricsSkeleton row shapes).
const CoreFourGrid = dynamic(
  () => import('./CoreFourGrid').then((mod) => mod.CoreFourGrid),
  { loading: () => <KpiRowFallback /> },
);
const CallOutcomeBar = dynamic(
  () => import('./CallOutcomeBar').then((mod) => mod.CallOutcomeBar),
  { loading: () => <OutcomeBarFallback /> },
);
const AgentCallTrendChart = dynamic(
  () => import('./AgentCallTrendChart').then((mod) => mod.AgentCallTrendChart),
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
// Types
// ─────────────────────────────────────────────

type ContentTab = 'overview' | 'today';

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: 'overview', label: 'Overview'   },
  { id: 'today',    label: 'Today'      },
];

// ─────────────────────────────────────────────
// Skeleton rows — matches metric card height
// ─────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* 4 KPI cards */}
      <KpiRowFallback />
      {/* 4 effort cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--space-4)' }}>
        {[1,2,3,4].map((i) => (
          <div key={i} className="skeleton" style={{ height: '108px', borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      {/* outcome bar */}
      <OutcomeBarFallback />
    </div>
  );
}

// ─────────────────────────────────────────────
// Today tab — calls today highlight + today scoped metrics
// ─────────────────────────────────────────────

function TodayTab({
  data,
  pulse,
}: {
  data:  AgentSelfMetrics | null;
  pulse: AgentTodayPulse | null;
}) {
  if (!data) return <MetricsSkeleton />;

  // The pulse RPC is the literal since-IST-midnight count regardless of the
  // selected period — both calls and notes read from it (undefined until the
  // pulse resolves → skeleton on the value below).
  const callsToday = pulse?.callsToday.total;
  const notesToday = pulse?.notesToday;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

      {/* Hero: Calls Today */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{
          gap: 'var(--space-4)',
        }}
      >
        {/* Calls Today */}
        <div
          style={{
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            padding:      'var(--space-6)',
            boxShadow:    'var(--shadow-1)',
            display:      'flex',
            flexDirection:'column',
            gap:          'var(--space-2)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--theme-text-tertiary)' }}>
            Calls Today
          </span>
          {callsToday === undefined ? (
            <div className="skeleton" style={{ width: '72px', height: '48px', borderRadius: 'var(--radius-sm)' }} />
          ) : (
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-display)', fontWeight: 'var(--weight-light)', color: 'var(--theme-text-primary)', lineHeight: 1 }}>
              {callsToday}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
            call notes logged since midnight IST
          </span>
          {pulse && pulse.callsToday.total > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {[
                { label: `${formatCount(pulse.callsToday.newLeads)} new lead${pulse.callsToday.newLeads === 1 ? '' : 's'}`, bg: 'var(--theme-accent-surface)', color: 'var(--theme-accent)' },
                { label: `${formatCount(pulse.callsToday.oldLeads)} existing`, bg: 'var(--theme-paper-subtle)', color: 'var(--theme-text-secondary)' },
              ].map(({ label, bg, color }) => (
                <span
                  key={label}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    padding:      '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    background:   bg,
                    color,
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-xs)',
                    fontWeight:   'var(--weight-medium)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Notes Today */}
        <div
          style={{
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            padding:      'var(--space-6)',
            boxShadow:    'var(--shadow-1)',
            display:      'flex',
            flexDirection:'column',
            gap:          'var(--space-2)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--theme-text-tertiary)' }}>
            Notes Today
          </span>
          {notesToday === undefined ? (
            <div className="skeleton" style={{ width: '72px', height: '48px', borderRadius: 'var(--radius-sm)' }} />
          ) : (
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-display)', fontWeight: 'var(--weight-light)', color: 'var(--theme-text-primary)', lineHeight: 1 }}>
              {notesToday}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
            all updates & notes added today
          </span>
        </div>
      </motion.div>

      {/* 14-day call trend */}
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
          gap:          'var(--space-3)',
        }}
      >
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
          Daily Calls · Last 14 Days
        </span>
        {pulse ? <AgentCallTrendChart trend={pulse.callTrend} /> : <TrendFallback />}
      </motion.div>

      {/* Today's outcome breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.08, ease: EASE_OUT_EXPO }}
      >
        <CallOutcomeBar breakdown={data.outcomes} />
      </motion.div>

      {/* Pipeline live counts + period deals */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.14, ease: EASE_OUT_EXPO }}
        style={{
          display:  'flex',
          flexWrap: 'wrap',
          gap:      'var(--space-4)',
        }}
      >
        {[
          { label: 'Leads Won',    value: String(data.core.leadsWon),            sub: null,                                                                       color: 'var(--color-success-text)',  bg: 'var(--color-success-light)'  },
          { label: 'In Discussion',value: String(data.effort.inDiscussionCount), sub: null,                                                                       color: 'var(--color-info-text)',     bg: 'var(--color-info-light)'    },
          { label: 'Nurturing',    value: String(data.effort.nurturingCount),    sub: null,                                                                       color: 'var(--color-warning-text)',  bg: 'var(--color-warning-light)' },
          // Revenue + deal count from public.deals (won_at in the active period)
          { label: 'Revenue',      value: pulse ? formatCurrencyCompact(pulse.deals.revenue) : '—', sub: pulse ? `${formatCount(pulse.deals.dealCount)} deal${pulse.deals.dealCount === 1 ? '' : 's'}` : null, color: 'var(--theme-accent)', bg: 'var(--theme-accent-surface)' },
        ].map(({ label, value, sub, color, bg }) => (
          <div
            key={label}
            style={{
              flex:         '1 1 140px',
              background:   bg,
              borderRadius: 'var(--radius-lg)',
              padding:      'var(--space-4) var(--space-5)',
              display:      'flex',
              flexDirection:'column',
              gap:          'var(--space-1)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.10em', textTransform: 'uppercase', color }}>
              {label}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-light)', color, lineHeight: 1 }}>
              {value}
            </span>
            {sub && (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color }}>
                {sub}
              </span>
            )}
          </div>
        ))}
      </motion.div>

      {/* Recent lead activity — keyset load-more */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, delay: 0.2, ease: EASE_OUT_EXPO }}
      >
        <AgentRecentActivityList />
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Overview tab — full KPI grid for the selected period
// ─────────────────────────────────────────────

function OverviewTab({ data, pulse, showTodayRow }: { data: AgentSelfMetrics | null; pulse: AgentTodayPulse | null; showTodayRow: boolean }) {
  if (!data) return <MetricsSkeleton />;

  // The "Today" strip reads since-IST-midnight numbers from the pulse RPC (the
  // genuine since-midnight source), NOT the period-scoped effort/core fields —
  // those are wrong under the "since midnight IST" label when period ≠ today.
  // Calls + Notes come from the pulse since-midnight windows; Won is the today
  // deal count. value === undefined → pulse not yet loaded → skeleton.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

      {/* Calls Today highlight row — shown when browsing a period wider than today */}
      {showTodayRow && <motion.div
        key="calls-today-row"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            'var(--space-4)',
          padding:        'var(--space-3) var(--space-5)',
          background:     'var(--theme-paper)',
          border:         '1px solid var(--theme-paper-border)',
          borderRadius:   'var(--radius-lg)',
          boxShadow:      'var(--shadow-1)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
          Today
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-6)', flex: 1 }}>
          {[
            { label: 'Calls',  value: pulse?.callsToday.total },
            { label: 'Notes',  value: pulse?.notesToday       },
            { label: 'Won',    value: pulse?.deals.dealCount  },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              {value === undefined ? (
                <div className="skeleton" style={{ width: '24px', height: '24px', borderRadius: 'var(--radius-sm)' }} />
              ) : (
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-light)', color: 'var(--theme-text-primary)', lineHeight: 1 }}>
                  {value}
                </span>
              )}
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
          since midnight IST
        </span>
      </motion.div>}

      {/* Core Four KPIs */}
      <CoreFourGrid
        current={data.core}
        previous={data.previous}
        benchmarks={data.benchmarks}
      />

      {/* Effort */}
      <EffortGrid metrics={data.effort} />

      {/* Outcomes */}
      <CallOutcomeBar breakdown={data.outcomes} />
    </div>
  );
}

// ─────────────────────────────────────────────
// AgentPerformanceShell — main export
// ─────────────────────────────────────────────

type Props = {
  agentId:     string;
  agentDomain: string;
  /** Derived by the page from the date_from/date_to URL params (the shared
      PerformanceFilters bar). The shell key-remounts per range, so these are
      effectively immutable for a given mount — no in-shell period state. */
  period:      PerformancePeriod;
  /** ISO range bounds — non-null only for an arbitrary ('custom') range. */
  customFrom:  string | null;
  customTo:    string | null;
  initialData: AgentSelfMetrics;
};

export function AgentPerformanceShell({
  agentId: _agentId,
  period,
  customFrom,
  customTo,
  initialData,
}: Props) {
  const [activeTab, setActiveTab] = useState<ContentTab>('overview');

  // Metrics arrive server-fetched for the resolved range via initialData; the
  // page key-remounts this component per range, so there is no client metrics
  // refetch effect (honours the one-RPC-per-view rule, perf audit D-2).
  const data = initialData;

  // Today-tab pulse (calls split, 14-day trend, period deals) — the genuine
  // since-IST-midnight source for BOTH the Today tab and the Overview strip.
  const [pulse, setPulse] = useState<AgentTodayPulse | null>(null);

  // Pulse fetch gate — the pulse is the genuine since-IST-midnight source for
  // BOTH the Today tab AND the Overview "Today" strip. The strip renders on the
  // Overview tab whenever period !== 'today' (showOverviewTodayRow), so the gate
  // must cover that case too — not just the Today tab. There is exactly ONE
  // pulse fetch path; widening this boolean is the whole fix (no second fetch).
  // Because one of the two conditions is always true at the current range,
  // needsPulse does not flip on a tab switch → a tab switch fires no request.
  // Plain promise chain with a cancelled ref (no startTransition — would defer
  // setPulse(null)).
  const showingTodayTab = period === 'today' || activeTab === 'today';
  const showingOverviewTodayRow = activeTab === 'overview' && period !== 'today';
  const needsPulse = showingTodayTab || showingOverviewTodayRow;
  useEffect(() => {
    if (!needsPulse) return;

    let cancelled = false;
    setPulse(null);

    getAgentPulseAction(period, customFrom ?? undefined, customTo ?? undefined)
      .then((result) => {
        if (cancelled) return;
        if (result.data) setPulse(result.data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPulse, period, customFrom, customTo]);

  // When the selected range IS today, the Today tab/content is always shown.
  // When overview is active but the range is today, overview shows today metrics.
  const effectiveTab: ContentTab =
    period === 'today' ? 'today' : activeTab;

  // Overview tab shows a "Calls Today" snapshot row when the range is not today.
  const showOverviewTodayRow = period !== 'today';

  return (
    <div>
      {/* ── Content area ────────────────────────────────────────────────
          The page renders the shared <PerformanceFilters> strip above this
          shell; the range arrives as props and the shell key-remounts per
          range (no in-shell period selector / loading bar). */}
      {/* Tab bar — hidden when the range is today (tabs redundant).
          TabSelector 'connected' variant (distinct indicatorLayoutId from
          the founder shell's pills, per the shared-layout rule). */}
      {period !== 'today' && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <TabSelector
            tabs={CONTENT_TABS}
            activeTab={effectiveTab}
            onChange={(id) => setActiveTab(id as ContentTab)}
            variant="connected"
            indicatorLayoutId="agent-content-tabs"
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {effectiveTab === 'today' ? (
          <motion.div
            key="tab-today"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
          >
            <TodayTab data={data} pulse={pulse} />
          </motion.div>
        ) : (
          <motion.div
            key="tab-overview"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
          >
            <OverviewTab data={data} pulse={pulse} showTodayRow={showOverviewTodayRow} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
