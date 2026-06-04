'use client';

import { useState, useRef, useEffect }          from 'react';
import { useSearchParams }                      from 'next/navigation';
import { motion, AnimatePresence }               from 'framer-motion';
import { SlidersHorizontal, Check }              from 'lucide-react';
import { Avatar }                                from '@/components/ui/Avatar';
import { ENTER_DURATION, EASE_OUT_EXPO, BASE_DURATION } from '@/lib/constants/motion';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import {
  buildPerformanceRosterGroups,
  PERFORMANCE_ROSTER_DOMAIN_ORDER,
} from '@/lib/utils/performance-roster-display';
import { AgentDetailPanel }                      from './AgentDetailPanel';
import { DomainHealthGrid }                      from './DomainHealthGrid';
import type { AgentRosterRow, DomainHealthCard } from '@/lib/types/index';
import type { AppDomain }                        from '@/lib/types/database';
import type { PerformancePeriod }                from '@/lib/services/performance-service';

// ─────────────────────────────────────────────
// AgentCard — roster row
// ─────────────────────────────────────────────

function AgentCard({
  agent,
  isSelected,
  onClick,
  delay,
}: {
  agent:      AgentRosterRow;
  isSelected: boolean;
  onClick:    () => void;
  delay:      number;
}) {
  const [hovered, setHovered] = useState(false);
  const isHighlighted = isSelected || hovered;

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: ENTER_DURATION, delay: delay / 1000, ease: EASE_OUT_EXPO }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
        padding:      'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background:   'transparent',
        border:       'none',
        cursor:     'pointer',
        width:      '100%',
        textAlign:  'left',
      }}
    >
      <Avatar
        src={agent.avatar_url}
        name={agent.full_name}
        size="sm"
        selected={isHighlighted}
        style={{ flexShrink: 0 }}
      />

      {/* Name */}
      <p
        style={{
          flex:         1,
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          fontWeight:   isHighlighted ? 'var(--weight-semibold)' : 'var(--weight-normal)',
          color:        'var(--theme-text-primary)',
          margin:       0,
          minWidth:     0,
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          transition:   'font-weight var(--duration-fast) var(--ease-in-out)',
        }}
      >
        {agent.full_name}
      </p>

      {/* Total leads — right side */}
      <span
        style={{
          fontFamily:    'var(--font-mono)',
          fontSize:      'var(--text-xs)',
          fontWeight:    'var(--weight-medium)',
          color:         isHighlighted ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
          flexShrink:    0,
          letterSpacing: '-0.01em',
          transition:    'color var(--duration-fast) var(--ease-in-out)',
        }}
      >
        {agent.totalLeads}
      </span>
    </motion.button>
  );
}

// ─────────────────────────────────────────────
// DomainSection label
// ─────────────────────────────────────────────

function DomainSectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding:       'var(--space-2) var(--space-4) var(--space-1)',
        marginTop:     'var(--space-1)',
      }}
    >
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// DomainFilterPopover — inline filter panel
// ─────────────────────────────────────────────

