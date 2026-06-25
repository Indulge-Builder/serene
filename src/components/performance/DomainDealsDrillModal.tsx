'use client';

import { useState, useEffect } from 'react';
import { DrillModalShell } from './DrillModalShell';
import { DealDrillRow, type DealDrillRowItem } from './DealDrillRow';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDomainDealsDrillAction } from '@/lib/actions/performance';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// DomainDealsDrillModal — the DEALS behind a clicked DOMAIN-card "Deals Closed"
// or "Revenue" tile on the founder Domains tab (2026-06-25). A thin caller of the
// shared DrillModalShell + DealDrillRow (R-01 — the same row AgentDealsDrillModal
// renders) supplying getDomainDealsDrillAction (reuses getDealsByRole, won_at
// range, domain-scoped). Lists DEALS — NOT leads — because the card counts the
// deals table by won_at, so a deal list is the only thing that ties out to the
// card number. Each row links to its lead dossier (walk-ins stay a plain row).
//
// Fetch-on-open, flat + bounded (one domain × one period is small — pageSize 200
// in the action), matching the other Domains-tab drills (DomainLeadsDrillModal).
// ─────────────────────────────────────────────

interface Props {
  open: boolean;
  domain: AppDomain | null;
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
  onClose: () => void;
}

export function DomainDealsDrillModal({ open, domain, period, customFrom, customTo, onClose }: Props) {
  const [rows, setRows] = useState<DealDrillRowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const domainLabel = domain ? (DOMAIN_LABELS[domain] ?? domain) : '';
  // Re-fetch when the slice identity changes (domain / period / custom range).
  const fetchKey = `${domain ?? ''}:${period}:${customFrom ?? ''}:${customTo ?? ''}`;

  useEffect(() => {
    if (!open || !domain) {
      setRows([]);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    getDomainDealsDrillAction(domain, period, customFrom, customTo)
      .then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.data) {
          setError(true);
          return;
        }
        setRows(result.data.deals);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });
    return () => { cancelled = true; };
    // fetchKey encodes every fetch input; domain/period/custom* are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchKey]);

  return (
    <DrillModalShell
      open={open && !!domain}
      title={`${domainLabel} · Deals Closed`}
      subtitle={rows.length > 0 ? `${domainLabel} · ${rows.length} deal${rows.length === 1 ? '' : 's'}` : domainLabel}
      onClose={onClose}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size="md" />
        </div>
      ) : error ? (
        <EmptyState variant="inline" title="Couldn't load deals." size="sm" />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title="No deals closed here." size="sm" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rows.map((deal) => (
            <DealDrillRow key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </DrillModalShell>
  );
}
