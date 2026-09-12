// Skeleton — the vendor page: back-link header, the identity/score top row,
// then the full-width invoices and notes cards. Mirrors the real shape so a
// navigation does not flash a differently-proportioned placeholder.

import { Shimmer, SkeletonCard } from '@/components/ui/PageSkeletons';

export default function VendorLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <Shimmer w={36} h={36} r="var(--radius-full)" />
        <Shimmer w={220} h={28} />
      </div>

      <div className="serene-dossier-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <SkeletonCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Shimmer h={64} w="55%" />
            <Shimmer h={150} />
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Shimmer h={108} delay={60} />
            <Shimmer h={92} delay={90} />
          </div>
        </SkeletonCard>
      </div>

      {/* Notes, then invoices — mirrors the page order. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <SkeletonCard>
          <Shimmer h={130} delay={120} />
        </SkeletonCard>
        <SkeletonCard>
          <Shimmer h={150} delay={150} />
        </SkeletonCard>
      </div>
    </main>
  );
}
