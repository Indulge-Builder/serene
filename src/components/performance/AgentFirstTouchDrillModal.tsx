'use client';

import { LeadDrillModal } from './LeadDrillModal';
import { getFirstTouchBucketLeadsAction } from '@/lib/actions/performance';
import { FIRST_TOUCH_BUCKETS, type FirstTouchBucketId } from '@/lib/constants/performance';
import type { PerformancePeriod } from '@/lib/services/performance-service';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// AgentFirstTouchDrillModal — the leads behind ONE First-Touch Speed bar.
//
// A thin caller of the shared LeadDrillModal: it only supplies the title +
// fetcher (getFirstTouchBucketLeadsAction, which reuses the scorecard's own
// bucket classification so the list length equals the bar's count). No fetch
// lifecycle, no row, no chrome here — all of that lives in LeadDrillModal /
// LeadDrillRow / DrillModalShell (R-01).
// ─────────────────────────────────────────────

interface Props {
  open: boolean;
  agentId: string;
  agentName: string;
  domain: AppDomain | null;
  bucketId: FirstTouchBucketId | null;
  period: PerformancePeriod;
  customFrom?: string;
  customTo?: string;
  onClose: () => void;
}

export function AgentFirstTouchDrillModal({
  open,
  agentId,
  agentName,
  domain,
  bucketId,
  period,
  customFrom,
  customTo,
  onClose,
}: Props) {
  const bucketLabel = bucketId ? FIRST_TOUCH_BUCKETS.find((b) => b.id === bucketId)?.label ?? '' : '';

  return (
    <LeadDrillModal
      open={open && !!bucketId}
      title={bucketLabel ? `First touch · ${bucketLabel}` : 'First touch'}
      subtitle={agentName}
      emptyLabel="No leads in this bucket."
      fetchKey={`${agentId}:ft:${bucketId ?? ''}:${period}:${customFrom ?? ''}:${customTo ?? ''}`}
      fetcher={() => getFirstTouchBucketLeadsAction(agentId, domain, bucketId as FirstTouchBucketId, period, customFrom, customTo)}
      onClose={onClose}
    />
  );
}
