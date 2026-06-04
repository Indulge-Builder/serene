'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { DOMAIN_LINE_COLORS } from '@/lib/constants/domain-colors';
import { getDomainHealthMetricsAction } from '@/lib/actions/performance';
import { GIA_DOMAINS } from '@/lib/constants/domains';
import { formatCompact, formatCurrencyCompact } from '@/lib/utils/numbers';
import { useChartTokens, resolveColorMap } from '@/components/ui/charts/useChartTokens';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { DomainHealthCard } from '@/lib/types/index';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type MetricKey = 'leads' | 'calls' | 'revenue';

type Props = {
  initialData:  DomainHealthCard[];
  period:       PerformancePeriod;
  customFrom?:  string;
  customTo?:    string;
};

// ─────────────────────────────────────────────
// Domain card
// ─────────────────────────────────────────────

function DomainStatCard({ card, resolvedDotColors }: { card: DomainHealthCard; resolvedDotColors: Record<string, string> }) {
  const dotColor = resolvedDotColors[card.domain] ?? 'var(--theme-accent)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        background:    'var(--theme-paper-subtle)',
        border:        '1px solid var(--theme-paper-border)',
        borderRadius:  'var(--radius-md)',
        boxShadow:     'var(--shadow-1)',
        padding:       'var(--space-5)',
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-3)',
      }}
    >
      {/* Domain label pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          aria-hidden="true"
          style={{
            display:      'inline-block',
            width:        '6px',
            height:       '6px',
            borderRadius: 'var(--radius-full)',
            background:   dotColor,
            flexShrink:   0,
          }}
        />
        <span
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            padding:      '2px 8px',
            borderRadius: 'var(--radius-full)',
            background:   'var(--theme-accent-surface)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            fontWeight:   'var(--weight-medium)',
            color:        'var(--theme-text-primary)',
            letterSpacing: '0.02em',
          }}
        >
          {DOMAIN_LABELS[card.domain] ?? card.domain}
        </span>
      </div>

      {/* Stats grid — 3 stats */}
      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize:   'var(--text-2xl)',
              fontWeight: 'var(--weight-light)',
              color:      'var(--theme-text-primary)',
              margin:     0,
              lineHeight: 1,
            }}
          >
            {formatCompact(card.totalLeads)}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     '3px 0 0',
            }}
          >
            Total Leads
          </p>
        </div>

        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize:   'var(--text-2xl)',
              fontWeight: 'var(--weight-light)',
              color:      'var(--theme-text-primary)',
              margin:     0,
              lineHeight: 1,
            }}
          >
            {formatCompact(card.totalCallsMade)}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     '3px 0 0',
            }}
          >
            Total Calls
          </p>
        </div>

        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize:   'var(--text-2xl)',
              fontWeight: 'var(--weight-light)',
              color:      'var(--theme-text-primary)',
              margin:     0,
              lineHeight: 1,
            }}
          >
            {formatCurrencyCompact(card.totalRevenue)}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     '3px 0 0',
            }}
          >
            Total Revenue
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Custom Recharts tooltip — never default styling
// ─────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  metric,
  tokens,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  metric: MetricKey;
  tokens: ReturnType<typeof useChartTokens>;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const formatted =
    metric === 'revenue'
      ? formatCurrencyCompact(val)
      : formatCompact(val);

  return (
    <div
      style={{
        background:   tokens.tooltipBg,
        border:       `1px solid ${tokens.tooltipBorder}`,
        borderRadius: 'var(--radius-sm)',
        boxShadow:    'var(--shadow-2)',
        padding:      'var(--space-2) var(--space-3)',
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-xs)',
        color:        'var(--theme-text-primary)',
      }}
    >
      <p style={{ margin: 0, color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-1)' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }}>
        {formatted}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// DomainOverviewPanel
// ─────────────────────────────────────────────

export function DomainOverviewPanel({ initialData, period, customFrom, customTo }: Props) {
  const [data, setData]               = useState<DomainHealthCard[]>(initialData);
  const [activeMetric, setMetric]     = useState<MetricKey>('leads');
  const [isRefetching, setRefetching] = useState(false);
  const [, startTransition]           = useTransition();
  const isMountedRef                  = useRef(false);

  // Sync when the parent re-renders with fresh server-fetched initialData (URL navigation)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Resolved chart colours — CSS vars cannot be passed as SVG fill
  const tokens = useChartTokens();
  const [resolvedAccent, setAccent]     = useState<string>(tokens.series[0]);
  const [resolvedDotColors, setDotColors] = useState<Record<string, string>>({});

  useEffect(() => {
    setAccent(tokens.series[0]);
  }, [tokens]);

  useEffect(() => {
    setDotColors(resolveColorMap(
      Object.fromEntries(
        (GIA_DOMAINS as readonly AppDomain[]).map((d) => [d, DOMAIN_LINE_COLORS[d]])
      ) as Record<string, string>
    ));
  }, []);

  // Re-fetch when period/dates change — skip first mount (initialData already current)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    let cancelled = false;
    setRefetching(true);

    startTransition(() => {});
    getDomainHealthMetricsAction(period, customFrom, customTo)
      .then((result) => {
        if (cancelled) return;
        setRefetching(false);
        if (result.data) setData(result.data);
      })
      .catch(() => {
        if (cancelled) return;
        setRefetching(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // Chart data — one entry per domain in GIA_DOMAINS order
  const chartData = (GIA_DOMAINS as readonly AppDomain[]).map((domain) => {
    const card = data.find((c) => c.domain === domain);
    return {
      name:    DOMAIN_LABELS[domain] ?? domain,
      domain,
      leads:   card?.totalLeads     ?? 0,
      calls:   card?.totalCallsMade ?? 0,
      revenue: card?.totalRevenue   ?? 0,
    };
  });

  const metricLabel: Record<MetricKey, string> = {
    leads:   'Total Leads',
    calls:   'Total Calls',
    revenue: 'Revenue',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', position: 'relative' }}
    >
      {/* Loading bar — accent pulse at top on refetch */}
      <AnimatePresence>
        {isRefetching && (
          <motion.div
            key="refetch-bar"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
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
          opacity:       isRefetching ? 0.5 : 1,
          transition:    'opacity 200ms ease-in-out',
          pointerEvents: isRefetching ? 'none' : undefined,
        }}
      >
        {/* Domain cards — 2×2 grid */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap:                 'var(--space-4)',
            marginBottom:        'var(--space-6)',
          }}
        >
          {(GIA_DOMAINS as readonly AppDomain[]).map((domain) => {
            const card = data.find((c) => c.domain === domain) ?? {
              domain,
              totalLeads:     0,
              leadsWon:       0,
              leadsLost:      0,
              callsLogged:    0,
              inDiscussion:   0,
              nurturing:      0,
              conversionRate: null,
              totalCallsMade: 0,
              totalRevenue:   0,
            };
            return (
              <DomainStatCard
                key={domain}
                card={card}
                resolvedDotColors={resolvedDotColors}
              />
            );
          })}
        </div>

        {/* Comparative bar chart */}
        <div
          style={{
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow:    'var(--shadow-1)',
            padding:      'var(--space-5)',
          }}
        >
          {/* Metric toggle */}
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            'var(--space-2)',
              marginBottom:   'var(--space-5)',
            }}
          >
            {(['leads', 'calls', 'revenue'] as MetricKey[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  padding:      '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  border:       '1px solid transparent',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   activeMetric === m ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  cursor:       'pointer',
                  transition:   'background 150ms ease, color 150ms ease, border-color 150ms ease',
                  background:   activeMetric === m ? 'var(--theme-accent-surface)' : 'transparent',
                  color:        activeMetric === m ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  borderColor:  activeMetric === m ? 'color-mix(in srgb, var(--theme-accent) 20%, transparent)' : 'transparent',
                }}
              >
                {metricLabel[m]}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid
                vertical={false}
                stroke={tokens.grid}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="name"
                tick={{ fill: tokens.axisLabel, fontSize: 11, fontFamily: 'var(--font-sans)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  activeMetric === 'revenue' ? formatCurrencyCompact(v) : formatCompact(v)
                }
                tick={{ fill: tokens.axisLabel, fontSize: 11, fontFamily: 'var(--font-sans)' }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <CustomTooltip metric={activeMetric} tokens={tokens} />
                }
                cursor={{ fill: 'color-mix(in srgb, var(--theme-accent) 6%, transparent)' }}
              />
              <Bar
                dataKey={activeMetric}
                fill={resolvedAccent}
                radius={[4, 4, 0, 0]}
                isAnimationActive
              >
                {chartData.map((entry) => (
                  <Cell key={entry.domain} fill={resolvedAccent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
