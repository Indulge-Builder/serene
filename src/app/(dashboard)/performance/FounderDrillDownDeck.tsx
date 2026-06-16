'use client';

// FounderDrillDownDeck — full-screen swipeable per-agent card deck.
//
// One card per roster agent, rendered from the in-memory AgentRosterRow array
// already held by ManagerPerformancePanel — zero per-SWIPE fetch of roster
// data. Each card surfaces three metric tiles; tapping a tile opens a drill-down
// modal that fetches ON OPEN only:
//   Total Calls -> AgentCallsDrillModal ("Recent calls", count contract)
//   Leads       -> AgentLeadsDrillModal
//   Revenue     -> AgentDealsDrillModal
// ("Deals won" was dropped 2026-06-15 — three tiles, one row.)
//
// Below the tiles each card carries a toggleable breakdown chart
// (Call outcome <-> Lead status) and, beneath it, the First-Touch Speed
// scorecard. Both are fetched LAZILY the first time a card becomes active and
// cached per agent in `breakdowns` (one Promise.all per agent — getAgentDetail
// Metrics for the breakdown + getAgentFirstTouchScorecard for the speed card) so
// a swipe back to a seen card never refetches and a re-render never refires. The
// scorecard is nullable in the ready state — its fetch can fail independently
// (it just doesn't render), without taking down the breakdown.
//
// The deck is a Dialog size="full" (opts OUT of the <md bottom-sheet). The drill
// modals stack ABOVE it via the nested-modal z contract (DrillModalShell).
//
// NOTE: AgentRosterRow has NO totalCallsMade field (that lives only on
// AgentDetailMetrics). The "Total Calls" tile is therefore a label-only tap
// target — showing a number would break the zero-per-swipe-fetch rule for the
// tiles. The call COUNT lives only inside the Recent-calls modal.

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { Phone, Users, IndianRupee, BarChart3, ListChecks } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Avatar';
import { Carousel } from '@/components/ui/Carousel';
import { PipelineBar } from '@/components/performance/PipelineBar';
import { FirstTouchScorecard } from '@/components/performance/FirstTouchScorecard';
import { AgentCallsDrillModal } from '@/components/performance/AgentCallsDrillModal';
import { AgentLeadsDrillModal } from '@/components/performance/AgentLeadsDrillModal';
import { AgentDealsDrillModal } from '@/components/performance/AgentDealsDrillModal';
import { getAgentDetailMetricsAction, getAgentFirstTouchScorecardAction } from '@/lib/actions/performance';
import { formatCount, formatCurrencyCompact } from '@/lib/utils/numbers';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import type { AgentRosterRow, AgentDetailMetrics } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';
import type { PerformancePeriod, FirstTouchScorecard as FirstTouchScorecardData } from '@/lib/services/performance-service';

// Recharts importer — lazy per perf G-3 so the chart chunk never lands in the
// /performance initial bundle. Same same-shape skeleton placeholder pattern as
// AgentDetailPanel's CallOutcomeBar mount.
const CallOutcomeBar = dynamic(
  () => import('@/components/performance/CallOutcomeBar').then((mod) => mod.CallOutcomeBar),
  { loading: () => <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} /> },
);

type DrillKind = 'calls' | 'leads' | 'deals';
type DrillTarget = { kind: DrillKind; agent: AgentRosterRow } | null;
type BreakdownMode = 'outcome' | 'status';

interface Props {
  open: boolean;
  onClose: () => void;
  roster: AgentRosterRow[];
  /** null for admin/founder (unrestricted); a single domain for a scoped deck. */
  domain: AppDomain | null;
  /** Period flows from the panel so the breakdown matches the active filter. */
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
  initialAgentId?: string;
}

type BreakdownState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; metrics: AgentDetailMetrics; scorecard: FirstTouchScorecardData | null };

