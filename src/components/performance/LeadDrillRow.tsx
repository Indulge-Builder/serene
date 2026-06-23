'use client';

import Link from 'next/link';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/constants/lead-statuses';
import type { LeadsResult } from '@/lib/services/leads-service';
import type { LeadStatus } from '@/lib/types/database';

// ─────────────────────────────────────────────
// LeadDrillRow — THE single lead row for the performance drill-down modals
// (name + phone + status pill). Extracted from AgentLeadsDrillModal so the
// First-Touch bucket drill renders an identical row — never copy-paste a second
// drill lead row (R-01). The whole row is a Link to the lead dossier
// (`/leads/${slug ?? id}` + a `from=/performance` back-param — the LeadsTable
// convention); a route change unmounts the portaled drill modal, so no manual
// close. Display-only otherwise (A-06).
//
// `meta` is an optional calm secondary line below name/phone — the caller decides
// the per-drill detail (e.g. the domain Calls drill renders the last call outcome,
// the domain Leads drill renders the assignee chip). Omitted = the original row,
// byte-identical, so every existing caller stays unchanged.
// ─────────────────────────────────────────────

type LeadRow = LeadsResult['leads'][number];

export function LeadDrillRow({ lead, meta }: { lead: LeadRow; meta?: React.ReactNode }) {
  const status = lead.status as LeadStatus;
  const colors = LEAD_STATUS_COLORS[status];
  const href = `/leads/${lead.slug ?? lead.id}?from=${encodeURIComponent('/performance')}`;
  return (
    <Link
      href={href}
      className="serene-pressable serene-touch"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--theme-paper-subtle)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        cursor: 'pointer',
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
        {meta && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '1px', minWidth: 0 }}>
            {meta}
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
    </Link>
  );
}
