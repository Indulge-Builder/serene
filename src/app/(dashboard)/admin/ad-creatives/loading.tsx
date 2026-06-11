// Skeleton — admin/ad-creatives page.
// Mirrors AdCreativesManager exactly: canonical page header (h1 + Add Creative
// CTA), the paper filter bar (sliders icon + search + count), then a vertical
// list of horizontal creative row cards (48×64 video thumb · title/subtitle ·
// Edit/Delete buttons). The old 3-column 16:9 thumbnail grid no longer exists.

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function AdCreativesLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Row 1 — page header: title left, Add Creative CTA right */}
      <PageHeaderSkeleton titleWidth={190} actionWidth={140} />

      {/* Row 2 — paper filter bar: sliders icon + search + count */}
      <FilterBarSkeleton icon searchWidth="flex" countWidth={70} />

      {/* Row 3 — creative row cards (flex column, gap-2) */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i} style={{ flexWrap: 'nowrap' }}>
              {/* Video thumbnail — 48×64 portrait */}
              <Shimmer w={48} h={64} r="var(--radius-sm)" delay={delay} style={{ flexShrink: 0 }} />

              {/* Title + subtitle */}
              <div
                style={{
                  flex:          1,
                  minWidth:      0,
                  display:       'flex',
                  flexDirection: 'column',
                  gap:           'var(--space-2)',
                }}
              >
                <Shimmer w={180} h={13} r="var(--radius-xs)" delay={delay} />
                <Shimmer w={120} h={11} r="var(--radius-xs)" delay={delay} />
              </div>

              {/* Edit / Delete buttons */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                <Shimmer w={60} h={26} r="var(--radius-sm)" delay={delay} />
                <Shimmer w={72} h={26} r="var(--radius-sm)" delay={delay} />
              </div>
            </SkeletonCard>
          );
        })}
      </div>
    </main>
  );
}
