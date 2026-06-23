'use client';

import { PhoneCall, UserRound } from 'lucide-react';
import { LeadDrillModal } from './LeadDrillModal';
import { Avatar } from '@/components/ui/Avatar';
import { getDomainLeadsDrillAction } from '@/lib/actions/performance';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { LeadListItemWithAssignee } from '@/lib/services/leads-service';
import type { AppDomain, CallOutcome } from '@/lib/types/database';

// ─────────────────────────────────────────────
// DomainLeadsDrillModal — the leads behind ONE clicked DOMAIN-card tile on the
// founder Domains tab (Leads / Calls / Deals Closed / Revenue). A thin caller of
// the shared LeadDrillModal (R-01 — same modal/row/fetch-lifecycle the agent
// stat-tile drills use): supplies the title + fetcher (getDomainLeadsDrillAction,
// which reuses getLeadsByRole domain-scoped, no new query). Each row links to the
// lead dossier — consistent with the agent panel's drills.
//
// `kind` maps the tile to the lead slice AND the per-row meta line (renderMeta):
//   'all'   → Leads tile          → assignee chip (who the lead is assigned to)
//   'calls' → Calls tile          → last call outcome
//   'won'   → Deals Closed/Revenue → (no extra meta — the status pill says Won)
// ─────────────────────────────────────────────

export type DomainDrillKind = 'all' | 'calls' | 'won';

const KIND_LABEL: Record<DomainDrillKind, string> = {
  all:   'Leads',
  calls: 'Called leads',
  won:   'Won',
};

// ── Meta line renderers — calm secondary detail under name/phone (token-only,
//    no accent pill: the status pill is the row's one coloured element). ──

/** Assignee chip — tiny initials Avatar + name; "Unassigned" stays quiet. */
function AssigneeMeta({ lead }: { lead: LeadListItemWithAssignee }) {
  const name = lead.assignee?.full_name?.trim();
  if (!name) {
    return (
      <span
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        'var(--space-1)',
          fontFamily: 'var(--font-sans)',
          fontSize:   'var(--text-2xs)',
          fontStyle:  'italic',
          color:      'var(--theme-text-tertiary)',
        }}
      >
        <UserRound style={{ width: 11, height: 11, strokeWidth: 1.5 }} aria-hidden="true" />
        Unassigned
      </span>
    );
  }
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          'var(--space-2)',
        minWidth:     0,
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-2xs)',
        color:        'var(--theme-text-secondary)',
      }}
    >
      <Avatar name={name} size="xs" />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {name}
      </span>
    </span>
  );
}

/** Last call outcome — quiet PhoneCall glyph + the outcome label. */
function OutcomeMeta({ outcome }: { outcome: CallOutcome | null }) {
  if (!outcome) return null;
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          'var(--space-1)',
        minWidth:     0,
        fontFamily:   'var(--font-sans)',
        fontSize:     'var(--text-2xs)',
        color:        'var(--theme-text-tertiary)',
      }}
    >
      <PhoneCall style={{ width: 11, height: 11, strokeWidth: 1.5, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {CALL_OUTCOME_LABELS[outcome] ?? outcome}
      </span>
    </span>
  );
}

interface Props {
  open: boolean;
  domain: AppDomain | null;
  kind: DomainDrillKind | null;
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
  onClose: () => void;
}

export function DomainLeadsDrillModal({
  open,
  domain,
  kind,
  period,
  customFrom,
  customTo,
  onClose,
}: Props) {
  const domainLabel = domain ? (DOMAIN_LABELS[domain] ?? domain) : '';
  const title = kind ? `${domainLabel} · ${KIND_LABEL[kind]}` : domainLabel;

  // Per-kind row meta: 'all' shows the assignee, 'calls' shows the outcome,
  // 'won' adds nothing (the Won status pill already carries the meaning).
  const renderMeta =
    kind === 'all'
      ? (lead: LeadListItemWithAssignee) => <AssigneeMeta lead={lead} />
      : kind === 'calls'
        ? (lead: LeadListItemWithAssignee) => <OutcomeMeta outcome={lead.last_call_outcome as CallOutcome | null} />
        : undefined;

  return (
    <LeadDrillModal
      open={open && !!domain && !!kind}
      title={title}
      subtitle={domainLabel}
      emptyLabel="No leads here."
      fetchKey={`${domain ?? ''}:${kind ?? ''}:${period}:${customFrom ?? ''}:${customTo ?? ''}`}
      fetcher={() =>
        getDomainLeadsDrillAction(domain as AppDomain, kind as DomainDrillKind, period, customFrom, customTo)
      }
      renderMeta={renderMeta}
      onClose={onClose}
    />
  );
}
