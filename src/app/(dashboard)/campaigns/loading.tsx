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

      {/* Campaign card list (5 rows, §11.4 stagger) — mirrors the three-row
          CampaignCard shape (identity · hero stats · status breakdown). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard
              key={i}
              style={{ flexDirection: 'column', alignItems: 'stretch', flexWrap: 'nowrap', padding: 'var(--space-5)' }}
            >
              {/* Row 1 — name + domain pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Shimmer w={200} h={16} r="var(--radius-xs)" delay={delay} style={{ flex: '1 1 auto', maxWidth: 220 }} />
                <Shimmer w={64} h={18} r="var(--radius-full)" delay={delay} />
              </div>

              {/* Row 2 — hero stat columns (label over value) */}
              <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
                {[64, 56, 60, 68].map((w, j) => (
                  <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <Shimmer w={Math.round(w * 0.7)} h={9} r="var(--radius-xs)" delay={delay} />
                    <Shimmer w={w} h={18} r="var(--radius-xs)" delay={delay} />
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--theme-paper-border)' }} />

              {/* Row 3 — status breakdown chips */}
              <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
                {[78, 96, 80, 70, 66, 62].map((w, j) => (
                  <Shimmer key={j} w={w} h={14} r="var(--radius-full)" delay={delay} />
                ))}
              </div>
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
