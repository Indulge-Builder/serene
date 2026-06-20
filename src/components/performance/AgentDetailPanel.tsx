'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { m as motion, AnimatePresence }             from 'framer-motion';
import { Avatar }                              from '@/components/ui/Avatar';
import { getAgentDetailMetricsAction, getAgentFirstTouchScorecardAction } from '@/lib/actions/performance';
import { formatCompact, formatCurrency, formatCurrencyCompact } from '@/lib/utils/numbers';
import { StatAtom, STAT_PALETTES }             from '@/components/performance/StatAtom';
import { PipelineBar }                          from '@/components/performance/PipelineBar';
import { FirstTouchScorecard }                 from '@/components/performance/FirstTouchScorecard';
import { AgentCallsDrillModal }                from '@/components/performance/AgentCallsDrillModal';
import { AgentLeadsDrillModal }                from '@/components/performance/AgentLeadsDrillModal';
import { AgentDealsDrillModal }                from '@/components/performance/AgentDealsDrillModal';
import { DOMAIN_LABELS }                       from '@/lib/constants/domains';
import { ENTER_DURATION, PAGE_DURATION, EASE_OUT_EXPO, EASE_IN_OUT } from '@/lib/constants/motion';
import type { AgentRosterRow, AgentDetailMetrics } from '@/lib/types/index';
import type { AppDomain }                      from '@/lib/types/database';
import type { PerformancePeriod, FirstTouchScorecard as FirstTouchScorecardData } from '@/lib/services/performance-service';

// Recharts chunk loads in parallel with the panel's own metrics fetch (perf
// audit G-3) — the donut only renders once metrics resolve, so the placeholder
// is rarely visible. Keeps Recharts out of the /performance initial chunk.
const CallOutcomeBar = dynamic(
  () => import('./CallOutcomeBar').then((mod) => mod.CallOutcomeBar),
  { loading: () => <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} /> },
);

// ─────────────────────────────────────────────
// Skeleton atom — reusable shimmer block
// ─────────────────────────────────────────────

function Skel({ w, h, radius = 'var(--radius-sm)' }: { w: string; h: string; radius?: string }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: radius, flexShrink: 0 }}
    />
  );
}

// ─────────────────────────────────────────────
// Section wrapper — titled content card
// ─────────────────────────────────────────────

function SectionCard({
  label,
  children,
  delay = 0,
}: {
  label:    string;
  children: React.ReactNode;
  delay?:   number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        padding:      'var(--space-5)',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      <p
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
          margin:        '0 0 var(--space-4) 0',
        }}
      >
        {label}
      </p>
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// AgentDetailPanel
// ─────────────────────────────────────────────

type Props = {
  agent:       AgentRosterRow;
  domain:      AppDomain | null;
  period:      PerformancePeriod;
  customFrom?: string;
  customTo?:   string;
};

// Which drill-down modal is open. Mirrors the founder deck's DrillTarget; the
// three drill modals are the SAME ones the deck mounts (props open/agentId/
// agentName/domain/onClose). Won + Revenue both map to 'deals' (deck parity).
type DrillKind = 'calls' | 'leads' | 'deals';

