'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { EffortGrid } from './EffortGrid';
import { AgentRecentActivityList } from './AgentRecentActivityList';
import {
  getAgentSelfMetricsAction,
  getAgentPulseAction,
  type AgentSelfMetrics,
} from '@/lib/actions/performance';
import { formatCurrencyCompact, formatCount } from '@/lib/utils/numbers';
import { ENTER_DURATION, PAGE_DURATION, EASE_OUT_EXPO, EASE_IN_OUT } from '@/lib/constants/motion';
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

type PeriodOption = {
  id:    PerformancePeriod;
  label: string;
};

const PERIOD_OPTIONS: PeriodOption[] = [
  { id: 'today',      label: 'Today'      },
  { id: 'this_week',  label: 'This Week'  },
  { id: 'this_month', label: 'This Month' },
  { id: 'custom',     label: 'Custom'     },
];

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: 'overview', label: 'Overview'   },
  { id: 'today',    label: 'Today'      },
];

// ─────────────────────────────────────────────
// Period selector — chevron-style inline buttons
// ─────────────────────────────────────────────

function PeriodSelector({
  period,
  onChange,
  disabled,
}: {
  period:   PerformancePeriod;
  onChange: (p: PerformancePeriod) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-1)',
        background:     'var(--theme-paper-subtle)',
        border:         '1px solid var(--theme-paper-border)',
        borderRadius:   'var(--radius-full)',
        padding:        '3px',
        opacity:        disabled ? 0.6 : 1,
        transition:     'opacity var(--duration-fast) var(--ease-in-out)',
        pointerEvents:  disabled ? 'none' : undefined,
      }}
    >
      {PERIOD_OPTIONS.map((opt, idx) => {
        const isActive = period === opt.id;
        const isLast   = idx === PERIOD_OPTIONS.length - 1;
        return (
          <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onChange(opt.id)}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          '3px',
                padding:      '5px 14px',
                borderRadius: 'var(--radius-full)',
                border:       'none',
                cursor:       'pointer',
                background:   isActive
                  ? 'var(--theme-paper)'
                  : 'transparent',
                boxShadow:    isActive ? 'var(--shadow-1)' : 'none',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                fontWeight:   isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                color:        isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
                transition:   'background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)',
                whiteSpace:   'nowrap',
              }}
            >
              {opt.label}
            </button>
            {!isLast && (
              <ChevronRight
                aria-hidden="true"
                style={{
                  width:   12,
                  height:  12,
                  color:   'var(--theme-paper-border)',
                  flexShrink: 0,
                  strokeWidth: 2,
                  marginLeft: '2px',
                  marginRight: '2px',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Content tab bar — Overview / Today
// ─────────────────────────────────────────────

function ContentTabBar({
  activeTab,
  onChange,
}: {
  activeTab: ContentTab;
  onChange:  (t: ContentTab) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--theme-paper-border)', marginBottom: 'var(--space-5)' }}>
      {CONTENT_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              padding:        'var(--space-2) var(--space-4)',
              border:         'none',
              background:     'transparent',
              cursor:         'pointer',
              fontFamily:     'var(--font-sans)',
              fontSize:       'var(--text-sm)',
              fontWeight:     isActive ? 'var(--weight-semibold)' : 'var(--weight-normal)',
              color:          isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
              borderBottom:   isActive ? '2px solid var(--theme-accent)' : '2px solid transparent',
              marginBottom:   '-1px',
              transition:     'color var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
              whiteSpace:     'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

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
  // selected period; fall back to the period effort count only for 'today'.
  const callsToday = pulse?.callsToday.total;
  const notesToday = data.effort.notesWritten;

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
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-display)', fontWeight: 'var(--weight-light)', color: 'var(--theme-text-primary)', lineHeight: 1 }}>
            {notesToday}
          </span>
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

function OverviewTab({ data, showTodayRow }: { data: AgentSelfMetrics | null; showTodayRow: boolean }) {
  if (!data) return <MetricsSkeleton />;

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
            { label: 'Calls',  value: data.effort.callsLogged   },
            { label: 'Notes',  value: data.effort.notesWritten  },
            { label: 'Won',    value: data.core.leadsWon        },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-light)', color: 'var(--theme-text-primary)', lineHeight: 1 }}>
                {value}
              </span>
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
  initialData: AgentSelfMetrics;
};

export function AgentPerformanceShell({ agentId: _agentId, initialData }: Props) {
  const [period, setPeriod]       = useState<PerformancePeriod>('this_month');
  const [activeTab, setActiveTab] = useState<ContentTab>('overview');
  const [data, setData]           = useState<AgentSelfMetrics>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition]       = useTransition();

  // Custom date state
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo]     = useState<Date | null>(null);

  // Today-tab pulse (calls split, 14-day trend, period deals) — fetched on
  // first Today-tab open and refetched on period/date change while visible.
  const [pulse, setPulse] = useState<AgentTodayPulse | null>(null);

  // Track whether this is the first render (use initialData, no fetch)
  const hasFetched = useRef(false);

  useEffect(() => {
    // Skip the first mount — we already have initialData for 'this_month'
    if (!hasFetched.current) {
      hasFetched.current = true;
      if (period === 'this_month') return;
    }

    let cancelled = false;
    setIsLoading(true);

    startTransition(async () => {
      const from = period === 'custom' ? customFrom?.toISOString() : undefined;
      const to   = period === 'custom' ? customTo?.toISOString()   : undefined;
      const result = await getAgentSelfMetricsAction(period, from, to);
      if (cancelled) return;
      setIsLoading(false);
      if (result.data) setData(result.data);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // Pulse fetch — only while the Today tab is visible. Plain promise chain
  // with a cancelled ref (no startTransition — would defer setPulse(null)).
  const showingToday = period === 'today' || activeTab === 'today';
  useEffect(() => {
    if (!showingToday) return;

    let cancelled = false;
    setPulse(null);

    const from = period === 'custom' ? customFrom?.toISOString() : undefined;
    const to   = period === 'custom' ? customTo?.toISOString()   : undefined;
    getAgentPulseAction(period, from, to)
      .then((result) => {
        if (cancelled) return;
        if (result.data) setPulse(result.data);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingToday, period, customFrom, customTo]);

  function handlePeriodChange(p: PerformancePeriod) {
    if (p === period) return;
    // When switching to today tab, mirror it
    if (p === 'today') setActiveTab('today');
    setPeriod(p);
  }

  // When 'today' period is selected and user clicks 'Today' tab, always show today content
  // When overview is active but period is 'today', overview shows today metrics
  const effectiveTab: ContentTab =
    period === 'today' ? 'today' : activeTab;

  // Overview tab shows a "Calls Today" snapshot row when not already in 'today' period
  const showOverviewTodayRow = period !== 'today';

  return (
    <div>
      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div
        className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <PeriodSelector
          period={period}
          onChange={handlePeriodChange}
          disabled={isLoading}
        />

        {/* Custom date pickers */}
        <AnimatePresence>
          {period === 'custom' && (
            <motion.div
              key="custom-pickers"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <DatePicker
                value={customFrom}
                onChange={setCustomFrom}
                placeholder="From…"
                maxDate={customTo ?? undefined}
                aria-label="From date"
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>→</span>
              <DatePicker
                value={customTo}
                onChange={setCustomTo}
                placeholder="To…"
                minDate={customFrom ?? undefined}
                aria-label="To date"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Content area ────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {/* Loading bar */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              key="loading-bar"
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: PAGE_DURATION, ease: EASE_IN_OUT }}
              style={{
                position:        'absolute',
                top:             0,
                left:            0,
                right:           0,
                height:          '2px',
                background:      'var(--theme-accent)',
                borderRadius:    'var(--radius-full)',
                transformOrigin: 'left center',
                zIndex:          2,
              }}
            />
          )}
        </AnimatePresence>

        <div
          style={{
            opacity:    isLoading ? 0.5 : 1,
            transition: 'opacity 180ms var(--ease-in-out)',
            pointerEvents: isLoading ? 'none' : undefined,
          }}
        >
          {/* Tab bar — hidden when period='today' since tabs are redundant */}
          {period !== 'today' && (
            <ContentTabBar
              activeTab={effectiveTab}
              onChange={setActiveTab}
            />
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
                <OverviewTab data={data} showTodayRow={showOverviewTodayRow} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
