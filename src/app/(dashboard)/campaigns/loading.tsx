// Skeleton — campaigns page chrome.
// Header/filter blocks come from the shared scaffold (PageSkeletons);
// 5 campaign card rows with stagger per §11.4.

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function CampaignsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={120} />

      <FilterBarSkeleton searchWidth={200} chips={[88, 100, 80]} />

      {/* Campaign card list (5 rows, §11.4 stagger) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i} style={{ flexWrap: 'nowrap' }}>
              {/* Left: name + domain pill */}
              <div style={{ flex: '0 0 auto', minWidth: '200px' }}>
                <Shimmer w={160} h={14} r="var(--radius-xs)" delay={delay} style={{ marginBottom: 'var(--space-2)' }} />
                <Shimmer w={80} h={18} r="var(--radius-full)" delay={delay} />
              </div>

              {/* Right: metric pill skeletons */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {[52, 44, 60, 48, 44, 44, 40].map((w, j) => (
                  <Shimmer key={j} w={w} h={22} r="var(--radius-full)" delay={delay} />
                ))}
              </div>
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