export function AgentDetailPanel({ agent, domain, period, customFrom, customTo }: Props) {
  const [metrics, setMetrics]     = useState<AgentDetailMetrics | null>(null);
  const [scorecard, setScorecard] = useState<FirstTouchScorecardData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drill, setDrill]         = useState<DrillKind | null>(null);

  // Track which agent the current metrics belong to, so we know when to show
  // the full skeleton (new agent) vs the graceful dim overlay (same agent, new period).
  const metricsAgentId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const isAgentSwitch = metricsAgentId.current !== agent.id;

    // Clear metrics only on agent switch — preserves existing data during period-change refetch
    if (isAgentSwitch) {
      setMetrics(null);
      setScorecard(null);
      metricsAgentId.current = null;
      // Close any open drill modal so it can't leak the prior agent's data.
      setDrill(null);
    }
    setError(null);
    setIsLoading(true);

    getAgentDetailMetricsAction(agent.id, domain, period, customFrom, customTo)
      .then((result) => {
        if (cancelled) return;
        setIsLoading(false);
        if (result.error || !result.data) {
          setError(result.error ?? 'Failed to load.');
        } else {
          metricsAgentId.current = agent.id;
          setMetrics(result.data);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
        setError('Failed to load metrics.');
      });

    // First-touch scorecard — independent fetch on the same agent/period effect
    // (its own cached aggregate). A failure degrades silently to no card; the
    // panel's main metrics error already covers the visible failure surface.
    getAgentFirstTouchScorecardAction(agent.id, domain, period, customFrom, customTo)
      .then((result) => {
        if (cancelled) return;
        if (result.data) setScorecard(result.data);
      })
      .catch(() => { /* non-fatal — card simply does not render */ });

    return () => { cancelled = true; };
  }, [agent.id, domain, period, customFrom, customTo]);

  // When re-fetching for the same agent (period changed), dim the panel instead of showing skeleton.
  // When fetching for a new agent, show skeleton (metrics is null).
  const isRefetching = isLoading && metrics !== null;

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Period-change loading bar — thin accent pulse at the top ── */}
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
        display:        'flex',
        flexDirection:  'column',
        gap:            'var(--space-4)',
        opacity:        isRefetching ? 0.45 : 1,
        transition:     'opacity 200ms var(--ease-in-out)',
        pointerEvents:  isRefetching ? 'none' : undefined,
      }}
    >
      {/* ── Identity zone ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          padding:      'var(--space-5) var(--space-6)',
          boxShadow:    'var(--shadow-1)',
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-5)',
        }}
      >
        {/* Avatar with accent ring when selected */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar
            src={agent.avatar_url}
            name={agent.full_name}
            size="lg"
            selected
          />
          {/* Live indicator pip */}
          <span
            aria-hidden="true"
            style={{
              position:     'absolute',
              bottom:       '2px',
              right:        '2px',
              width:        '10px',
              height:       '10px',
              borderRadius: 'var(--radius-full)',
              background:   'var(--color-success)',
              border:       '2px solid var(--theme-paper)',
              display:      'block',
            }}
          />
        </div>

        {/* Name + domain */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily:   'var(--font-serif)',
              fontSize:     'var(--text-2xl)',
              fontWeight:   'var(--weight-light)',
              color:        'var(--theme-text-primary)',
              margin:       '0 0 var(--space-2) 0',
              lineHeight:   '1.1',
              letterSpacing: '-0.01em',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agent.full_name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '2px 10px',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-accent-surface)',
                border:       '1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent)',
                color:        'var(--theme-accent)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-xs)',
                fontWeight:   'var(--weight-medium)',
                letterSpacing: '0.04em',
              }}
            >
              {domain
                ? DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS]
                : DOMAIN_LABELS[agent.domain as keyof typeof DOMAIN_LABELS]}
            </span>
            {/* Total leads context */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              {agent.totalLeads} lead{agent.totalLeads !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

      </motion.div>

      {/* ── Stats row — 4 semantic cards in one line ─────────────── */}
      <AnimatePresence mode="wait">
        {metrics ? (
          <motion.div
            key="metrics"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}
          >
            <StatAtom label="Total Calls" value={formatCompact(metrics.totalCallsMade)}     paletteIndex={0} delay={0}   onClick={() => setDrill('calls')} />
            <StatAtom label="Leads"       value={formatCompact(metrics.totalLeads)}         paletteIndex={1} delay={40}  onClick={() => setDrill('leads')} />
            <StatAtom label="Won"         value={formatCompact(metrics.leadsWon)}           paletteIndex={2} delay={80}  onClick={() => setDrill('deals')} />
            <StatAtom label="Revenue"     value={formatCurrencyCompact(metrics.totalDealAmount)} paletteIndex={3} delay={120} onClick={() => setDrill('deals')} />
          </motion.div>
        ) : (
          <motion.div
            key="metrics-skel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}
          >
            {STAT_PALETTES.map((p, i) => (
              <div
                key={i}
                style={{
                  flex:         '1 1 140px',
                  height:       '68px',
                  borderRadius: 'var(--radius-lg)',
                  background:   p.bg,
                  border:       `1px solid ${p.border}`,
                  opacity:      0.5,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deal type breakdown (conditional) ─────────────────────── */}
      <AnimatePresence>
        {metrics && metrics.dealTypeBreakdown.length > 0 && (
          <SectionCard label="Deal Breakdown" delay={200}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {metrics.dealTypeBreakdown.map(({ dealType, count, totalAmount }) => (
                <span
                  key={dealType}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          '5px',
                    padding:      '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    background:   'var(--theme-paper-subtle)',
                    border:       '1px solid var(--theme-paper-border)',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-xs)',
                    color:        'var(--theme-text-secondary)',
                  }}
                >
                  <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>
                    {dealType}
                  </span>
                  <span
                    style={{
                      width:        '3px',
                      height:       '3px',
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--theme-text-tertiary)',
                      display:      'inline-block',
                      flexShrink:   0,
                    }}
                  />
                  <span>{count}</span>
                  <span
                    style={{
                      width:        '3px',
                      height:       '3px',
                      borderRadius: 'var(--radius-full)',
                      background:   'var(--theme-text-tertiary)',
                      display:      'inline-block',
                      flexShrink:   0,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--theme-text-primary)', fontWeight: 'var(--weight-medium)' }}>
                    {formatCurrency(totalAmount)}
                  </span>
                </span>
              ))}
            </div>
          </SectionCard>
        )}
      </AnimatePresence>

      {/* ── Lead pipeline ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {metrics ? (
          <SectionCard label="Lead Pipeline" delay={240}>
            <PipelineBar breakdown={metrics.pipelineBreakdown} />
          </SectionCard>
        ) : (
          <motion.div
            key="pipeline-skel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              padding:      'var(--space-5)',
            }}
          >
            <Skel w="110px" h="11px" radius="var(--radius-xs)" />
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Skel w="100%" h="10px" radius="var(--radius-full)" />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
              {[68, 52, 80, 48].map((w, i) => <Skel key={i} w={`${w}px`} h="24px" radius="var(--radius-full)" />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Call outcome breakdown ─────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {metrics ? (
          <motion.div
            key="outcomes"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: ENTER_DURATION, delay: 0.28, ease: EASE_OUT_EXPO }}
          >
            <CallOutcomeBar breakdown={metrics.callOutcomeBreakdown} />
          </motion.div>
        ) : (
          <motion.div
            key="outcomes-skel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              padding:      'var(--space-5)',
            }}
          >
            <Skel w="170px" h="11px" radius="var(--radius-xs)" />
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Skel w="100%" h="28px" radius="var(--radius-md)" />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              {[88, 64, 98, 58].map((w, i) => <Skel key={i} w={`${w}px`} h="16px" radius="var(--radius-xs)" />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── First-touch speed scorecard ───────────────────────────────────
          Below the call-outcome breakdown (per the spec). Buckets the period
          cohort by first-call business-minute speed; its own cached aggregate
          rides the same agent/period fetch. Renders only once both have resolved. */}
      <AnimatePresence>
        {metrics && scorecard && (
          <FirstTouchScorecard data={scorecard} delay={320} />
        )}
      </AnimatePresence>

      {/* ── Error state ───────────────────────────────────────────── */}
      {error && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            color:      'var(--color-danger-text)',
            margin:     0,
            padding:    'var(--space-4)',
            background: 'var(--color-danger-light)',
            borderRadius: 'var(--radius-md)',
            border:     '1px solid var(--color-danger)',
          }}
        >
          {error}
        </p>
      )}
    </div>

    {/* ── Drill-down modals — the SAME three the founder deck mounts ──────
        Each fetches ON OPEN only (props open/agentId/agentName/domain/onClose).
        Won + Revenue both open the deals modal (deck parity). Rendered OUTSIDE
        the period-refetch dim container (which sets pointerEvents:'none') — and
        they portal to document.body regardless, so open/close stays live during
        and after a period refetch. */}
    {drill === 'calls' && (
      <AgentCallsDrillModal
        open
        agentId={agent.id}
        agentName={agent.full_name}
        domain={domain}
        onClose={() => setDrill(null)}
      />
    )}
    {drill === 'leads' && (
      <AgentLeadsDrillModal
        open
        agentId={agent.id}
        agentName={agent.full_name}
        domain={domain}
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        onClose={() => setDrill(null)}
      />
    )}
    {drill === 'deals' && (
      <AgentDealsDrillModal
        open
        agentId={agent.id}
        agentName={agent.full_name}
        domain={domain}
        onClose={() => setDrill(null)}
      />
    )}
    </div>
  );
}
