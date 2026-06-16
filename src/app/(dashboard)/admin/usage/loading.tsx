// loading.tsx — /admin/usage. Page header + a stat strip / panel placeholder
// while getCurrentProfile() + getAgentUsage() resolve server-side. Composes the
// shared PageSkeletons scaffold (never hand-roll skeleton chrome).

import { PageHeaderSkeleton, SkeletonCard, Shimmer } from '@/components/ui/PageSkeletons';

export default function AdminUsageLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={160} />

      {/* Stat strip + view toggle placeholder. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <Shimmer w={132} h={76} r="var(--radius-md)" />
          <Shimmer w={132} h={76} r="var(--radius-md)" delay={80} />
        </div>
        <Shimmer w={220} h={36} r="var(--radius-xl)" delay={160} />
      </div>

      {/* Content panel placeholder. */}
      <div className="mt-4">
        <SkeletonCard style={{ display: 'block', padding: 0 }}>
          <Shimmer w="100%" h={320} r="var(--radius-lg)" delay={240} />
        </SkeletonCard>
      </div>
    </main>
  );
}
