'use client';

import { useState, useEffect, useCallback } from 'react';
import { DrillModalShell } from './DrillModalShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAgentDealsScopedAction } from '@/lib/actions/performance';
import { formatCurrency } from '@/lib/utils/numbers';
import { formatDate } from '@/lib/utils/dates';
import { DEAL_TYPE_LABELS, type DealType } from '@/lib/constants/deal-types';
import type { DealsResult } from '@/lib/services/deals-service';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// AgentDealsDrillModal — the target agent's won deals (founder/manager deck).
// Reuses the existing getDealsByRole path via getAgentDealsScopedAction
// (filters.agent_id = agentId). Page-based load-more. Fetch on open only.
// ─────────────────────────────────────────────

type DealRow = DealsResult['deals'][number];

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  domain: AppDomain | null;
  onClose: () => void;
}

function dealTypeLabel(t: string | null): string | null {
  if (!t) return null;
  return DEAL_TYPE_LABELS[t as DealType] ?? t;
}

export function AgentDealsDrillModal({ open, agentId, agentName, domain, onClose }: Props) {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(false);
      const result = await getAgentDealsScopedAction(agentId, domain, nextPage);
      setLoading(false);
      if (!result.data) {
        setError(true);
        return;
      }
      setRows((prev) => (nextPage > 1 ? [...prev, ...result.data!.deals] : result.data!.deals));
      setTotal(result.data.totalCount);
      setPage(nextPage);
    },
    [agentId, domain],
  );

  useEffect(() => {
    if (!open) {
      setRows([]);
      setPage(1);
      setTotal(0);
      setError(false);
      return;
    }
    void load(1);
  }, [open, load]);

  const hasMore = rows.length < total;

  return (
    <DrillModalShell
      open={open}
      title="Won deals"
      subtitle={total > 0 ? `${agentName} · ${total} deal${total === 1 ? '' : 's'}` : agentName}
      onClose={onClose}
    >
      {loading && rows.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size="md" />
        </div>
      ) : error && rows.length === 0 ? (
        <EmptyState variant="inline" title="Couldn't load deals." size="sm" />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title="No deals won yet." size="sm" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rows.map((deal) => {
            const type = dealTypeLabel(deal.deal_type);
            return (
              <div
                key={deal.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--theme-paper-subtle)',
                  border: '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                    {deal.contact_name || 'Unnamed deal'}
                  </span>
                  <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {type && (
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {type}
                      </span>
                    )}
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                      {formatDate(deal.won_at)}
                    </span>
                  </span>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--weight-light)',
                    color: 'var(--theme-accent)',
                  }}
                >
                  {formatCurrency(deal.deal_amount)}
                </span>
              </div>
            );
          })}

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
              <Button variant="secondary" size="sm" onClick={() => load(page + 1)} loading={loading} disabled={loading}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </DrillModalShell>
  );
}
