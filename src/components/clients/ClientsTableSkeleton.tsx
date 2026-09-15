// The /clients table skeleton — shared scaffold blocks, table-shaped. Server-safe.
import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

export function ClientsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', padding: 'var(--space-4)', borderBottom: '1px solid var(--theme-paper-border)' }}>
        {[160, 80, 60, 60, 50, 40, 90, 70, 70].map((w, i) => <Shimmer key={i} w={w} h={10} delay={i * 30} />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderBottom: i < rows - 1 ? '1px solid var(--theme-paper-border)' : undefined }}>
          <Shimmer w={36} h={36} r="var(--radius-md)" delay={skeletonStagger(i)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Shimmer w="40%" h={12} delay={skeletonStagger(i)} />
            <Shimmer w="22%" h={9} delay={skeletonStagger(i)} />
          </div>
          <Shimmer w={80} h={12} delay={skeletonStagger(i)} />
          <Shimmer w={56} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
          <Shimmer w={36} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
          <Shimmer w={90} h={12} delay={skeletonStagger(i)} />
        </div>
      ))}
    </div>
  );
}
