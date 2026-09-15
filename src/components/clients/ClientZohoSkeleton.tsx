// ClientZohoSkeleton — holds the finance page's Zoho section while the live read streams in.

import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';

export function ClientZohoSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Shimmer w={72} h={8} delay={skeletonStagger(i)} />
            <Shimmer w={96} h={20} delay={skeletonStagger(i)} />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 5 }, (_, i) => <Shimmer key={i} w="100%" h={14} delay={skeletonStagger(i)} />)}
      </SkeletonCard>
    </div>
  );
}
