// Skeleton for /members/[id]/finance: back circle + name, the membership tile strip, then the
// movements card and the first Zoho card. The page's own MemberZohoSkeleton holds the rest
// once the spine has streamed in.

import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function MemberFinanceLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={240} h={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Shimmer w={72} h={8} delay={skeletonStagger(i)} />
              <Shimmer w={96} h={20} delay={skeletonStagger(i)} />
            </SkeletonCard>
          ))}
        </div>
        <DossierCardSkeleton headerWidth={130} rows={3} />
        <DossierCardSkeleton headerWidth={90} rows={5} />
      </div>
    </main>
  );
}
