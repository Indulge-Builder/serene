'use client';

// ManagerPerformanceShell — client component (manager role only).
// Mirrors FounderPerformanceShell's single-paper-strip layout, minus the
// Agents/Domains tabs (a manager has one domain, one roster — no tabs). It
// owns the shared PerformanceFilters strip and hosts the roster panel's
// "Deck view" trigger on the filter bar's trailing edge (right side), reusing
// the SAME FounderPerfActions registration bridge the founder shell uses
// (R-01 — no second trigger-hoist mechanism). rosterSlot is the server-rendered
// ManagerPerformanceAsync subtree passed as a prop (RSC composition pattern).

import { useCallback, useState } from 'react';
import { PerformanceFilters } from '@/components/performance/PerformanceFilters';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { FounderPerfActionsProvider } from './founder-perf-actions';

type Props = {
  rosterSlot: React.ReactNode;
};

export function ManagerPerformanceShell({ rosterSlot }: Props) {
  const isMobile = useMediaQuery(MQ.mobile);

  // The roster panel registers its "Deck view" trigger here so it renders on
  // the filter bar's trailing edge instead of stacking on its own row above
  // the roster. Cleared whenever the panel has no trigger.
  const [tabAction, setTabAction] = useState<React.ReactNode>(null);
  const setTabActionCb = useCallback((node: React.ReactNode) => setTabAction(node), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div className="px-5 py-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <PerformanceFilters
          showSearch
          // Desktop only: on mobile the deck IS the view (the panel auto-opens
          // it and owns its own reopen prompt), so the strip stays just filters.
          trailing={!isMobile ? tabAction : null}
        />
      </div>

      <FounderPerfActionsProvider value={{ setTabAction: setTabActionCb }}>
        {rosterSlot}
      </FounderPerfActionsProvider>
    </div>
  );
}
