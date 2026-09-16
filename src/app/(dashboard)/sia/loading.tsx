// Skeleton — /sia. The SiaWorkspace chrome: title row with the console gear,
// then the two-pane monitor (340px group list on md+, the message stream
// beside it). Composes the shared PageSkeletons blocks only.
import { PageHeaderSkeleton, SkeletonCard, Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

export default function SiaLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={60} actionWidth={36} />

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
        {/* Group list — search + filter chips + rows */}
        <SkeletonCard style={{ width: '100%', alignSelf: 'stretch' }}>
          <div
            className="w-full md:w-[308px]"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
          >
            <Shimmer w="100%" h={34} />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Shimmer w={64} h={24} r="var(--radius-full)" />
              <Shimmer w={72} h={24} r="var(--radius-full)" />
              <Shimmer w={56} h={24} r="var(--radius-full)" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => {
              const delay = skeletonStagger(i);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Shimmer w={36} h={36} r="var(--radius-full)" delay={delay} style={{ flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
                    <Shimmer w="70%" h={13} r="var(--radius-xs)" delay={delay} />
                    <Shimmer w="45%" h={10} r="var(--radius-xs)" delay={delay} />
                  </div>
                </div>
              );
            })}
          </div>
        </SkeletonCard>

        {/* Message stream — alternating bubbles */}
        <SkeletonCard style={{ flex: 1, alignSelf: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
            {Array.from({ length: 6 }).map((_, i) => {
              const delay = skeletonStagger(i);
              const mine = i % 3 === 2;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <Shimmer w={mine ? '38%' : '52%'} h={44} r="var(--radius-md)" delay={delay} />
                </div>
              );
            })}
          </div>
        </SkeletonCard>
      </div>
    </main>
  );
}
