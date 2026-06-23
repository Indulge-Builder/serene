'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
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
import { Pencil, Check, X } from 'lucide-react';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { DOMAIN_LINE_COLORS } from '@/lib/constants/domain-colors';
import { getDomainIcon } from '@/lib/constants/domain-icons';
import { getDomainHealthMetricsAction, upsertDomainTargetAction } from '@/lib/actions/performance';
import { GIA_DOMAINS } from '@/lib/constants/domains';
import { formatCompact, formatCurrencyCompact } from '@/lib/utils/numbers';
import { useChartTokens, resolveColorMap } from '@/components/ui/charts/useChartTokens';
import { TabSelector } from '@/components/ui/TabSelector';
import { StatAtom } from '@/components/performance/StatAtom';
import { DomainLeadsDrillModal, type DomainDrillKind } from '@/components/performance/DomainLeadsDrillModal';
import { DomainTargetMeter } from '@/components/performance/DomainTargetMeter';
import { useToast } from '@/hooks/useToast';
import { ENTER_DURATION, PAGE_DURATION, EASE_OUT_EXPO, EASE_IN_OUT } from '@/lib/constants/motion';
import type { DomainHealthCard, DomainTarget } from '@/lib/types/index';
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
  /** Monthly deals-closed targets from domain_targets (may be empty) */
  initialTargets: DomainTarget[];
  /** Deals closed THIS MONTH per domain — the meter is month-pinned and does
   *  not move with the period filter (the target is a monthly number). */
  monthDeals:     Partial<Record<AppDomain, number>>;
  /** Founder/admin only — shows the target edit affordance */
  canEditTargets: boolean;
};

// ─────────────────────────────────────────────
// Domain card
// ─────────────────────────────────────────────

function DomainStatCard({
  card,
  resolvedDotColors,
  index,
  monthDealsValue,
  target,
  canEditTargets,
  onSaveTarget,
  onTileClick,
}: {
  card:              DomainHealthCard;
  resolvedDotColors: Record<string, string>;
  index:             number;
  monthDealsValue:   number;
  target:            number | null;
  canEditTargets:    boolean;
  onSaveTarget:      (domain: AppDomain, value: number) => Promise<boolean>;
  /** Opens the shared leads drill for this domain's metric (dossier rows). */
  onTileClick:       (domain: AppDomain, kind: DomainDrillKind) => void;
}) {
  const domainColor = resolvedDotColors[card.domain] ?? 'var(--theme-accent)';
  const domainLabel = DOMAIN_LABELS[card.domain] ?? card.domain;
  const DomainIcon  = getDomainIcon(card.domain);
  const baseDelay   = index * 60;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft]         = useState('');
  const [isSaving, setIsSaving]   = useState(false);

  function startEdit() {
    setDraft(target != null && target > 0 ? String(target) : '');
    setIsEditing(true);
  }

  async function commitEdit() {
    const value = parseInt(draft, 10);
    if (isNaN(value) || value < 0) return;
    setIsSaving(true);
    const ok = await onSaveTarget(card.domain, value);
    setIsSaving(false);
    if (ok) setIsEditing(false);
  }

  return (
    <motion.div
      // Mobile: full-width scroll-snap slide; md+: plain grid cell
      className="snap-center shrink-0 w-[86%] sm:w-[70%] md:w-auto md:shrink"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: baseDelay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        background:    'var(--theme-paper)',
        border:        '1px solid var(--theme-paper-border)',
        borderRadius:  'var(--radius-lg)',
        boxShadow:     'var(--shadow-1)',
        padding:       'var(--space-5)',
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-4)',
      }}
    >
      {/* Domain header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <DomainIcon
          aria-hidden="true"
          style={{
            width:       '20px',
            height:      '20px',
            color:       domainColor,
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />

        <h2
          style={{
            fontFamily:    'var(--font-serif)',
            fontSize:      'var(--text-xl)',
            fontWeight:    'var(--weight-light)',
            color:         'var(--theme-text-primary)',
            margin:        0,
            lineHeight:    'var(--leading-snug)',
            letterSpacing: 'var(--tracking-tighter)',
            whiteSpace:    'nowrap',
            textOverflow:  'ellipsis',
            overflow:      'hidden',
            flex:          1,
            minWidth:      0,
            paddingBlock:  '1px',
          }}
        >
          {domainLabel}
        </h2>
      </div>

      {/* Stats row — each tile is a tap target opening the shared leads drill
          (rows link to the dossier), mirroring the agent panel's stat tiles.
          Leads→all · Calls→called leads · Deals Closed/Revenue→won leads. */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <StatAtom
          label="Leads"
          value={formatCompact(card.totalLeads)}
          paletteIndex={0}
          delay={baseDelay + 40}
          onClick={() => onTileClick(card.domain, 'all')}
        />
        <StatAtom
          label="Calls"
          value={formatCompact(card.totalCallsMade)}
          paletteIndex={1}
          delay={baseDelay + 80}
          onClick={() => onTileClick(card.domain, 'calls')}
        />
        <StatAtom
          label="Deals Closed"
          value={formatCompact(card.totalDeals)}
          paletteIndex={2}
          delay={baseDelay + 120}
          onClick={() => onTileClick(card.domain, 'won')}
        />
        <StatAtom
          label="Revenue"
          value={formatCurrencyCompact(card.totalRevenue)}
          paletteIndex={3}
          delay={baseDelay + 160}
          onClick={() => onTileClick(card.domain, 'won')}
        />
      </div>

      {/* Target meter row — month-pinned (target is a monthly number) */}
      <div
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        'var(--space-5)',
          paddingTop: 'var(--space-3)',
          borderTop:  '1px solid var(--theme-paper-border)',
        }}
      >
        <DomainTargetMeter value={monthDealsValue} target={target} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, minWidth: 0 }}>
          <span
            className="label-micro"
            style={{ color: 'var(--theme-text-tertiary)' }}
          >
            Deals vs Target · This Month
          </span>

          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="number"
                min={0}
                value={draft}
                autoFocus
                disabled={isSaving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitEdit();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                aria-label={`Monthly deals target for ${domainLabel}`}
                className="serene-input"
                style={{
                  width:        '88px',
                  padding:      'var(--space-1) var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  border:       '1px solid var(--theme-paper-border)',
                  background:   'var(--theme-paper)',
                  color:        'var(--theme-text-primary)',
                  fontFamily:   'var(--font-mono)',
                  fontSize:     'var(--text-sm)',
                }}
              />
              <button
                type="button"
                onClick={() => void commitEdit()}
                disabled={isSaving}
                aria-label="Save target"
                style={{
                  display: 'inline-flex',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-success)', padding: 'var(--space-1)',
                }}
              >
                <Check style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                aria-label="Cancel target edit"
                style={{
                  display: 'inline-flex',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--theme-text-tertiary)', padding: 'var(--space-1)',
                }}
              >
                <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-secondary)',
                }}
              >
                {target != null && target > 0
                  ? `Target ${formatCompact(target)} deals`
                  : 'No monthly target'}
              </span>
              {canEditTargets && (
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label={`Edit monthly deals target for ${domainLabel}`}
                  style={{
                    display: 'inline-flex',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--theme-text-tertiary)', padding: 'var(--space-1)',
                  }}
                >
                  <Pencil style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                </button>
              )}
            </div>
          )}
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

