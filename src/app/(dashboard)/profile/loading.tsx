// Skeleton — /profile. Header + the 340px dossier grid the page renders:
// editable section cards on the left, the identity card on the right (which
// jumps above the sections below lg, exactly as the page orders them).
import {
  PageHeaderSkeleton,
  SkeletonCard,
  Shimmer,
  skeletonStagger,
} from '@/components/ui/PageSkeletons';

function SectionCardSkeleton({ index, rows }: { index: number; rows: number }) {
  const delay = skeletonStagger(index);
  return (
    <SkeletonCard style={{ animationDelay: `${delay}ms` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
        <Shimmer w={140} h={16} delay={delay} />
        <Shimmer w="60%" h={12} r="var(--radius-xs)" delay={delay} />
        {Array.from({ length: rows }).map((_, r) => (
          <Shimmer key={r} w="100%" h={38} delay={delay} />
        ))}
      </div>
    </SkeletonCard>
  );
}

export default function ProfileLoading() {
  return (
    <main
      className="flex-1 p-4 sm:p-6 lg:p-8"
      style={{ paddingBottom: 'var(--space-16)', maxWidth: '1280px' }}
    >
      <PageHeaderSkeleton titleWidth={100} />

      <div className="serene-dossier-grid serene-dossier-grid--340" style={{ alignItems: 'start' }}>
        {/* Left — Details form, Appearance, Notifications, Password */}
        <div
          className="order-2 lg:order-0"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
        >
          <SectionCardSkeleton index={0} rows={4} />
          <SectionCardSkeleton index={1} rows={2} />
          <SectionCardSkeleton index={2} rows={3} />
        </div>

        {/* Right — identity card: avatar, name, role, member-since */}
        <SkeletonCard style={{ animationDelay: `${skeletonStagger(3)}ms` }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
              width: '100%',
            }}
          >
            <Shimmer w={96} h={96} r="var(--radius-full)" />
            <Shimmer w={150} h={18} />
            <Shimmer w={90} h={22} r="var(--radius-full)" />
            <Shimmer w={120} h={12} r="var(--radius-xs)" />
          </div>
        </SkeletonCard>
      </div>
    </main>
  );
}
