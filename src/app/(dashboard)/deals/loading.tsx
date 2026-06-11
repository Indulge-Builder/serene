// Skeleton — deals page chrome: header + filter bar + summary strip + deal card rows.
// Header/filter blocks come from the shared scaffold (PageSkeletons); the summary
// strip and flat deal rows are page-specific.

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function DealsLoading() {
  return (
    <main className="flex-1 p-8">
      <PageHeaderSkeleton titleWidth={72} actionWidth={110} />

      <FilterBarSkeleton chips={[88, 96, 80]} />

      {/* Summary strip (4 stat chips) — page-specific */}
      <div
        style={{
          display:      'flex',
          alignItems:   'stretch',
          marginBottom: 'var(--space-4)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
          height:       '80px',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            'var(--space-2)',
              padding:        'var(--space-4)',
              borderRight:    i < 3 ? '1px solid var(--theme-paper-border)' : 'none',
            }}
          >
            <Shimmer w={80} h={28} delay={i * 40} />
            <Shimmer w={60} h={10} delay={i * 40} />
          </div>
        ))}
      </div>

      {/* Deal card rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Shimmer key={i} h={80} r="var(--radius-md)" delay={skeletonStagger(i)} />
        ))}
      </div>
    </main>
  );
}
