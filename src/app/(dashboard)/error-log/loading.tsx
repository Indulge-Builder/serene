// Skeleton — /error-log. Icon tile + title/description header, the three-tile
// stats strip, then the shared ErrorLogTableSkeleton (the page's own Suspense
// fallback), so both hand-offs look the same.
import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';
import { ErrorLogTableSkeleton } from '@/components/error-log/ErrorLogTableSkeleton';

export default function ErrorLogLoading() {
  return (
    <main style={{ flex: 1, padding: 'var(--space-8)' }}>
      {/* Header — icon tile + title + one-line description */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Shimmer w={40} h={40} r="var(--radius-md)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Shimmer w={140} h={36} />
          <Shimmer w={360} h={12} r="var(--radius-xs)" />
        </div>
      </div>

      {/* Stats strip — three metric tiles */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => {
          const delay = skeletonStagger(i);
          return (
            <SkeletonCard key={i} style={{ animationDelay: `${delay}ms`, flex: '1 1 160px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Shimmer w={80} h={11} r="var(--radius-xs)" delay={delay} />
                <Shimmer w={56} h={26} delay={delay} />
              </div>
            </SkeletonCard>
          );
        })}
      </div>

      <ErrorLogTableSkeleton />
    </main>
  );
}
