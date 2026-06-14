'use client';

import { useState, useEffect, useCallback } from 'react';
import { DrillModalShell } from './DrillModalShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAgentLeadsScopedAction } from '@/lib/actions/performance';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/constants/lead-statuses';
import type { LeadsResult } from '@/lib/services/leads-service';
import type { AppDomain, LeadStatus } from '@/lib/types/database';

// ─────────────────────────────────────────────
// AgentLeadsDrillModal — the target agent's assigned leads (founder/manager deck).
// Reuses the existing getLeadsByRole path via getAgentLeadsScopedAction
// (filters.agent_id = agentId). Page-based load-more. Fetch on open only.
// ─────────────────────────────────────────────

type LeadRow = LeadsResult['leads'][number];

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  domain: AppDomain | null;
  onClose: () => void;
}

export function AgentLeadsDrillModal({ open, agentId, agentName, domain, onClose }: Props) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(false);
      const result = await getAgentLeadsScopedAction(agentId, domain, nextPage);
      setLoading(false);
      if (!result.data) {
        setError(true);
        return;
      }
      setRows((prev) => (nextPage > 1 ? [...prev, ...result.data!.leads] : result.data!.leads));
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
      title="Assigned leads"
      subtitle={total > 0 ? `${agentName} · ${total} lead${total === 1 ? '' : 's'}` : agentName}
      onClose={onClose}
    >
      {loading && rows.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size="md" />
        </div>
      ) : error && rows.length === 0 ? (
        <EmptyState variant="inline" title="Couldn't load leads." size="sm" />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title="No leads assigned." size="sm" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rows.map((lead) => {
            const status = lead.status as LeadStatus;
            const colors = LEAD_STATUS_COLORS[status];
            return (
              <div
                key={lead.id}
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
                    {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead'}
                  </span>
                  {lead.phone && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                      {lead.phone}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 'var(--weight-medium)',
                    background: colors?.light ?? 'var(--theme-paper-subtle)',
                    color: colors?.text ?? 'var(--theme-text-secondary)',
                    border: `1px solid ${colors?.border ?? 'var(--theme-paper-border)'}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {LEAD_STATUS_LABELS[status] ?? lead.status}
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
