// FreshdeskOverview — the strip above the ticket list: live counts, the status mix and
// the sync health line. Server component, display-only; reads are done by the page.

import { Activity, AlertTriangle, CheckCircle2, Inbox, Database } from 'lucide-react';
import { StatTile } from '@/components/ui/StatTile';
import { Shimmer, SkeletonCard, skeletonStagger } from '@/components/ui/PageSkeletons';
import { formatCount } from '@/lib/utils/numbers';
import { formatRelativeTime } from '@/lib/utils/dates';
import { FreshdeskStatusPill } from './FreshdeskStatusPill';
import type { FdOverview } from '@/lib/types/freshdesk';

function SyncLine({ sync, total }: { sync: FdOverview['sync']; total: number }) {
  const stale = sync.lastPollAt ? Date.now() - new Date(sync.lastPollAt).getTime() > 5 * 60_000 : true;
  const tone = sync.lastPollOk === false || stale ? 'var(--color-warning-text)' : 'var(--color-success-text)';
  const parts: { icon: React.ElementType; text: string; color?: string }[] = [
    {
      icon: Activity,
      text: sync.lastPollAt ? `Last sync ${formatRelativeTime(sync.lastPollAt)}${sync.lastPollOk === false ? ' (failed)' : ''}` : 'Never synced',
      color: tone,
    },
    {
      icon: Database,
      text: sync.backfillDone
        ? `History complete · ${formatCount(total)} tickets mirrored`
        : `Backfilling history · ${formatCount(sync.backfillTicketsDone)} tickets so far`,
    },
  ];
  if (sync.threadsPending > 0) parts.push({ icon: Inbox, text: `${formatCount(sync.threadsPending)} threads still to pull` });
  if (sync.lastWebhookAt) parts.push({ icon: CheckCircle2, text: `Webhook heard ${formatRelativeTime(sync.lastWebhookAt)}` });
  if (sync.rateRemaining != null) parts.push({ icon: Activity, text: `${sync.rateRemaining} API calls left this minute` });

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2) var(--space-5)',
        fontSize: 'var(--text-xs)',
        color: 'var(--theme-text-tertiary)',
        alignItems: 'center',
      }}
    >
      {parts.map((p, i) => {
        const Icon = p.icon;
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: p.color }}>
            <Icon style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
            {p.text}
          </span>
        );
      })}
      {sync.lastError && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-danger-text)' }}>
          <AlertTriangle style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
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
      <Shimmer w="60%" h={10} />
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

      {overview.byStatus.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
          {overview.byStatus.map((s) => (
            <span key={s.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FreshdeskStatusPill status={s.status} label={s.label} />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--theme-text-secondary)',
                }}
              >
                {formatCount(s.count)}
              </span>
            </span>
          ))}
        </div>
      )}

      <SyncLine sync={overview.sync} total={overview.totalTickets} />
    </div>
  );
}