function DomainFilterPopover({
  availableDomains,
  selected,
  onSelect,
  onClose,
}: {
  availableDomains: AppDomain[];
  selected:         AppDomain | null;
  onSelect:         (d: AppDomain | null) => void;
  onClose:          () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
      style={{
        position:     'absolute',
        top:          'calc(100% + 6px)',
        right:        0,
        zIndex:       50,
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-3)',
        minWidth:     '180px',
        padding:      'var(--space-1)',
        overflow:     'hidden',
      }}
    >
      {/* All domains option */}
      <button
        onClick={() => { onSelect(null); onClose(); }}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          width:        '100%',
          padding:      'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          background:   selected === null ? 'var(--theme-accent-surface)' : 'transparent',
          border:       'none',
          cursor:       'pointer',
          textAlign:    'left',
          transition:   'background var(--duration-fast) var(--ease-in-out)',
        }}
        onMouseEnter={(e) => { if (selected !== null) e.currentTarget.style.background = 'var(--theme-paper-subtle)'; }}
        onMouseLeave={(e) => { if (selected !== null) e.currentTarget.style.background = 'transparent'; }}
      >
        <span
          style={{
            flex:       1,
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-sm)',
            color:      selected === null ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
            fontWeight: selected === null ? 'var(--weight-semibold)' : 'var(--weight-normal)',
          }}
        >
          All domains
        </span>
        {selected === null && <Check style={{ width: 13, height: 13, color: 'var(--theme-accent)', flexShrink: 0 }} strokeWidth={2} />}
      </button>

      {/* Separator */}
      <div style={{ height: '1px', background: 'var(--theme-paper-border)', margin: 'var(--space-1) 0' }} />

      {/* Per-domain options */}
      {availableDomains.map((d) => (
        <button
          key={d}
          onClick={() => { onSelect(d); onClose(); }}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            width:        '100%',
            padding:      'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            background:   selected === d ? 'var(--theme-accent-surface)' : 'transparent',
            border:       'none',
            cursor:       'pointer',
            textAlign:    'left',
            transition:   'background var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { if (selected !== d) e.currentTarget.style.background = 'var(--theme-paper-subtle)'; }}
          onMouseLeave={(e) => { if (selected !== d) e.currentTarget.style.background = 'transparent'; }}
        >
          <span
            style={{
              flex:       1,
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      selected === d ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
              fontWeight: selected === d ? 'var(--weight-semibold)' : 'var(--weight-normal)',
            }}
          >
            {DOMAIN_LABELS[d as keyof typeof DOMAIN_LABELS]}
          </span>
          {selected === d && <Check style={{ width: 13, height: 13, color: 'var(--theme-accent)', flexShrink: 0 }} strokeWidth={2} />}
        </button>
      ))}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Roster header — "Agents" label + filter icon
// ─────────────────────────────────────────────

