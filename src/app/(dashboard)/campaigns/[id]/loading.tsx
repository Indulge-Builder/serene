// Skeleton for /campaigns/[id]: back circle + campaign title, then the SAME two fallbacks the
// page's own Suspense boundaries use (metrics strip, leads table), so the first paint and the
// streaming phase are one steady shape.

import { Shimmer } from '@/components/ui/PageSkeletons';
import { CampaignMetricsStripSkeleton } from '@/components/campaigns/CampaignMetricsStripSkeleton';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';

export default function CampaignDetailLoading() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <Shimmer w={36} h={36} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <Shimmer w={260} h={32} />
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <CampaignMetricsStripSkeleton />
      </div>

      <LeadsTableSkeleton />
    </main>
  );
}
