import { PageHeaderSkeleton, SkeletonCard, Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

// /elaya navigation skeleton — header + chat surface (presence strip, a few
// bubble shapes, composer strip).
export default function ElayaLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={120} />

      <SkeletonCard
        style={{
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 'var(--space-4)',
          height: 'calc(100dvh - 190px)',
          minHeight: '420px',
        }}
      >
        <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
          <Shimmer w={22} h={22} r="var(--radius-full)" />
          <Shimmer w={80} h={14} delay={skeletonStagger(0)} />
        </div>
        <div className="flex flex-col flex-1" style={{ gap: 'var(--space-3)' }}>
          <Shimmer w="55%" h={44} r="var(--radius-lg)" delay={skeletonStagger(1)} />
          <Shimmer w="40%" h={36} r="var(--radius-lg)" delay={skeletonStagger(2)} style={{ alignSelf: 'flex-end' }} />
          <Shimmer w="62%" h={56} r="var(--radius-lg)" delay={skeletonStagger(3)} />
        </div>
        <Shimmer w="100%" h={44} r="var(--radius-md)" delay={skeletonStagger(4)} />
      </SkeletonCard>
    </main>
  );
}
