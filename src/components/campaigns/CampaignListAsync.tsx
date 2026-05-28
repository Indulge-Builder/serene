// CampaignListAsync — async server component
// Direct child of <Suspense>. Fetches campaign metrics and renders CampaignCard list.
// Never rendered without a Suspense boundary above it.

import { getCampaignMetrics } from '@/lib/services/leads-service';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import type { UserRole, AppDomain, CampaignFilters } from '@/lib/types/database';

type CampaignListAsyncProps = {
  role:         UserRole;
  callerDomain: AppDomain;
  filters:      CampaignFilters;
};

export async function CampaignListAsync({
  role,
  callerDomain,
  filters,
}: CampaignListAsyncProps) {
  const campaigns = await getCampaignMetrics(role, callerDomain, filters);

  if (campaigns.length === 0) {
    return (
      <div
        style={{
          padding:    'var(--space-16) var(--space-8)',
          textAlign:  'center',
        }}
      >
        <p
          style={{
            fontFamily:  'var(--font-serif)',
            fontStyle:   'italic',
            fontSize:    'var(--text-lg)',
            fontWeight:  'var(--weight-light)',
            color:       'var(--theme-text-tertiary)',
            margin:      0,
            lineHeight:  'var(--leading-snug)',
          }}
        >
          No campaigns match these filters.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {campaigns.map((campaign, i) => (
        <CampaignCard
          key={`${campaign.campaign_name}::${campaign.domain}`}
          campaign={campaign}
          index={i}
        />
      ))}
    </div>
  );
}
