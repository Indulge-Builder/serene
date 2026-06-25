'use client';

// FounderPerformanceShell — client component.
// Owns the Domains / Agents tab state. The active tab IS mirrored to the URL
// (?tab=agents) via history.replaceState — NOT router.replace, so there's no
// navigation / RSC re-run — so a round-trip to a lead dossier and back restores
// the tab the user was on instead of snapping back to Domains and re-mounting it
// (the ?agent= precedent on this page; supersedes the old "tab never in URL"
// Invariant 14). Domains is the FIRST tab and the default when ?tab= is absent.
// The Domains/Agents TabSelector lives INSIDE the shared PerformanceFilters
// paper strip (the /tasks single-strip layout — tabs left, filters right),
// so there is no separate tab row. agentsSlot is a server-rendered subtree
// passed as a prop (RSC composition pattern). Both tabs share the same
// period/customFrom/customTo from URL params.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TabSelector } from '@/components/ui/TabSelector';
import { PerformanceFilters } from '@/components/performance/PerformanceFilters';
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

// Domains is first (the default landing tab); Agents second.
type Tab = 'domains' | 'agents';

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
  // Active tab is seeded from ?tab= and mirrored back via history.replaceState
  // (no navigation, no RSC re-run) so a round-trip to a lead dossier and back
  // RESTORES the tab the user was on — instead of snapping back to Domains and
  // re-fetching it. Domains stays the default when ?tab= is absent. (This is the
  // ?agent= precedent on this same page; the old "tab never in URL" note is gone.)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'domains';
    return new URLSearchParams(window.location.search).get('tab') === 'agents' ? 'agents' : 'domains';
  });
  // Mirror activeTab into ?tab= (or strip it for the Domains default) WITHOUT a
  // navigation — history.replaceState keeps the URL back-nav-safe with zero RSC
  // re-run. A back-nav remounts the shell, which re-seeds activeTab from this
  // param (lazy init above), so the user lands back on the tab they left.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('tab');
    if (activeTab === 'agents') {
      if (current === 'agents') return;
      url.searchParams.set('tab', 'agents');
    } else {
      if (current === null) return;
      url.searchParams.delete('tab');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, [activeTab]);

  // Below md the 2-tab bar spans the row (otherwise the content-sized pill tray
  // reads as off-cut next to the rest of the filter chrome).
  const isMobile = useMediaQuery(MQ.mobile);

  // The Agents-tab roster panel registers its "Deck view" trigger here so it
  // renders on the filter bar's trailing edge (right side) instead of stacking
  // on its own row above the roster. Cleared whenever the panel has no trigger.
  const [tabAction, setTabAction] = useState<React.ReactNode>(null);
  const setTabActionCb = useCallback((node: React.ReactNode) => setTabAction(node), []);

  // The Agents/Domains tabs live in the filter bar's trailing tabSlot — the bar
  // runs filter icon → search → date range → … → these tabs on the far right.
  // accent variant + a distinct indicatorLayoutId from the agent shell's content
  // tabs (shared-layout rule).
  const tabs = (
    <div
      style={{
        maxWidth:       '100%',
        minWidth:       0,
        overflowX:      'auto',
        scrollbarWidth: 'none',
        flexShrink:     0,
        ...(isMobile ? { flex: '1 1 0' } : null),
      }}
    >
      <TabSelector
        tabs={[
          { id: 'domains', label: 'Domains' },
          { id: 'agents', label: 'Agents' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
        variant="accent"
        indicatorLayoutId="founder-perf-tabs"
        // Span the row on phones; content-sized inline pill on desktop.
        fullWidth={isMobile}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Single paper strip — filters left, the Agents-tab "Deck view" trigger,
          then the Domains/Agents tabs on the far-right edge (desktop only: on
          mobile the deck IS the Agents view and owns its own reopen prompt, so
          the strip stays just filters + tabs). */}
      <div className="px-5 py-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters
          showSearch
          tabSlot={tabs}
          trailing={!isMobile && activeTab === 'agents' ? tabAction : null}
        />
      </div>

      {/* Tab content — agentsSlot is a server-rendered subtree. The provider
          lets the client roster panel inside it register its deck trigger. */}
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