export function DomainOverviewPanel({
  initialData,
  period,
  customFrom,
  customTo,
  initialTargets,
  monthDeals,
  canEditTargets,
}: Props) {
  const toast = useToast;
  const [data, setData]               = useState<DomainHealthCard[]>(initialData);
  const [activeMetric, setMetric]     = useState<MetricKey>('leads');
  const [isRefetching, setRefetching] = useState(false);
  const [, startTransition]           = useTransition();
  const isMountedRef                  = useRef(false);

  // Domain-card tile drill — one modal at the panel level (the AgentDetailPanel
  // pattern), fetch-on-open. null = closed.
  const [drill, setDrill] = useState<{ domain: AppDomain; kind: DomainDrillKind } | null>(null);

  // domain → monthly deals-closed target (null = not set)
  const [targets, setTargets] = useState<Partial<Record<AppDomain, number>>>(() =>
    Object.fromEntries(initialTargets.map((t) => [t.domain, t.target_value])),
  );

  async function handleSaveTarget(domain: AppDomain, value: number): Promise<boolean> {
    const result = await upsertDomainTargetAction(domain, value);
    if (result.error || !result.data) {
      toast.danger('Target not saved', { message: result.error ?? undefined });
      return false;
    }
    setTargets((prev) => ({ ...prev, [domain]: result.data!.target_value }));
    toast.success('Target updated');
    return true;
  }

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
          opacity:       isRefetching ? 0.5 : 1,
          transition:    'opacity 200ms ease-in-out',
          pointerEvents: isRefetching ? 'none' : undefined,
        }}
      >
        {/* Domain cards — md+: 2×2 grid; below md: full-width scroll-snap
            carousel (CSS only, no library) */}
        <div
          className="flex overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible"
          style={{
            gap:                     'var(--space-4)',
            marginBottom:            'var(--space-6)',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth:          'none',
          }}
        >
          {(GIA_DOMAINS as readonly AppDomain[]).map((domain, index) => {
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
              totalDeals:     0,
            };
            return (
              <DomainStatCard
                key={domain}
                card={card}
                resolvedDotColors={resolvedDotColors}
                index={index}
                monthDealsValue={monthDeals[domain] ?? 0}
                target={targets[domain] ?? null}
                canEditTargets={canEditTargets}
                onSaveTarget={handleSaveTarget}
                onTileClick={(d, kind) => setDrill({ domain: d, kind })}
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
          {/* Metric toggle — shared TabSelector (accent). Distinct
              indicatorLayoutId from the founder shell's pill (co-mounted on the
              Domains tab) so Framer's shared-layout pill never jumps groups. */}
          <TabSelector
            tabs={(['leads', 'calls', 'revenue'] as MetricKey[]).map((m) => ({
              id: m,
              label: metricLabel[m],
            }))}
            activeTab={activeMetric}
            onChange={(id) => setMetric(id as MetricKey)}
            variant="accent"
            indicatorLayoutId="domain-metric-toggle"
            style={{ marginBottom: 'var(--space-5)' }}
          />

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

      {/* Domain-card tile drill — the leads behind the clicked metric, each row a
          dossier Link. Portals to document.body (DrillModalShell), so it stays
          interactive through the refetch dim above. */}
      <DomainLeadsDrillModal
        open={drill !== null}
        domain={drill?.domain ?? null}
        kind={drill?.kind ?? null}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        onClose={() => setDrill(null)}
      />
    </motion.div>
  );
}
