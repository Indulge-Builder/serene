'use client';

import { useState, useRef, useEffect, useMemo }  from 'react';
import dynamic                                   from 'next/dynamic';
import { useSearchParams }                      from 'next/navigation';
import { m as motion, AnimatePresence }               from 'framer-motion';
import { SlidersHorizontal, ChevronDown, LayoutGrid } from 'lucide-react';
import { Avatar }                                from '@/components/ui/Avatar';
import { CollapseReveal }                        from '@/components/ui/CollapseReveal';
import { EmptyState }                            from '@/components/ui/EmptyState';
import { FilterDropdown }                        from '@/components/ui/FilterDropdown';
import { useMediaQuery, MQ }                     from '@/hooks/useMediaQuery';
import { ENTER_DURATION, PAGE_DURATION, EASE_OUT_EXPO, EASE_IN_OUT, BASE_DURATION } from '@/lib/constants/motion';
import { DOMAIN_LABELS, readDomainCookie, parseGiaDomainParam } from '@/lib/constants/domains';
import {
  buildPerformanceRosterGroups,
  PERFORMANCE_ROSTER_DOMAIN_ORDER,
} from '@/lib/utils/performance-roster-display';
import { getManagerRosterAction }                from '@/lib/actions/performance';
import { useFounderPerfActions }                 from '@/app/(dashboard)/performance/founder-perf-actions';
import { AgentDetailPanel }              from './AgentDetailPanel';
import { PerformanceRosterEmptyState }   from './PerformanceRosterEmptyState';
import type { AgentRosterRow }           from '@/lib/types/index';
import type { AppDomain }                        from '@/lib/types/database';
import type { PerformancePeriod }                from '@/lib/services/performance-service';

// Heavy, rarely-opened full-screen overlay — loaded on intent (Heavy modal rule).
const FounderDrillDownDeck = dynamic(
  () =>
    import('@/app/(dashboard)/performance/FounderDrillDownDeck').then(
      (m) => m.FounderDrillDownDeck,
    ),
  { ssr: false },
);

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
// Roster header — "Agents" label + domain filter
// ─────────────────────────────────────────────

