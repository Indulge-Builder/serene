'use client';

// Recent lead activity for the agent Today view — keyset "load more"
// (page ~15) via getAgentRecentLeadActivityAction. A button, never infinite
// scroll. Rows link to the lead dossier by slug.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Phone, ArrowRight, UserPlus, User, StickyNote, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAgentRecentLeadActivityAction } from '@/lib/actions/performance';
import { formatRelativeTime } from '@/lib/utils/dates';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import type {
  AgentActivityCursor,
  AgentLeadActivityItem,
} from '@/lib/services/performance-service';
import type { CallOutcome, LeadStatus } from '@/lib/types/database';

type ActivityMeta = {
  icon:  React.ElementType;
  color: string;
  sub:   (item: AgentLeadActivityItem) => string;
};

const ACTIVITY_META: Record<string, ActivityMeta> = {
  call_logged: {
    icon:  Phone,
    color: 'var(--color-info-text)',
    sub:   (a) => {
      const outcome = a.details?.outcome as CallOutcome | undefined;
      return outcome ? (CALL_OUTCOME_LABELS[outcome] ?? outcome) : 'Call logged';
    },
  },
  note_added: {
    icon:  StickyNote,
    color: 'var(--theme-text-secondary)',
    sub:   () => 'Note added',
  },
  status_changed: {
    icon:  ArrowRight,
    color: 'var(--theme-accent)',
    sub:   (a) => {
      const from = a.details?.old_status as LeadStatus | undefined;
      const to   = a.details?.new_status as LeadStatus | undefined;
      return from && to
        ? `${LEAD_STATUS_LABELS[from] ?? from} → ${LEAD_STATUS_LABELS[to] ?? to}`
        : 'Status changed';
    },
  },
  lead_created: {
    icon:  UserPlus,
    color: 'var(--color-success-text)',
    sub:   () => 'Entered the system',
  },
  agent_assigned: {
    icon:  User,
    color: 'var(--theme-text-secondary)',
    sub:   () => 'Assigned to you',
  },
};

const FALLBACK_META: ActivityMeta = {
  icon:  Activity,
  color: 'var(--theme-text-tertiary)',
  sub:   (a) => a.actionType.replace(/_/g, ' '),
};

export function AgentRecentActivityList() {
  const [items, setItems]         = useState<AgentLeadActivityItem[]>([]);
  const [cursor, setCursor]       = useState<AgentActivityCursor | null>(null);
  const [hasMore, setHasMore]     = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  async function loadPage(next?: AgentActivityCursor) {
    setIsLoading(true);
    setError(null);
    const result = await getAgentRecentLeadActivityAction(next ?? undefined);
    setIsLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to load activity.');
      return;
    }
    setItems((prev) => (next ? [...prev, ...result.data!.items] : result.data!.items));
    setCursor(result.data.nextCursor);
    setHasMore(result.data.hasMore);
  }

  useEffect(() => {
    let cancelled = false;
    getAgentRecentLeadActivityAction()
      .then((result) => {
        if (cancelled) return;
        setIsLoading(false);
        if (result.error || !result.data) {
          setError(result.error ?? 'Failed to load activity.');
          return;
        }
        setItems(result.data.items);
        setCursor(result.data.nextCursor);
        setHasMore(result.data.hasMore);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
        setError('Failed to load activity.');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
        display:      'flex',
        flexDirection:'column',
        gap:          'var(--space-3)',
      }}
    >
      <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
        Recent Lead Activity
      </span>

      {isLoading && items.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '36px', borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      )}

      {!isLoading && error && items.length === 0 && (
        <EmptyState variant="inline" size="sm" title={error} />
      )}

      {!isLoading && !error && items.length === 0 && (
        <EmptyState variant="inline" size="sm" title="No activity on your leads yet." />
      )}

      {items.map((item) => {
        const meta = ACTIVITY_META[item.actionType] ?? FALLBACK_META;
        const Icon = meta.icon;
        const row = (
          <div
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        'var(--space-3)',
              padding:    'var(--space-2) 0',
              borderBottom: '1px solid var(--theme-paper-border)',
            }}
          >
            <Icon
              aria-hidden="true"
              style={{ width: 14, height: 14, strokeWidth: 1.5, color: meta.color, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-primary)',
                  overflow:   'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.leadName}
              </p>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-xs)',
                  color:      'var(--theme-text-tertiary)',
                }}
              >
                {meta.sub(item)}
              </p>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-2xs)',
                color:      'var(--theme-text-tertiary)',
                flexShrink: 0,
              }}
            >
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
        );

        return item.leadSlug ? (
          <Link
            key={item.id}
            href={`/leads/${item.leadSlug}`}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            {row}
          </Link>
        ) : (
          <div key={item.id}>{row}</div>
        );
      })}

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
          <Button
            variant="ghost"
            size="sm"
            loading={isLoading}
            onClick={() => cursor && void loadPage(cursor)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