function RosterHeader({
  allDomains,
  availableDomains,
  domainFilter,
  onFilterChange,
}: {
  allDomains:      boolean;
  availableDomains: AppDomain[];
  domainFilter:    AppDomain | null;
  onFilterChange:  (d: AppDomain | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const isFiltered = domainFilter !== null;

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        'var(--space-3) var(--space-4) var(--space-2)',
        borderBottom:   '1px solid var(--theme-paper-border)',
        marginBottom:   'var(--space-1)',
        position:       'relative',
      }}
    >
      <span
        style={{
          fontFamily:    'var(--font-sans)',
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-medium)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
        }}
      >
        Agents
      </span>

      {/* Filter icon — only shown in all-domains mode */}
      {allDomains && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen((v) => !v)}
            title="Filter by domain"
            style={{
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              width:        '26px',
              height:       '26px',
              borderRadius: 'var(--radius-sm)',
              border:       isFiltered
                ? '1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent)'
                : '1px solid transparent',
              background:   isFiltered ? 'var(--theme-accent-surface)' : 'transparent',
              cursor:       'pointer',
              transition:   'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
            }}
            onMouseEnter={(e) => {
              if (!isFiltered) e.currentTarget.style.background = 'var(--theme-paper-subtle)';
            }}
            onMouseLeave={(e) => {
              if (!isFiltered) e.currentTarget.style.background = 'transparent';
            }}
          >
            <SlidersHorizontal
              style={{
                width:  14,
                height: 14,
                color:  isFiltered ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                transition: 'color var(--duration-fast) var(--ease-in-out)',
              }}
              strokeWidth={1.5}
            />
          </button>

          <AnimatePresence>
            {open && (
              <DomainFilterPopover
                availableDomains={availableDomains}
                selected={domainFilter}
                onSelect={onFilterChange}
                onClose={() => setOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ManagerPerformancePanel
// ─────────────────────────────────────────────

type Props = {
  agentRoster:  AgentRosterRow[];
  domainHealth: DomainHealthCard[];
  domain:       AppDomain;
  period:       PerformancePeriod;
  customFrom?:  string;
  customTo?:    string;
  // When true, roster spans all domains — grouped by domain, filterable by domain.
  allDomains?:  boolean;
};

export function ManagerPerformancePanel({
  agentRoster,
  domainHealth,
  domain,
  period,
  customFrom,
  customTo,
  allDomains = false,
}: Props) {
  // null = no agent selected → show domain health overview
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<AppDomain | null>(null);
  const searchParams                    = useSearchParams();
  const searchTerm                      = (searchParams.get('search') ?? '').trim().toLowerCase();

  const selectedAgent = selectedId ? (agentRoster.find((a) => a.id === selectedId) ?? null) : null;

  // When filters narrow the visible agents and the selected agent is no longer visible,
  // reset to null (return to domain health overview) rather than keeping a stale selection.
  useEffect(() => {
    if (!selectedId) return;
    const stillVisible = agentRoster.filter((a) => {
      if (domainFilter && a.domain !== domainFilter) return false;
      if (searchTerm && !a.full_name.toLowerCase().includes(searchTerm)) return false;
      return true;
    });
    if (!stillVisible.find((a) => a.id === selectedId)) {
      setSelectedId(null);
    }
  }, [searchTerm, domainFilter, agentRoster, selectedId]);

  // Unique domains that actually have agents, in roster display order
  const presentDomains = PERFORMANCE_ROSTER_DOMAIN_ORDER.filter((d) =>
    agentRoster.some((a) => a.domain === d),
  );

  // Apply domain + search filters (client-side, no refetch — URL is source of truth)
  const visibleAgents = agentRoster.filter((a) => {
    if (domainFilter && a.domain !== domainFilter) return false;
    if (searchTerm && !a.full_name.toLowerCase().includes(searchTerm)) return false;
    return true;
  });

  const groups = buildPerformanceRosterGroups(visibleAgents, { allDomains, domain });

  // Flat list with stable animation delays
  let globalIndex = 0;

  if (agentRoster.length === 0) {
    return (
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          padding:      'var(--space-12) var(--space-6)',
          textAlign:    'center',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-lg)',
            fontWeight: 'var(--weight-light)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          No agents in this domain yet.
        </p>
      </div>
    );
  }

  // Clamp stagger so large rosters don't take forever
  function delay(i: number) {
    return Math.min(i * 35, 280);
  }

  return (
    <div
      style={{
        display:    'flex',
        gap:        'var(--space-5)',
        alignItems: 'flex-start',
      }}
    >
      {/* ── Left: agent roster ──────────────────────────────────────── */}
      <div
        style={{
          width:        '268px',
          flexShrink:   0,
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          overflow:     'hidden',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        <RosterHeader
          allDomains={allDomains}
          availableDomains={presentDomains}
          domainFilter={domainFilter}
          onFilterChange={(d) => {
            setDomainFilter(d);
            const stillVisible = agentRoster.filter((a) => {
              if (d && a.domain !== d) return false;
              if (searchTerm && !a.full_name.toLowerCase().includes(searchTerm)) return false;
              return true;
            });
            if (selectedId && !stillVisible.find((a) => a.id === selectedId)) {
              setSelectedId(null);
            }
          }}
        />

        <div
          style={{
            padding:   'var(--space-1)',
            maxHeight: '600px',
            overflowY: 'auto',
          }}
        >
          {groups.map((group) => (
            <div key={group.domain}>
              {/* Domain section label — only when showing all domains and more than one domain present */}
              {allDomains && groups.length > 1 && (
                <DomainSectionLabel
                  label={DOMAIN_LABELS[group.domain as keyof typeof DOMAIN_LABELS]}
                />
              )}
              {group.agents.map((agent) => {
                const idx = globalIndex++;
                return (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={agent.id === selectedId}
                    onClick={() => setSelectedId(agent.id)}
                    delay={delay(idx)}
                  />
                );
              })}
            </div>
          ))}

          {visibleAgents.length === 0 && agentRoster.length > 0 && (
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle:  'italic',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-tertiary)',
                textAlign:  'center',
                padding:    'var(--space-6) var(--space-4)',
                margin:     0,
              }}
            >
              Nothing matches these filters.
            </p>
          )}
        </div>
      </div>

      {/* ── Right: domain health overview OR agent detail ─────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <AnimatePresence mode="wait">
          {selectedAgent === null ? (
            <motion.div
              key="domain-overview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            >
              <DomainHealthGrid cards={domainHealth} period={period} />
            </motion.div>
          ) : (
            <motion.div
              key={selectedAgent.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            >
              <AgentDetailPanel
                agent={selectedAgent}
                domain={allDomains ? null : domain}
                period={period}
                customFrom={customFrom}
                customTo={customTo}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
