import { formatCount, formatCurrency } from '@/lib/utils/numbers';
import { StatTile } from '@/components/ui/StatTile';
import type { DealsSummary } from '@/lib/services/deals-service';
import type { AppDomain } from '@/lib/types/database';
import { DOMAIN_DEAL_CONFIG } from '@/lib/constants/deal-types';
import { isGiaDomain } from '@/lib/constants/domains';

type DealsSummaryStripProps = {
  summary: DealsSummary;
  // The active scope domain (already resolved by resolveDomainParam → filters.domain).
  // null = all-domains view → show both type counts. A scoped domain shows only the
  // count cell for its derived deal_type (DOMAIN_DEAL_CONFIG): onboarding→membership,
  // shop→retail, house/legacy→sale (neither extra cell — there is no sale_count).
  domain?: AppDomain | null;
};

function StatDivider() {
  return (
    <div
      aria-hidden="true"
      className="max-sm:hidden"
      style={{
        width:      '1px',
        alignSelf:  'stretch',
        background: 'var(--theme-paper-border)',
        margin:     'var(--space-2) 0',
        flexShrink: 0,
      }}
    />
  );
}

export function DealsSummaryStrip({ summary, domain = null }: DealsSummaryStripProps) {
  // Which deal_type is in scope? null (all domains) → show both type counts.
  // A scoped Gia domain → only the cell matching its derived deal_type.
  const scopedType =
    domain && isGiaDomain(domain) ? DOMAIN_DEAL_CONFIG[domain].type : null;

  const showMemberships = scopedType === null || scopedType === 'membership';
  const showRetail      = scopedType === null || scopedType === 'retail';

  return (
    <div
      className="grid grid-cols-2 sm:flex sm:items-stretch"
      style={{
        marginBottom: 'var(--space-4)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      <StatTile
        variant="cell"
        label="Total Deals"
        value={formatCount(summary.total_deals)}
      />
      <StatDivider />
      <StatTile
        variant="cell"
        label="Total Revenue"
        value={formatCurrency(summary.total_revenue)}
      />
      {showMemberships && (
        <>
          <StatDivider />
          <StatTile
            variant="cell"
            label="Memberships"
            value={formatCount(summary.membership_count)}
          />
        </>
      )}
      {showRetail && (
        <>
          <StatDivider />
          <StatTile
            variant="cell"
            label="Retail"
            value={formatCount(summary.retail_count)}
          />
        </>
      )}
    </div>
  );
}
