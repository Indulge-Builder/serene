import { formatCount, formatCurrency } from '@/lib/utils/numbers';
import type { DealsSummary } from '@/lib/services/deals-service';

type DealsSummaryStripProps = {
  summary: DealsSummary;
};

type StatCellProps = {
  label: string;
  value: string;
};

function StatCell({ label, value }: StatCellProps) {
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        flex:           1,
        padding:        'var(--space-4) var(--space-5)',
        minWidth:       '120px',
      }}
    >
      <span
        style={{
          fontFamily:  'var(--font-serif)',
          fontSize:    'var(--text-2xl)',
          fontWeight:  'var(--weight-normal)',
          color:       'var(--theme-accent)',
          lineHeight:  1.1,
          marginBottom:'var(--space-1)',
          whiteSpace:  'nowrap',
        }}
      >
        {value}
      </span>
      <span
        className="label-micro"
        style={{
          color:     'var(--theme-text-tertiary)',
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatDivider() {
  return (
    <div
      aria-hidden="true"
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
      style={{
        display:      'flex',
        alignItems:   'stretch',
        marginBottom: 'var(--space-4)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      <StatCell
        label="Total Deals"
        value={formatCount(summary.total_deals)}
      />
      <StatDivider />
      <StatCell
        label="Total Revenue"
        value={formatCurrency(summary.total_revenue)}
      />
      <StatDivider />
      <StatCell
        label="Memberships"
        value={formatCount(summary.membership_count)}
      />
      <StatDivider />
      <StatCell
        label="Retail"
        value={formatCount(summary.retail_count)}
      />
    </div>
  );
}