export function FounderDrillDownDeck({
  open,
  onClose,
  roster,
  domain,
  period,
  customFrom,
  customTo,
  initialAgentId,
}: Props) {
  const startIndex = Math.max(
    0,
    initialAgentId ? roster.findIndex((a) => a.id === initialAgentId) : 0,
  );
  const [index, setIndex] = useState(startIndex === -1 ? 0 : startIndex);
  const [drill, setDrill] = useState<DrillTarget>(null);
  // One toggle for the whole deck — flipping it on one card carries to the next,
  // which reads naturally when swiping through agents.
  const [mode, setMode] = useState<BreakdownMode>('outcome');

  // Per-agent breakdown cache — fetched once per agent, keyed by agent id. A
  // swipe to a seen card reads from here (no refetch); a re-render never refires.
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownState>>({});
  // In-flight / settled guard so the lazy effect fires the action exactly once
  // per agent across re-renders (the cache map alone would re-enter between the
  // request and setState).
  const requested = useRef<Set<string>>(new Set());

  const activeAgent = roster[Math.min(index, Math.max(roster.length - 1, 0))] ?? null;

  // A new period/date filter invalidates every cached breakdown — drop the cache
  // and the request guard so the active card refetches against the new range.
  useEffect(() => {
    setBreakdowns({});
    requested.current = new Set();
  }, [period, customFrom, customTo, domain]);

  // Lazy fetch: only the ACTIVE card's agent loads, and only once. Swiping makes
  // a new card active → its breakdown loads then; cards never seen never fetch.
  useEffect(() => {
    if (!open || !activeAgent) return;
    const agentId = activeAgent.id;
    if (requested.current.has(agentId)) return;
    requested.current.add(agentId);

    let cancelled = false;
    setBreakdowns((prev) => ({ ...prev, [agentId]: { status: 'loading' } }));

    // Both reads in parallel, one settle. The breakdown drives the error state;
    // the scorecard is best-effort (null on failure → card simply omits it).
    Promise.all([
      getAgentDetailMetricsAction(agentId, domain, period, customFrom, customTo),
      getAgentFirstTouchScorecardAction(agentId, domain, period, customFrom, customTo),
    ])
      .then(([metricsResult, scorecardResult]) => {
        if (cancelled) return;
        if (metricsResult.error || !metricsResult.data) {
          setBreakdowns((prev) => ({ ...prev, [agentId]: { status: 'error' } }));
        } else {
          setBreakdowns((prev) => ({
            ...prev,
            [agentId]: {
              status: 'ready',
              metrics: metricsResult.data!,
              scorecard: scorecardResult.data ?? null,
            },
          }));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBreakdowns((prev) => ({ ...prev, [agentId]: { status: 'error' } }));
      });

    return () => { cancelled = true; };
  }, [open, activeAgent, domain, period, customFrom, customTo]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      title="Agent deck"
      description={activeAgent ? activeAgent.full_name : undefined}
    >
      {roster.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            color: 'var(--theme-text-tertiary)',
            textAlign: 'center',
            margin: 'var(--space-8) 0',
          }}
        >
          No agents to show.
        </p>
      ) : (
        <Carousel
          items={roster}
          index={index}
          onIndexChange={setIndex}
          getKey={(a) => a.id}
          ariaLabel="Agent performance deck"
          style={{ height: '100%' }}
          renderItem={(agent) => (
            <DeckAgentCard
              agent={agent}
              breakdown={breakdowns[agent.id]}
              mode={mode}
              onModeChange={setMode}
              onDrill={(kind) => setDrill({ kind, agent })}
            />
          )}
        />
      )}

      {/* Drill-down modals — stacked above this full Dialog (nested z) */}
      {drill?.kind === 'calls' && (
        <AgentCallsDrillModal
          open
          agentId={drill.agent.id}
          agentName={drill.agent.full_name}
          domain={domain}
          onClose={() => setDrill(null)}
        />
      )}
      {drill?.kind === 'leads' && (
        <AgentLeadsDrillModal
          open
          agentId={drill.agent.id}
          agentName={drill.agent.full_name}
          domain={domain}
          onClose={() => setDrill(null)}
        />
      )}
      {drill?.kind === 'deals' && (
        <AgentDealsDrillModal
          open
          agentId={drill.agent.id}
          agentName={drill.agent.full_name}
          domain={domain}
          onClose={() => setDrill(null)}
        />
      )}
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// DeckAgentCard — one full-width slide. Tiles render ONLY in-memory roster
// fields; the breakdown reads from the deck-level per-agent cache.
// ─────────────────────────────────────────────

