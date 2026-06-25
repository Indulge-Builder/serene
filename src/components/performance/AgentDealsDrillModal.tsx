'use client';

import { useState, useEffect, useCallback } from 'react';
import { DrillModalShell } from './DrillModalShell';
import { DealDrillRow, type DealDrillRowItem } from './DealDrillRow';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAgentDealsScopedAction } from '@/lib/actions/performance';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// AgentDealsDrillModal — the target agent's won deals (founder/manager deck).
// Reuses the existing getDealsByRole path via getAgentDealsScopedAction
// (filters.agent_id = agentId). Page-based load-more. Fetch on open only.
// Rows render through the shared DealDrillRow (R-01 — the same row the domain
// deals drill uses).
// ─────────────────────────────────────────────

type DealRow = DealDrillRowItem;

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  domain: AppDomain | null;
  onClose: () => void;
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
          {rows.map((deal) => (
            <DealDrillRow key={deal.id} deal={deal} />
          ))}

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
