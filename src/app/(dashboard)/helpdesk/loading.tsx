import { PageHeaderSkeleton, FilterBarSkeleton, Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';

// /helpdesk navigation skeleton — standard list-page shape: header, paper
// filter strip (search + category pill chips + count), card grid.
export default function HelpdeskLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={160} />

      <FilterBarSkeleton
        icon
        searchWidth={220}
        chips={[40, 64, 60, 52, 60, 56, 110]}
        countWidth={90}
        wrap
      />

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 'var(--space-4)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard
            key={i}
            style={{
              flexDirection: 'column',
              alignItems:    'stretch',
              gap:           'var(--space-2)',
              borderRadius:  'var(--radius-md)',
            }}
          >
            <Shimmer w={72} h={18} r="var(--radius-full)" delay={skeletonStagger(i)} />
            <Shimmer w="85%" h={16} delay={skeletonStagger(i)} />
            <Shimmer w="100%" h={12} delay={skeletonStagger(i)} />
            <Shimmer w="70%" h={12} delay={skeletonStagger(i)} />
          </SkeletonCard>
        ))}
      </div>
    </main>
  );
}
