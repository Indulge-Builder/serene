'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/numbers';
import { formatDate } from '@/lib/utils/dates';
import { DEAL_TYPE_LABELS, type DealType } from '@/lib/constants/deal-types';
import type { DealsResult } from '@/lib/services/deals-service';

// ─────────────────────────────────────────────
// DealDrillRow — THE single deal row (contact · type · won date · amount) for the
// performance drill-down modals. Extracted from AgentDealsDrillModal (2026-06-25)
// so the DOMAIN-card "Deals Closed"/"Revenue" drill renders an identical row —
// never copy-paste a second deal drill row (R-01; the LeadDrillRow precedent).
//
// A deal links to its LEAD dossier only when it has one — walk-in deals (lead_id
// null) have nowhere to navigate, so they stay a plain row. The route change
// unmounts the portaled modal; the dossier back-arrow returns to /performance
// (the ?from=/performance convention the lead drills use).
// ─────────────────────────────────────────────

export type DealDrillRowItem = DealsResult['deals'][number];

function dealTypeLabel(t: string | null): string | null {
  if (!t) return null;
  return DEAL_TYPE_LABELS[t as DealType] ?? t;
}

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--theme-paper-subtle)',
  border: '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--radius-md)',
} as const;

export function DealDrillRow({ deal }: { deal: DealDrillRowItem }) {
  const type = dealTypeLabel(deal.deal_type);
  const leadHref = deal.lead_id
    ? `/leads/${deal.lead?.slug ?? deal.lead_id}?from=${encodeURIComponent('/performance')}`
    : null;

  const rowInner = (
    <>
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
    </>
  );

  return leadHref ? (
    <Link
      href={leadHref}
      className="serene-pressable serene-touch"
      style={{ ...ROW_STYLE, textDecoration: 'none', cursor: 'pointer' }}
    >
      {rowInner}
    </Link>
  ) : (
    <div style={ROW_STYLE}>{rowInner}</div>
  );
}
