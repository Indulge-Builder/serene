// loading.tsx — performance page.
//
// The route chrome only: page header + the filter strip. Every role's content then
// streams behind exactly ONE skeleton of its own shape, rendered by the page
// (2026-09-25; the old roster-shaped content here showed first and was then
// replaced by a second, differently shaped skeleton for founders and agents):
//   agent            → PerformanceSkeleton (the Suspense in page.tsx)
//   manager          → ManagerPerformanceSkeleton (the roster Suspense)
//   founder / admin  → DomainsTabFallback (the Domains data + chart chunk wait,
//                      FounderPerformanceShell); ManagerPerformanceSkeleton on Agents

import { PageHeaderSkeleton, FilterBarSkeleton } from '@/components/ui/PageSkeletons';

export default function PerformanceLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      {/* Page header */}
      <PageHeaderSkeleton titleWidth={200} />

      {/* Filter bar — sliders icon + agent search + Period dropdown */}
      <FilterBarSkeleton icon searchWidth="flex" chips={[96]} />
    </main>
  );
}
