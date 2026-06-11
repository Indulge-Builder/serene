import { formatCount, formatCurrency } from '@/lib/utils/numbers';
import { StatTile } from '@/components/ui/StatTile';
import type { DealsSummary } from '@/lib/services/deals-service';

type DealsSummaryStripProps = {
  summary: DealsSummary;
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

export function DealsSummaryStrip({ summary }: DealsSummaryStripProps) {
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
      <StatDivider />
      <StatTile
        variant="cell"
        label="Memberships"
        value={formatCount(summary.membership_count)}
      />
      <StatDivider />
      <StatTile
        variant="cell"
        label="Retail"
        value={formatCount(summary.retail_count)}
      />
    </div>
  );
}
