'use client';

import { useState, useEffect, useCallback } from 'react';
import { Phone } from 'lucide-react';
import { DrillModalShell } from './DrillModalShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAgentCallsForManagerAction } from '@/lib/actions/performance';
import { formatRelativeTime } from '@/lib/utils/dates';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import type { AgentCallPageItem, AgentActivityCursor } from '@/lib/services/performance-service';
import type { AppDomain, CallOutcome } from '@/lib/types/database';

/** Outcome arrives as a raw DB string — resolve to a label, falling back to the
 *  raw value if it's ever outside the known set. */
function outcomeLabel(outcome: string): string {
  return CALL_OUTCOME_LABELS[outcome as CallOutcome] ?? outcome;
}

// ─────────────────────────────────────────────
// AgentCallsDrillModal — "Recent calls" drill-down (founder/manager deck).
//
// COUNT CONTRACT (sign-off): this is a TIMELINE, not a tally. The header shows
// "showing N most recent" derived from items.length — NEVER the card's
// totalCallsMade (a cohort aggregate from a different table that can legitimately
// disagree). The title is the fixed literal "Recent calls".
//
// One row per call: the source query reads lead_notes WHERE call_outcome IS NOT
// NULL (the call record itself), so there are no note_added duplicates by
// construction. Fetches on open only; keyset load-more (composite cursor).
// ─────────────────────────────────────────────

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  /** Target agent's domain — the manager-authz check param (null for admin/founder). */
  domain: AppDomain | null;
  onClose: () => void;
}

export function AgentCallsDrillModal({ open, agentId, agentName, domain, onClose }: Props) {
  const [items, setItems] = useState<AgentCallPageItem[]>([]);
  const [cursor, setCursor] = useState<AgentActivityCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (next?: AgentActivityCursor) => {
      setLoading(true);
      setError(false);
      const result = await getAgentCallsForManagerAction(agentId, domain, next);
      setLoading(false);
      if (!result.data) {
        setError(true);
        return;
      }
      setItems((prev) => (next ? [...prev, ...result.data!.items] : result.data!.items));
      setCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
    },
    [agentId, domain],
  );

  // Fetch on open only; reset on close so a reopen starts fresh.
  useEffect(() => {
    if (!open) {
      setItems([]);
      setCursor(null);
      setHasMore(false);
      setError(false);
      return;
    }
    void load();
  }, [open, load]);

  const subtitle =
    items.length > 0
      ? `${agentName} · showing ${items.length} most recent${hasMore ? '' : ''}`
      : agentName;

  return (
    <DrillModalShell open={open} title="Recent calls" subtitle={subtitle} onClose={onClose}>
      {loading && items.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size="md" />
        </div>
      ) : error && items.length === 0 ? (
        <EmptyState variant="inline" title="Couldn't load calls." size="sm" />
      ) : items.length === 0 ? (
        <EmptyState variant="inline" title="No calls logged yet." size="sm" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {items.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--theme-paper-subtle)',
                border: '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--theme-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.leadName}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
                  {formatRelativeTime(c.createdAt)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {c.phone && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
                    {c.phone}
                  </span>
                )}
                {c.outcome && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--theme-accent-surface)',
                      color: 'var(--theme-accent)',
                      fontSize: 'var(--text-2xs)',
                      fontWeight: 'var(--weight-medium)',
                    }}
                  >
                    <Phone style={{ width: 11, height: 11, strokeWidth: 1.5 }} aria-hidden="true" />
                    {outcomeLabel(c.outcome)}
                  </span>
                )}
              </div>

              {c.note && (
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--theme-text-secondary)',
                    margin: 0,
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {c.note}
                </p>
              )}
            </div>
          ))}

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => cursor && load(cursor)}
                loading={loading}
                disabled={loading || !cursor}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </DrillModalShell>
  );
}
