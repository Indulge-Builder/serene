import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';
export function TicketsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 'var(--space-6)', padding: 'var(--space-4)', borderBottom: '1px solid var(--theme-paper-border)' }}>
        {[60, 200, 70, 70, 80, 90, 70].map((w, i) => <Shimmer key={i} w={w} h={10} delay={i * 30} />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderBottom: i < rows - 1 ? '1px solid var(--theme-paper-border)' : undefined }}>
          <Shimmer w={60} h={12} delay={skeletonStagger(i)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}><Shimmer w="50%" h={12} delay={skeletonStagger(i)} /><Shimmer w="30%" h={9} delay={skeletonStagger(i)} /></div>
          <Shimmer w={80} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
          <Shimmer w={70} h={12} delay={skeletonStagger(i)} />
          <Shimmer w={90} h={12} delay={skeletonStagger(i)} />
        </div>
      ))}
    </div>
  );
}
