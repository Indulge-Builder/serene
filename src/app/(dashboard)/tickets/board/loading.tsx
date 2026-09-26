// Skeleton for /tickets/board: title row with the two link buttons, the filter strip, then the
// eight status columns on the same horizontal rail the board uses (.serene-board--wide).

import { Shimmer, FilterBarSkeleton, skeletonStagger } from '@/components/ui/PageSkeletons';
import { TICKET_BOARD_STATUSES } from '@/lib/constants/tickets';

export default function TicketBoardLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <Shimmer w={110} h={36} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Shimmer w={76} h={36} r="var(--radius-sm)" />
          <Shimmer w={124} h={36} r="var(--radius-sm)" />
        </div>
      </div>

      <FilterBarSkeleton icon chips={[110, 100, 96, 90]} />

      <div className="serene-board serene-board--wide">
        {TICKET_BOARD_STATUSES.map((status, i) => (
          <section
            key={status}
            style={{
              background:    'var(--theme-paper-subtle)',
              border:        '1px solid var(--theme-paper-border)',
              borderRadius:  'var(--neu-radius-card)',
              padding:       'var(--space-3)',
              minHeight:     240,
              display:       'flex',
              flexDirection: 'column',
              gap:           'var(--space-3)',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-1)' }}>
              <Shimmer w={6} h={6} r="var(--radius-full)" />
              <Shimmer w={70} h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} />
              <Shimmer w={16} h={10} r="var(--radius-xs)" style={{ marginLeft: 'auto' }} />
            </header>
            {Array.from({ length: i % 3 === 0 ? 1 : 2 }, (_, j) => (
              <Shimmer key={j} h={84} r="var(--radius-lg)" delay={skeletonStagger(i + j)} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
