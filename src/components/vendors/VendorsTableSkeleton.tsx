// The /vendors table skeleton — the shared scaffold blocks, table-shaped.
// Server-component-safe (no hooks, no motion).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

export function VendorsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-6)',
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        {[80, 70, 50, 80, 50].map((w, i) => (
          <Shimmer key={i} w={w} h={10} delay={i * 30} />
        ))}
      </div>

      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: i < rows - 1 ? '1px solid var(--theme-paper-border)' : undefined,
          }}
        >
          <Shimmer w={36} h={36} r="var(--radius-md)" delay={skeletonStagger(i)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Shimmer w="45%" h={12} delay={skeletonStagger(i)} />
            <Shimmer w="25%" h={9} delay={skeletonStagger(i)} />
          </div>
          <Shimmer w={64} h={20} r="var(--radius-full)" delay={skeletonStagger(i)} />
          <Shimmer w={56} h={12} delay={skeletonStagger(i)} />
          <Shimmer w={88} h={12} delay={skeletonStagger(i)} />
        </div>
      ))}
    </div>
  );
}
