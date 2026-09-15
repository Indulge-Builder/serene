// Skeleton — /books chrome: header + three tile rows + two tables.

import { PageHeaderSkeleton, Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';

export function BooksSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {[0, 1, 2].map((row) => (
        <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-4)' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Shimmer w={80} h={8} delay={skeletonStagger(row * 5 + i)} />
              <Shimmer w={110} h={20} delay={skeletonStagger(row * 5 + i)} />
            </SkeletonCard>
          ))}
        </div>
      ))}
      <SkeletonCard style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 6 }, (_, i) => <Shimmer key={i} w="100%" h={14} delay={skeletonStagger(i)} />)}
      </SkeletonCard>
    </div>
  );
}

export default function BooksLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={100} actionWidth={100} />
      <BooksSkeleton />
    </main>
  );
}
