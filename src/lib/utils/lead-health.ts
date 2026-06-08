export type LeadHealth = 'healthy' | 'needs_attention' | 'at_risk';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null, fallback: string): number {
  const ref = iso ?? fallback;
  return (Date.now() - new Date(ref).getTime()) / MS_PER_DAY;
}

/**
 * Computes the health tier for a lead from its current snapshot.
 * Pure function — no DB calls, no imports from services.
 *
 * Rules (first match wins, evaluated top-to-bottom):
 *   1. Terminal statuses (won/lost/junk)   → null
 *   2. at_risk  — any of:
 *      - last_activity_at > 7d ago (or null + created_at > 7d ago)
 *      - status='new' AND created_at > 5d AND call_count=0
 *      - status='touched' AND status_changed_at > 14d ago
 *   3. needs_attention — any of:
 *      - last_activity_at > 3d ago (or null + created_at > 3d ago)
 *      - overdue_followup_count > 0
 *   4. Else healthy
 */
export function computeLeadHealth(lead: {
  last_activity_at: string | null;
  created_at: string;
  status: string;
  call_count: number;
  status_changed_at: string | null;
  overdue_followup_count: number;
}): LeadHealth | null {
  if (['won', 'lost', 'junk'].includes(lead.status)) return null;

  const activityAge = daysSince(lead.last_activity_at, lead.created_at);
  const createdAge  = daysSince(null, lead.created_at);

  // at_risk
  if (activityAge > 7) return 'at_risk';
  if (lead.status === 'new' && createdAge > 5 && lead.call_count === 0) return 'at_risk';
  if (
    lead.status === 'touched' &&
    lead.status_changed_at &&
    daysSince(lead.status_changed_at, lead.created_at) > 14
  ) return 'at_risk';

  // needs_attention
  if (activityAge > 3) return 'needs_attention';
  if (lead.overdue_followup_count > 0) return 'needs_attention';

  return 'healthy';
}
