// Skeleton — the route-level dashboard cover: header (greeting + date filter)
// plus the bento grid. The grid block is the shared DashboardGridSkeleton, the
// same one DashboardCanvas shows while its widget seed streams in.
import { DashboardGridSkeleton } from '@/components/dashboard/DashboardGridSkeleton';

export default function DashboardLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Header row: greeting skeleton + date filter skeleton */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   'var(--space-6)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            className="skeleton"
            style={{ width: '200px', height: '28px', borderRadius: 'var(--radius-sm)' }}
          />
          <div
            className="skeleton"
            style={{ width: '140px', height: '14px', borderRadius: 'var(--radius-xs)' }}
          />
        </div>
        <div
          className="skeleton"
          style={{ width: '240px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      <DashboardGridSkeleton />
    </main>
  );
}
