'use client';

import { LeadDrillModal } from './LeadDrillModal';
import { getAgentLeadsByPredicateAction } from '@/lib/actions/performance';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { AppDomain, LeadStatus, CallOutcome } from '@/lib/types/database';

// ─────────────────────────────────────────────
// AgentLeadsPredicateDrillModal — the leads behind ONE clicked Lead-Pipeline
// segment (a status) OR Call-Outcome slice (a latest-outcome). A thin caller of
// the shared LeadDrillModal: supplies the title + fetcher
// (getAgentLeadsByPredicateAction, which reuses getLeadsByRole's indexed
// status / last_call_outcome predicates). One modal serves both chart drills —
// `predicate` is a discriminated union (R-01).
//
// Outcome drill = distinct leads whose LATEST call was that outcome (not call
// events) — the subtitle says "leads", never a count implying donut parity.
// ─────────────────────────────────────────────

export type DrillPredicate =
  | { kind: 'status'; value: LeadStatus }
  | { kind: 'outcome'; value: CallOutcome };

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  domain: AppDomain | null;
  predicate: DrillPredicate | null;
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
  onClose: () => void;
}

export function AgentLeadsPredicateDrillModal({
  open,
  agentId,
  agentName,
  domain,
  predicate,
  period,
  customFrom,
  customTo,
  onClose,
}: Props) {
  const label = predicate
    ? predicate.kind === 'status'
      ? LEAD_STATUS_LABELS[predicate.value] ?? predicate.value
      : CALL_OUTCOME_LABELS[predicate.value] ?? predicate.value
    : '';
  const title = predicate
    ? predicate.kind === 'status'
      ? `Pipeline · ${label}`
      : `Outcome · ${label}`
    : 'Leads';

  return (
    <LeadDrillModal
      open={open && !!predicate}
      title={title}
      subtitle={agentName}
      emptyLabel="No leads here."
      fetchKey={`${agentId}:${predicate?.kind ?? ''}:${predicate?.value ?? ''}:${period}:${customFrom ?? ''}:${customTo ?? ''}`}
      fetcher={() =>
        getAgentLeadsByPredicateAction(
          agentId,
          domain,
          period,
          predicate?.kind === 'status'
            ? { status: predicate.value }
            : { outcome: predicate?.value },
          customFrom,
          customTo,
        )
      }
      onClose={onClose}
    />
  );
}
