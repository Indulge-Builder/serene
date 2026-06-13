import { PageHeaderSkeleton, SkeletonCard, Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

// /elaya navigation skeleton — header + chat surface + identity sidebar
// (presence strip, a few bubble shapes, composer strip). Mirrors the shipped
// .serene-dossier-grid--340 layout in ElayaChatShell (sidebar right on lg,
// stacked below the chat under lg; flex-fills the page main).
export default function ElayaLoading() {
  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <PageHeaderSkeleton titleWidth={120} />

      <div className="serene-dossier-grid serene-dossier-grid--340 flex-1" style={{ minHeight: 0 }}>
        <SkeletonCard
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 'var(--space-4)',
            minHeight: '420px',
          }}
        >
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <Shimmer w={36} h={36} r="var(--radius-md)" />
            <Shimmer w={80} h={14} delay={skeletonStagger(0)} />
          </div>
          <div className="flex flex-col flex-1" style={{ gap: 'var(--space-3)' }}>
            <Shimmer w="55%" h={44} r="var(--radius-lg)" delay={skeletonStagger(1)} />
            <Shimmer w="40%" h={36} r="var(--radius-lg)" delay={skeletonStagger(2)} style={{ alignSelf: 'flex-end' }} />
            <Shimmer w="62%" h={56} r="var(--radius-lg)" delay={skeletonStagger(3)} />
          </div>
          <Shimmer w="100%" h={44} r="var(--radius-md)" delay={skeletonStagger(4)} />
        </SkeletonCard>

        <SkeletonCard
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-4)',
            minHeight: 0,
          }}
        >
          <Shimmer w={64} h={64} r="var(--radius-lg)" />
          <Shimmer w={90} h={18} delay={skeletonStagger(0)} />
          <Shimmer w="100%" h={36} r="var(--radius-md)" delay={skeletonStagger(1)} />
          <Shimmer w="100%" h={36} r="var(--radius-md)" delay={skeletonStagger(2)} />
          <Shimmer w="100%" h={36} r="var(--radius-md)" delay={skeletonStagger(3)} />
        </SkeletonCard>
      </div>
    </main>
  );
}
