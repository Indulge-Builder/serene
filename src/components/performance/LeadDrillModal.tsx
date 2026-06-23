'use client';

import { useState, useEffect } from 'react';
import { DrillModalShell } from './DrillModalShell';
import { LeadDrillRow } from './LeadDrillRow';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ActionResult } from '@/lib/types/index';
import type { LeadListItemWithAssignee } from '@/lib/services/leads-service';

// ─────────────────────────────────────────────
// LeadDrillModal — THE generic fetch-on-open lead-list drill (flat, bounded,
// no load-more). One agent × one slice (a first-touch bucket, a pipeline status,
// a call outcome) is a small set, so the whole list arrives in one call and the
// rows render as LeadDrillRow (each a dossier Link).
//
// The caller supplies a `fetcher` returning the leads — every chart/metric drill
// is just a different fetcher + title (R-01: one modal, one row, one fetch
// lifecycle). Composes DrillModalShell (nested-modal z contract). Fetch-on-open
// only: nothing runs until `open` flips true, so it costs the page nothing.
//
// `fetchKey` is a string the effect depends on so re-opening with a NEW slice
// (same modal instance) re-fetches — the caller derives it from whatever its
// fetcher closes over (e.g. `${agentId}:${status}:${period}`).
// ─────────────────────────────────────────────

interface Props {
  open: boolean;
  title: string;
  /** Right-of-name context, e.g. the agent name. Lead count is appended here. */
  subtitle?: string;
  /** Empty-state copy when the slice has no leads. */
  emptyLabel?: string;
  /** Re-runs the fetch when it changes (slice identity). */
  fetchKey: string;
  fetcher: () => Promise<ActionResult<LeadListItemWithAssignee[]>>;
  /**
   * Optional per-row meta line passed to LeadDrillRow (e.g. the domain Calls
   * drill renders the last call outcome, the Leads drill renders the assignee).
   * Omitted = the original name/phone/status row, unchanged for every caller.
   */
  renderMeta?: (lead: LeadListItemWithAssignee) => React.ReactNode;
  onClose: () => void;
}

export function LeadDrillModal({ open, title, subtitle, emptyLabel = 'No leads here.', fetchKey, fetcher, renderMeta, onClose }: Props) {
  const [rows, setRows] = useState<LeadListItemWithAssignee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.data) {
          setError(true);
          return;
        }
        setRows(result.data);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` is recreated each render; `fetchKey` is the stable slice identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchKey]);

  const fullSubtitle =
    rows.length > 0
      ? `${subtitle ? `${subtitle} · ` : ''}${rows.length} lead${rows.length === 1 ? '' : 's'}`
      : subtitle;

  return (
    <DrillModalShell open={open} title={title} subtitle={fullSubtitle} onClose={onClose}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size="md" />
        </div>
      ) : error ? (
        <EmptyState variant="inline" title="Couldn't load leads." size="sm" />
      ) : rows.length === 0 ? (
        <EmptyState variant="inline" title={emptyLabel} size="sm" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {rows.map((lead) => (
            <LeadDrillRow key={lead.id} lead={lead} meta={renderMeta?.(lead)} />
          ))}
        </div>
      )}
    </DrillModalShell>
  );
}