function DeckAgentCard({
  agent,
  breakdown,
  mode,
  onModeChange,
  onDrill,
}: {
  agent: AgentRosterRow;
  breakdown: BreakdownState | undefined;
  mode: BreakdownMode;
  onModeChange: (mode: BreakdownMode) => void;
  onDrill: (kind: DrillKind) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)',
        maxWidth: '720px',
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      {/* Identity */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Avatar src={agent.avatar_url} name={agent.full_name} size="xl" />
        <div style={{ textAlign: 'center' }}>
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--weight-light)',
              color: 'var(--theme-text-primary)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {agent.full_name}
          </h3>
          <span
            style={{
              display: 'inline-block',
              marginTop: 'var(--space-2)',
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--theme-accent-surface)',
              color: 'var(--theme-accent)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-medium)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {DOMAIN_LABELS[agent.domain] ?? agent.domain}
          </span>
        </div>
      </div>

      {/* Metric tiles — three tap targets, one row */}
      <div
        className="grid grid-cols-3"
        style={{ gap: 'var(--space-3)', width: '100%' }}
      >
        <DeckTile
          icon={<Phone style={ICON} aria-hidden="true" />}
          label="Total Calls"
          value="View"
          hint="Recent calls"
          onClick={() => onDrill('calls')}
        />
        <DeckTile
          icon={<Users style={ICON} aria-hidden="true" />}
          label="Leads"
          value={formatCount(agent.totalLeads)}
          onClick={() => onDrill('leads')}
        />
        <DeckTile
          icon={<IndianRupee style={ICON} aria-hidden="true" />}
          label="Revenue"
          value={formatCurrencyCompact(agent.totalDealAmount)}
          onClick={() => onDrill('deals')}
        />
      </div>

      {/* Breakdown — toggleable outcome <-> status, lazily fed on card open */}
      <DeckBreakdown breakdown={breakdown} mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

// ─────────────────────────────────────────────
// DeckBreakdown — the toggle + the active chart for one card.
// ─────────────────────────────────────────────

function DeckBreakdown({
  breakdown,
  mode,
  onModeChange,
}: {
  breakdown: BreakdownState | undefined;
  mode: BreakdownMode;
  onModeChange: (mode: BreakdownMode) => void;
}) {
  return (
    <div style={{ width: '100%' }}>
      {/* Mode toggle */}
      <div
        role="group"
        aria-label="Breakdown mode"
        style={{
          display: 'inline-flex',
          gap: '2px',
          padding: '2px',
          marginBottom: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--theme-paper-subtle)',
          border: '1px solid var(--theme-paper-border)',
        }}
      >
        <BreakdownTab
          active={mode === 'outcome'}
          icon={<BarChart3 style={TAB_ICON} aria-hidden="true" />}
          label="Call outcome"
          onClick={() => onModeChange('outcome')}
        />
        <BreakdownTab
          active={mode === 'status'}
          icon={<ListChecks style={TAB_ICON} aria-hidden="true" />}
          label="Lead status"
          onClick={() => onModeChange('status')}
        />
      </div>

      {/* Body — the toggled breakdown chart */}
      {breakdown === undefined || breakdown.status === 'loading' ? (
        <div
          className="skeleton"
          style={{ height: '200px', borderRadius: 'var(--radius-lg)', width: '100%' }}
        />
      ) : breakdown.status === 'error' ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--text-sm)',
            color: 'var(--theme-text-tertiary)',
            margin: 0,
            padding: 'var(--space-5)',
            textAlign: 'center',
          }}
        >
          Breakdown unavailable.
        </p>
      ) : mode === 'outcome' ? (
        <motion.div
          key="outcome"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
        >
          <CallOutcomeBar breakdown={breakdown.metrics.callOutcomeBreakdown} />
        </motion.div>
      ) : (
        <motion.div
          key="status"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
          style={{
            background: 'var(--theme-paper)',
            border: '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-medium)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--theme-text-tertiary)',
              margin: '0 0 var(--space-4) 0',
            }}
          >
            Lead Pipeline
          </p>
          <PipelineBar breakdown={breakdown.metrics.pipelineBreakdown} />
        </motion.div>
      )}

      {/* First-Touch Speed — below the breakdown (deck parity with the desktop
          AgentDetailPanel order). Only when the scorecard fetch succeeded. */}
      {breakdown?.status === 'ready' && breakdown.scorecard && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <FirstTouchScorecard data={breakdown.scorecard} />
        </div>
      )}
    </div>
  );
}

const TAB_ICON = { width: 14, height: 14, strokeWidth: 1.5 } as const;

function BreakdownTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="serene-pressable serene-touch"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--theme-paper)' : 'transparent',
        boxShadow: active ? 'var(--shadow-1)' : 'none',
        color: active ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        transition: 'background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const ICON = { width: 16, height: 16, strokeWidth: 1.5, color: 'var(--theme-accent)' } as const;

function DeckTile({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="serene-pressable serene-touch"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) var(--space-5)',
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-1)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'box-shadow var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {icon}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--theme-text-tertiary)',
          }}
        >
          {label}
        </span>
      </span>
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 'var(--weight-light)',
          color: 'var(--theme-text-primary)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-accent)' }}>
        {hint ?? 'View details'}
      </span>
    </button>
  );
}
