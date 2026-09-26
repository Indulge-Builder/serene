// Skeleton for /settings/teach-elaya: back circle + title, the one-line intro, then the four
// door cards in the hub's own auto-fit grid (icon tile, title, one line, three points).

import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';

export default function TeachElayaLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-3">
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={200} h={32} />
      </div>
      <Shimmer w="60%" h={12} r="var(--radius-xs)" style={{ maxWidth: 720, marginBottom: 'var(--space-8)' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Shimmer w={40} h={40} r="var(--radius-md)" delay={skeletonStagger(i)} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1 }}>
                <Shimmer w={110} h={16} delay={skeletonStagger(i)} />
                <Shimmer w="70%" h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} />
              </div>
            </div>
            {['90%', '80%', '60%'].map((w, j) => (
              <Shimmer key={j} w={w} h={12} r="var(--radius-xs)" delay={skeletonStagger(i + j)} />
            ))}
          </SkeletonCard>
        ))}
      </div>
    </main>
  );
}
