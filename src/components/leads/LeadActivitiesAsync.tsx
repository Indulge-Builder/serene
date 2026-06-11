import { getLeadActivitiesFull } from '@/lib/services/leads-service';
import { LeadJourneyTimeline } from '@/components/leads/LeadJourneyTimeline';
import { LeadActivityLog } from '@/components/leads/LeadActivityLog';
import type { Lead } from '@/lib/types/database';

type Props = {
  lead: Lead;
};

/**
 * Async server component — direct child of <Suspense>. One activities fetch
 * feeds both the journey timeline and the chronological activity log (they
 * stream together — splitting them would double the query for zero gain).
 * Owns the page-section margins so the fallback can mirror them exactly.
 */
export async function LeadActivitiesAsync({ lead }: Props) {
  const activities = await getLeadActivitiesFull(lead.id);

  return (
    <>
      {/* Journey progress */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <LeadJourneyTimeline lead={lead} activities={activities} />
      </div>

      {/* Chronological activity history */}
      <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <LeadActivityLog activities={activities} />
      </div>
    </>
  );
}
