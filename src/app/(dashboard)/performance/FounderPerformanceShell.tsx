'use client';

// FounderPerformanceShell — client component.
// Owns the Agents / Domains tab state (never written to URL — Invariant 14).
// agentsSlot is a server-rendered subtree passed as a prop (RSC composition pattern).
// Both tabs share the same period/customFrom/customTo from URL params.

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { TabSelector } from '@/components/ui/TabSelector';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { FounderPerfActionsProvider } from './founder-perf-actions';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { DomainHealthCard, DomainTarget } from '@/lib/types/index';
import type { AppDomain } from '@/lib/types/database';

// Loaded on intent (perf audit G-3): the Domains tab is the only Recharts
// consumer in the founder shell, so its chunk is fetched on first tab click
// instead of shipping in the /performance initial chunk.
const DomainOverviewPanel = dynamic(
  () => import('@/components/performance/DomainOverviewPanel').then((mod) => mod.DomainOverviewPanel),
  { loading: () => <DomainsTabFallback /> },
);

function DomainsTabFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'var(--space-4)' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: '300px', borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

type Tab = 'agents' | 'domains';

type Props = {
  domain:              AppDomain;
  period:              PerformancePeriod;
  customFrom?:         string;
  customTo?:           string;
  initialDomainHealth: DomainHealthCard[];
  /** Founder-set monthly deals targets (domain_targets) */
  initialTargets:      DomainTarget[];
  /** Deals closed THIS MONTH per domain — month-pinned target meter input */
  monthDeals:          Partial<Record<AppDomain, number>>;
  canEditTargets:      boolean;
  agentsSlot:          React.ReactNode;
};

export function FounderPerformanceShell({
  period,
  customFrom,
  customTo,
  initialDomainHealth,
  initialTargets,
  monthDeals,
  canEditTargets,
  agentsSlot,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('agents');
  // Below md the 2-tab bar spans the row (otherwise the content-sized pill tray
  // reads as off-cut next to the hoisted Deck-view action).
  const isMobile = useMediaQuery(MQ.mobile);

  // The Agents-tab roster panel registers its "Deck view" trigger here so it
  // renders on this tab row (aligned opposite the tabs) instead of stacking on
  // its own row above the roster. Cleared whenever the panel has no trigger.
  const [tabAction, setTabAction] = useState<React.ReactNode>(null);
  const setTabActionCb = useCallback((node: React.ReactNode) => setTabAction(node), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Tab row — tabs left, the Agents-tab deck trigger right (same row).
          TabSelector pill variant (distinct indicatorLayoutId from the agent
          shell's content tabs, per the shared-layout rule). */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
        }}
      >
        <TabSelector
          tabs={[
            { id: 'agents', label: 'Agents' },
            { id: 'domains', label: 'Domains' },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as Tab)}
          variant="pill"
          indicatorLayoutId="founder-perf-tabs"
          // Span the row on phones; content-sized inline pill on desktop.
          fullWidth={isMobile}
          style={isMobile ? { flex: 1, minWidth: 0 } : undefined}
        />
        {/* Desktop only: the hoisted "Deck view" trigger. On mobile the deck IS
            the Agents view (the panel auto-opens it and owns its own reopen
            prompt), so the tab row stays just the full-width tabs. */}
        {!isMobile && activeTab === 'agents' && tabAction}
      </div>

      {/* Tab content — agentsSlot is a server-rendered subtree. The provider
          lets the client roster panel inside it register its tab-row trigger. */}
      <div style={{ display: activeTab === 'agents' ? 'block' : 'none' }}>
        <FounderPerfActionsProvider value={{ setTabAction: setTabActionCb }}>
          {agentsSlot}
        </FounderPerfActionsProvider>
      </div>

      {activeTab === 'domains' && (
        <DomainOverviewPanel
          initialData={initialDomainHealth}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          initialTargets={initialTargets}
          monthDeals={monthDeals}
          canEditTargets={canEditTargets}
        />
      )}
    </div>
  );
}
