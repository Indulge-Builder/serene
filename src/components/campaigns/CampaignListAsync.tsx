// CampaignListAsync — async server component
// Direct child of <Suspense>. Fetches campaign metrics (+ spend, when a date
// range is active) in parallel, then renders CampaignCard list. Each card links
// straight to /campaigns/[id]; ad creatives are fetched on the detail page, not
// here. Never rendered without a Suspense boundary above it.

import { getCampaignMetrics } from '@/lib/services/leads-service';
import { getBudgetSummary } from '@/lib/services/ad-spend-service';
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
  // Spend needs a bounded window — get_budget_summary requires both dates, and
  // a cost figure without a range is meaningless (it would mix lead counts from
  // one window with all-time spend). Only fetch when both bounds are present;
  // the same date_from/date_to drives getCampaignMetrics below, so cost and
  // lead counts always describe the SAME window on each row (no date drift).
  const hasRange = Boolean(filters.date_from && filters.date_to);

  const [campaigns, spendRows] = await Promise.all([
    getCampaignMetrics(role, callerDomain, filters),
    hasRange
      ? getBudgetSummary(filters.date_from as string, filters.date_to as string)
      : Promise.resolve([]),
  ]);

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

  // Spend mapped once by normalised campaign key
  // (campaign_name.toLowerCase().trim() === ad_spend_daily.campaign_key). One
  // getBudgetSummary fetch above feeds every card; never a per-card spend call.
  const spendMap = new Map(spendRows.map((r) => [r.campaignKey, r]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {campaigns.map((campaign, i) => {
        const spend = spendMap.get(campaign.campaign_name.toLowerCase().trim());
        return (
          <CampaignCard
            key={`${campaign.campaign_name}::${campaign.domain}`}
            campaign={campaign}
            index={i}
            // null (not 0) when no range or no spend row for this campaign — the
            // card renders "—", never ₹0 (costPerLead's null contract).
            totalSpend={spend ? spend.totalSpend : null}
            costPerLead={spend ? spend.costPerLead : null}
          />
        );
      })}
    </div>
  );
}
