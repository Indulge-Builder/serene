// loading.tsx — performance page.
//
// The agent view (most common) has: header only, no filter bar, then PerformanceSkeleton.
// The manager/founder view has a filter bar + ManagerPerformanceSkeleton inside a Suspense.
//
// Since loading.tsx cannot know the role, we render the agent shape — it's the most
// common and the mismatch on manager is less jarring than the wrong chrome for agents.
// PerformanceSkeleton already covers KPI cards + effort cards + outcome card.

import { PerformanceSkeleton } from './PerformanceSkeleton';

export default function PerformanceLoading() {
  return (
    <main className="flex-1 min-w-0 p-8">
      {/* Page header — no filter bar on agent view */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div
          className="skeleton"
          style={{ width: '200px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* KPI + effort + outcome cards — reuses the exact Suspense fallback */}
      <PerformanceSkeleton />
    </main>
  );
}
