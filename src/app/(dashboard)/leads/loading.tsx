// Skeleton — leads page chrome: header + filter bar + table rows.
// Header/filter blocks come from the shared scaffold (PageSkeletons); the
// dense-table block is page-specific (8 rows, §11.4 stagger).

import {
  PageHeaderSkeleton,
  FilterBarSkeleton,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

export default function LeadsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={80} actionWidth={110} />

      <FilterBarSkeleton chips={[80, 96, 88, 100]} />

      {/* Table */}
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-4)',
            padding:      'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--theme-paper-border)',
            background:   'var(--theme-paper-subtle)',
          }}
        >
          {[120, 80, 100, 80, 96, 80].map((w, i) => (
            <Shimmer
              key={i}
              w={w}
              h={10}
              r="var(--radius-xs)"
              style={i === 0 ? { flex: 1 } : undefined}
            />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <div
              key={i}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          'var(--space-4)',
                padding:      'var(--space-4) var(--space-5)',
                borderBottom: i < 7 ? '1px solid var(--theme-paper-border)' : 'none',
              }}
            >
              <Shimmer w={72} h={22} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer h={14} r="var(--radius-xs)" delay={delay} style={{ flex: 1 }} />
              <Shimmer w={110} h={14} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={90} h={14} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />
              <Shimmer w={70} h={12} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    </main>
  );
}
