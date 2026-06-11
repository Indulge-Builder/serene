// loading.tsx — performance page.
//
// The manager/admin/founder views share one chrome: page header, filter bar
// (sliders icon + agent search + Period dropdown), then the two-column roster
// panel — so this file renders that shape and the founder/manager load is
// seamless (the in-page Suspense fallback is the same ManagerPerformanceSkeleton).
//
// loading.tsx cannot know the role, so the agent view briefly shows this chrome
// too — but only for the profile-fetch window: the agent branch in page.tsx
// wraps its RPC in a Suspense whose fallback is PerformanceSkeleton (the agent
// shape), so agents flip to their correct skeleton as soon as the role is known.

import { ManagerPerformanceSkeleton } from './ManagerPerformanceSkeleton';
import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';

export default function PerformanceLoading() {
  return (
    <main className="flex-1 min-w-0 p-8">
      {/* Page header */}
      <PageHeaderSkeleton titleWidth={200} />

      {/* Filter bar — sliders icon + agent search + Period dropdown */}
      <FilterBarSkeleton icon searchWidth="flex" chips={[96]} />

      {/* Roster + detail panel — same shape as the in-page Suspense fallback */}
      <ManagerPerformanceSkeleton />
    </main>
  );
}
