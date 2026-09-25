// FreshdeskOverview — the strip above the ticket list: live counts, the status mix and
// the sync health line. Server component, display-only; reads are done by the page.
// The mix and the sync line live in ONE StatStrip (2026-09-25): a cell per status in
// the order the work flows (with us → waiting on someone else → done), and the
// mirror's health as the card's quiet footer. They used to float loose under the tiles.

import { AlertTriangle } from 'lucide-react';
import { StatTile } from '@/components/ui/StatTile';
import { StatStrip } from '@/components/ui/StatStrip';
import { MetaLine } from '@/components/ui/MetaLine';
import { EmptyState } from '@/components/ui/EmptyState';
import { semanticTones } from '@/components/ui/Badge';
import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';
import { formatCount } from '@/lib/utils/numbers';
import { formatRelativeTime } from '@/lib/utils/dates';
import { FD_TERMINAL_STATUSES, FD_WAITING_STATUSES, fdStatusTone } from '@/lib/constants/freshdesk';
import type { FdOverview } from '@/lib/types/freshdesk';

/** With us first, then waiting on someone else, then done; status id order within. */
function flowRank(status: number): number {
  if (FD_TERMINAL_STATUSES.includes(status)) return 2;
  if (FD_WAITING_STATUSES.includes(status)) return 1;
  return 0;
}

function SyncLine({ sync, total }: { sync: FdOverview['sync']; total: number }) {
  const stale = sync.lastPollAt ? Date.now() - new Date(sync.lastPollAt).getTime() > 5 * 60_000 : true;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <MetaLine
        tone={sync.lastPollOk === false || stale ? 'warning' : 'live'}
        items={[
          sync.lastPollAt
            ? `Synced ${formatRelativeTime(sync.lastPollAt)}${sync.lastPollOk === false ? ' (failed)' : ''}`
            : 'Never synced',
          sync.backfillDone
            ? `History complete, ${formatCount(total)} tickets mirrored`
            : `Backfilling history, ${formatCount(sync.backfillTicketsDone)} tickets so far`,
          sync.threadsPending > 0 && `${formatCount(sync.threadsPending)} threads still to pull`,
          sync.lastWebhookAt && `Webhook heard ${formatRelativeTime(sync.lastWebhookAt)}`,
          sync.rateRemaining != null && `${sync.rateRemaining} API calls left this minute`,
        ]}
      />
      {sync.lastError && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
          <AlertTriangle style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, flexShrink: 0 }} aria-hidden="true" />
          {sync.lastError.slice(0, 120)}
        </span>
      )}
    </div>
  );
}

const TILE_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 'var(--space-4)',
};

/** Holds the strip's height while the filtered counts stream in (Suspense fallback). */
export function FreshdeskOverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <div style={TILE_GRID}>
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Shimmer w={72} h={8} delay={skeletonStagger(i)} />
            <Shimmer w={56} h={20} delay={skeletonStagger(i)} />
          </SkeletonCard>
        ))}
      </div>
      {/* The By status strip: title, a row of compact cells, the sync footer */}
      <SkeletonCard style={{ padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0, flexWrap: 'nowrap' }}>
        <div style={{ padding: 'var(--space-4) var(--space-5) var(--space-1)' }}>
          <Shimmer w={64} h={8} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ flex: 1, minWidth: 112, padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Shimmer w={48} h={18} delay={skeletonStagger(i)} />
              <Shimmer w={64} h={8} delay={skeletonStagger(i)} />
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--theme-paper-border)', background: 'var(--neu-section-bg)', padding: 'var(--space-3) var(--space-5)' }}>
          <Shimmer w="55%" h={10} />
        </div>
      </SkeletonCard>
    </div>
  );
}

export function FreshdeskOverview({ overview }: { overview: FdOverview }) {
  // Every tile describes the filtered set the table shows; the "today" tiles are the
  // filtered tickets created / resolved since IST midnight, so a date range in the past
  // legitimately reads 0 there.
  const sub = overview.filtered ? { text: 'in this filter', color: 'var(--theme-text-tertiary)' } : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <div style={TILE_GRID}>
        <StatTile label="Open now" value={formatCount(overview.openTotal)} sub={sub} />
        <StatTile label="Created today" value={formatCount(overview.createdToday)} sub={sub} />
        <StatTile label="Resolved today" value={formatCount(overview.resolvedToday)} sub={sub} />
        <StatTile
          label="Escalated (open)"
          value={formatCount(overview.escalatedOpen)}
          sub={overview.escalatedOpen > 0 ? { text: 'past SLA', color: 'var(--color-danger-text)' } : sub}
        />
        <StatTile label={overview.filtered ? 'Matching' : 'Mirrored'} value={formatCount(overview.totalTickets)} sub={sub} />
      </div>

      <StatStrip title="By status" divided footer={<SyncLine sync={overview.sync} total={overview.totalTickets} />}>
        {overview.byStatus.length === 0 ? (
          <EmptyState title="No tickets in this view." style={{ flex: 1, padding: 'var(--space-4)' }} />
        ) : (
          [...overview.byStatus]
            .sort((a, b) => flowRank(a.status) - flowRank(b.status) || a.status - b.status)
            .map((s) => (
              <StatTile
                key={s.status}
                variant="cell"
                size="sm"
                dot={semanticTones[fdStatusTone(s.status)].ink}
                label={s.label}
                value={formatCount(s.count)}
              />
            ))
        )}
      </StatStrip>
    </div>
  );
}