function RosterHeader({
  allDomains,
  availableDomains,
  domainFilter,
  onFilterChange,
  collapsible,
  expanded,
  onToggle,
  agentCount,
  selectedName,
}: {
  allDomains:      boolean;
  availableDomains: AppDomain[];
  domainFilter:    AppDomain | null;
  onFilterChange:  (d: AppDomain | null) => void;
  // Mobile collapse (design-system CollapseReveal at the panel level)
  collapsible:     boolean;
  expanded:        boolean;
  onToggle:        () => void;
  agentCount:      number;
  selectedName:    string | null;
}) {
  const label = (
    <span
      style={{
        fontFamily:    'var(--font-sans)',
        fontSize:      'var(--text-2xs)',
        fontWeight:    'var(--weight-medium)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         'var(--theme-text-tertiary)',
        flexShrink:    0,
      }}
    >
      Agents
    </span>
  );

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            'var(--space-2)',
        padding:        'var(--space-3) var(--space-4) var(--space-2)',
        borderBottom:   `1px solid ${!collapsible || expanded ? 'var(--theme-paper-border)' : 'transparent'}`,
        marginBottom:   'var(--space-1)',
        position:       'relative',
        transition:     'border-color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {collapsible ? (
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-2)',
            flex:       1,
            minWidth:   0,
            padding:    0,
            background: 'transparent',
            border:     'none',
            cursor:     'pointer',
            textAlign:  'left',
          }}
        >
          {label}
          {/* Count badge — inactive TabSelector badge colours */}
          <span
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       '18px',
              height:         '18px',
              padding:        '0 5px',
              borderRadius:   'var(--radius-full)',
              background:     'var(--theme-paper-subtle)',
              color:          'var(--theme-text-tertiary)',
              fontFamily:     'var(--font-sans)',
              fontSize:       'var(--text-2xs)',
              fontWeight:     'var(--weight-medium)',
              flexShrink:     0,
            }}
          >
            {agentCount}
          </span>
          {/* Collapsed: show who is selected so the header stays informative */}
          {!expanded && selectedName && (
            <span
              style={{
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-xs)',
                color:        'var(--theme-text-secondary)',
                whiteSpace:   'nowrap',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                minWidth:     0,
              }}
            >
              {selectedName}
            </span>
          )}
          <ChevronDown
            style={{
              width:      14,
              height:     14,
              color:      'var(--theme-text-tertiary)',
              flexShrink: 0,
              marginLeft: 'auto',
              transform:  expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform var(--duration-fast) var(--ease-in-out)',
            }}
            strokeWidth={1.5}
          />
        </button>
      ) : (
        label
      )}

      {/* Domain filter — shared FilterDropdown (single-select, portaled).
          menuPortal is REQUIRED: the roster card sits inside the paper scroll
          container, so a non-portaled menu would clip against the overflow /
          Framer transforms (this is the mobile fix). The synthetic '__all__'
          item preserves the explicit "All domains" affordance the popover had
          (mirrors layout/DomainSelector). accentBorderOnOpen=false keeps the
          accent treatment tied to an active selection, not the open panel. */}
      {allDomains && (
        <FilterDropdown
          label="Domains"
          icon={SlidersHorizontal}
          items={[
            { id: '__all__', label: 'All domains' },
            ...availableDomains.map((d) => ({
              id: d,
              label: DOMAIN_LABELS[d as keyof typeof DOMAIN_LABELS],
            })),
          ]}
          selected={domainFilter ? [domainFilter] : []}
          onChange={(sel) => {
            const picked = sel[0] ?? null;
            onFilterChange(picked === '__all__' ? null : (picked as AppDomain));
          }}
          menuPortal
          accentBorderOnOpen={false}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ManagerPerformancePanel
// ─────────────────────────────────────────────

type Props = {
  agentRoster: AgentRosterRow[];
  domain:      AppDomain;
  period:      PerformancePeriod;
  customFrom?: string;
  customTo?:   string;
  // When true, roster spans all domains — grouped by domain, filterable by domain.
  allDomains?: boolean;
};

export function ManagerPerformancePanel({
  agentRoster: initialRoster,
  domain,
  period,
  customFrom,
  customTo,
  allDomains = false,
}: Props) {
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<AppDomain | null>(null);
  const [agentRoster, setAgentRoster]   = useState<AgentRosterRow[]>(initialRoster);
  const [isRefetching, setIsRefetching] = useState(false);
  const [rosterOpen, setRosterOpen]     = useState(true);
  const [deckOpen, setDeckOpen]         = useState(false);
  const founderActions                  = useFounderPerfActions();
  const isMobile                        = useMediaQuery(MQ.mobile);
  const searchParams                    = useSearchParams();
  const searchTerm                      = (searchParams.get('search') ?? '').trim().toLowerCase();

  // Sync the roster domain filter to the global selector (the serene-domain
  // ?domain= param the header DomainSelector writes; cookie fallback on a URL
  // with no param after a cross-page nav). "Pick Shop in the header" narrows
  // the founder roster to Shop too, consistent with the rest of the app.
  // Founder all-domains view only (the only roster with a domain filter).
  // Param is reactive (a live pick on /performance re-runs this); the cookie is
  // read post-mount (client-only) so there is no hydration mismatch on the
  // controlled FilterDropdown. Gated to a domain present in the roster so a
  // stale value can never blank the list. The user can still override via the
  // roster's own FilterDropdown afterward (this only fires on a global change).
  const globalDomainParam = searchParams.get('domain');
  useEffect(() => {
    if (!allDomains) return;
    const next = parseGiaDomainParam(globalDomainParam) ?? readDomainCookie();
    if (next && initialRoster.some((a) => a.domain === next)) {
      setDomainFilter(next);
    } else if (next === null) {
      // Global cleared to "All domains" → drop the roster narrowing too.
      setDomainFilter(null);
    }
    // initialRoster/allDomains are stable for the component's lifetime; only the
    // global param drives a re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDomainParam]);

  // The roster list is collapsible only below md (full-width stacked layout);
  // on desktop the side column is always expanded.
  const rosterExpanded = !isMobile || rosterOpen;

  // Skip the first mount — we already have server-fetched initial data.
  const hasMounted = useRef(false);

  // Refetch roster client-side when period changes — avoids Suspense re-suspending
  // (which would reset selectedId) while the detail panel stays mounted.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    let cancelled = false;
    setIsRefetching(true);

    getManagerRosterAction(period, allDomains, customFrom, customTo)
      .then((result) => {
        if (cancelled) return;
        setIsRefetching(false);
        if (result.data) setAgentRoster(result.data);
      })
      .catch(() => {
        if (cancelled) return;
        setIsRefetching(false);
      });

    return () => { cancelled = true; };
  }, [period, customFrom, customTo, allDomains]);

  const selectedAgent = selectedId ? (agentRoster.find((a) => a.id === selectedId) ?? null) : null;

  // When filters hide the selected agent, clear selection (empty state on the right).
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

  // Mobile: with nothing selected the roster is the only useful content — reopen it.
  useEffect(() => {
    if (isMobile && selectedId === null) setRosterOpen(true);
  }, [isMobile, selectedId]);

  // Mobile-only: the swipeable deck is the DEFAULT view (desktop/tablet
  // unchanged — there the deck stays a trigger-driven overlay). Auto-open it once
  // per mount when on a phone with a non-empty all-domains roster; a manual close
  // is respected (the latch never reopens it).
  const autoOpenedDeck = useRef(false);
  useEffect(() => {
    if (autoOpenedDeck.current) return;
    if (isMobile && allDomains && agentRoster.length > 0) {
      autoOpenedDeck.current = true;
      setDeckOpen(true);
    }
  }, [isMobile, allDomains, agentRoster.length]);

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

  // Deck-view trigger — founder/admin all-domains view only. Opens the
  // full-screen swipeable per-agent deck over the IN-MEMORY roster (respecting
  // the active client-side domain filter — zero new fetch).
  const showDeckTrigger = allDomains && visibleAgents.length > 0;
  // Memoised on the only input that changes its content/visibility so the
  // shell-registration effect below doesn't re-fire (and re-render the shell)
  // on every panel render. setDeckOpen is a stable setter.
  const deckTrigger = useMemo(
    () =>
      showDeckTrigger ? (
        <button
          type="button"
          onClick={() => setDeckOpen(true)}
          className="serene-pressable serene-touch"
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            padding:      'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border:       '1px solid var(--theme-paper-border)',
            background:   'var(--theme-paper)',
            boxShadow:    'var(--shadow-1)',
            color:        'var(--theme-text-primary)',
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-medium)',
            cursor:       'pointer',
            flexShrink:   0,
          }}
        >
          <LayoutGrid style={{ width: 15, height: 15, strokeWidth: 1.5 }} aria-hidden="true" />
          Deck view
        </button>
      ) : null,
    [showDeckTrigger],
  );

  // When mounted inside the founder shell, hoist the trigger up onto the shell's
  // tab row (aligned opposite the Agents/Domains tabs) instead of stacking it on
  // its own row above the roster. Clear on unmount / when there's nothing to show.
  useEffect(() => {
    if (!founderActions) return;
    founderActions.setTabAction(deckTrigger);
    return () => founderActions.setTabAction(null);
  }, [founderActions, deckTrigger]);

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
        <EmptyState title="No agents in this domain yet." size="lg" style={{ padding: 0 }} />
      </div>
    );
  }

  // Clamp stagger so large rosters don't take forever
  function delay(i: number) {
    return Math.min(i * 35, 280);
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Thin accent bar during roster refetch */}
      <AnimatePresence>
        {isRefetching && (
          <motion.div
            key="roster-refetch-bar"
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
              pointerEvents:   'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Deck trigger fallback — only when NOT inside the founder shell (the
          shell hoists the trigger onto its tab row via FounderPerfActions).
          The founder all-domains path always has the context, so this renders
          only in the defensive no-context case. */}
      {!founderActions && deckTrigger && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          {deckTrigger}
        </div>
      )}

      {deckOpen && (
        <FounderDrillDownDeck
          open={deckOpen}
          onClose={() => setDeckOpen(false)}
          roster={visibleAgents}
          domain={domainFilter}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          initialAgentId={selectedId ?? undefined}
        />
      )}

    <div
      className="flex flex-col items-stretch md:flex-row md:items-start"
      style={{
        gap:           'var(--space-5)',
        opacity:       isRefetching ? 0.6 : 1,
        transition:    'opacity 200ms var(--ease-in-out)',
        pointerEvents: isRefetching ? 'none' : undefined,
      }}
    >
      {/* ── Left: agent roster — full-width above the detail <md, 268px column md+ */}
      <div
        className="w-full md:w-67"
        style={{
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
          collapsible={isMobile}
          expanded={rosterExpanded}
          onToggle={() => setRosterOpen((v) => !v)}
          agentCount={visibleAgents.length}
          selectedName={selectedAgent?.full_name ?? null}
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

        <AnimatePresence initial={false}>
          {rosterExpanded && (
            <CollapseReveal key="roster-body">
              <div style={{ padding: 'var(--space-1)' }}>
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
                          onClick={() => {
                            setSelectedId(agent.id);
                            // Mobile: collapse the roster so the detail panel is immediately visible
                            if (isMobile) setRosterOpen(false);
                          }}
                          delay={delay(idx)}
                        />
                      );
                    })}
                  </div>
                ))}

                {visibleAgents.length === 0 && agentRoster.length > 0 && (
                  <EmptyState title="Nothing matches these filters." />
                )}
              </div>
            </CollapseReveal>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right: empty prompt OR agent detail ───────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <AnimatePresence mode="wait">
          {selectedAgent === null ? (
            <motion.div
              key="roster-empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            >
              <PerformanceRosterEmptyState />
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
    </div>
  );
}
