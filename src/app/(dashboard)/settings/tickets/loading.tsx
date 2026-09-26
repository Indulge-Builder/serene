// Skeleton for /settings/tickets: back circle + title, then the three panels stacked
// (SLA policies, status names and tags, the intake lessons).

import { Shimmer } from '@/components/ui/PageSkeletons';
import { DossierCardSkeleton } from '@/components/leads/LeadDossierSkeletons';

export default function TicketSettingsLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={120} h={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <DossierCardSkeleton headerWidth={100} rows={4} />
        <DossierCardSkeleton headerWidth={120} rows={3} />
        <DossierCardSkeleton headerWidth={110} rows={3} />
      </div>
    </main>
  );
}
