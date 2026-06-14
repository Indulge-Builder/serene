'use client';

// FounderDrillDownDeck — full-screen swipeable per-agent card deck.
//
// One card per roster agent, rendered ENTIRELY from the in-memory AgentRosterRow
// array already held by ManagerPerformancePanel — zero per-swipe fetch. Each
// card surfaces four metric tiles; tapping a tile opens a drill-down modal that
// fetches ON OPEN only:
//   Total Calls -> AgentCallsDrillModal ("Recent calls", count contract)
//   Leads       -> AgentLeadsDrillModal
//   Won/Revenue -> AgentDealsDrillModal
//
// The deck is a Dialog size="full" (opts OUT of the <md bottom-sheet). The drill
// modals stack ABOVE it via the nested-modal z contract (DrillModalShell).
//
// NOTE: AgentRosterRow has NO totalCallsMade field (that lives only on
// AgentDetailMetrics, fetched per-agent). The "Total Calls" tile is therefore a
// label-only tap target — showing a number would require a fetch and break the
// zero-per-swipe-fetch rule. The call COUNT lives only inside the Recent-calls
// modal (items.length / "showing N most recent"), never on the card.

import { useState } from 'react';
import { Phone, Users, Trophy, IndianRupee } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Avatar';
import { Carousel } from '@/components/ui/Carousel';
import { AgentCallsDrillModal } from '@/components/performance/AgentCallsDrillModal';
import { AgentLeadsDrillModal } from '@/components/performance/AgentLeadsDrillModal';
import { AgentDealsDrillModal } from '@/components/performance/AgentDealsDrillModal';
import { formatCount, formatCurrencyCompact } from '@/lib/utils/numbers';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import type { AgentRosterRow } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';

type DrillKind = 'calls' | 'leads' | 'deals';
type DrillTarget = { kind: DrillKind; agent: AgentRosterRow } | null;

interface Props {
  open: boolean;
  onClose: () => void;
  roster: AgentRosterRow[];
  /** null for admin/founder (unrestricted); a single domain for a scoped deck. */
  domain: AppDomain | null;
  initialAgentId?: string;
}

export function FounderDrillDownDeck({ open, onClose, roster, domain, initialAgentId }: Props) {
  const startIndex = Math.max(
    0,
    initialAgentId ? roster.findIndex((a) => a.id === initialAgentId) : 0,
  );
  const [index, setIndex] = useState(startIndex === -1 ? 0 : startIndex);
  const [drill, setDrill] = useState<DrillTarget>(null);

  const activeAgent = roster[Math.min(index, Math.max(roster.length - 1, 0))] ?? null;

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
// DeckAgentCard — one full-width slide. Renders ONLY in-memory roster fields.
// ─────────────────────────────────────────────

function DeckAgentCard({
  agent,
  onDrill,
}: {
  agent: AgentRosterRow;
  onDrill: (kind: DrillKind) => void;
}) {
  const conv = agent.conversionRate;
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
        {conv !== null && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
            {conv.toFixed(0)}% conversion
          </span>
        )}
      </div>

      {/* Metric tiles — tap targets */}
      <div
        className="grid grid-cols-2"
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
          icon={<Trophy style={ICON} aria-hidden="true" />}
          label="Won"
          value={formatCount(agent.leadsWon)}
          onClick={() => onDrill('deals')}
        />
        <DeckTile
          icon={<IndianRupee style={ICON} aria-hidden="true" />}
          label="Revenue"
          value={formatCurrencyCompact(agent.totalDealAmount)}
          onClick={() => onDrill('deals')}
        />
      </div>
    </div>
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
