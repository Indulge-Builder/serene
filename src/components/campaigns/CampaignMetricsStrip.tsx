// CampaignMetricsStrip — Server Component
// Renders 6 stat cards + agent distribution bar for the campaign detail page.
// Zero DB calls — all data comes via props from the page's Promise.all.

import { formatCompact, formatPercent } from '@/lib/utils/numbers';
import { AgentDistributionBar } from '@/components/campaigns/AgentDistributionBar';
import type { CampaignDetailMetrics, AgentDistributionRow } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────

type SubLabel = {
  text:  string;
  color: string;
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?:  SubLabel;
}) {
  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-4)',
      }}
    >
      {/* Micro label */}
      <p
        className="label-micro"
        style={{ marginBottom: 'var(--space-3)' }}
      >
        {label}
      </p>

      {/* Primary value */}
      <p
        style={{
          fontFamily:  'var(--font-sans)',
          fontSize:    'var(--text-2xl)',
          fontWeight:  'var(--weight-semibold)',
          color:       'var(--theme-text-primary)',
          margin:      sub ? '0 0 var(--space-1)' : '0',
          lineHeight:  'var(--leading-none)',
        }}
      >
        {value}
      </p>

      {/* Sub-label (delta / rate) */}
      {sub && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            color:      sub.color,
            margin:     0,
            lineHeight: 'var(--leading-none)',
          }}
        >
          {sub.text}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Rate helpers — guard division by zero
// total === 0 → "—" for all rate fields
// ─────────────────────────────────────────────

function conversionRateSub(won: number, total: number): SubLabel {
  if (total === 0) return { text: '—', color: 'var(--theme-text-tertiary)' };
  const rate = won / total;
  const text  = `${formatPercent(rate)} conv.`;
  const color =
    rate > 0.1  ? 'var(--color-success-text)' :
    rate < 0.05 ? 'var(--color-danger-text)'  :
                  'var(--theme-text-tertiary)';
  return { text, color };
}

function junkRateSub(junk: number, total: number): SubLabel {
  if (total === 0) return { text: '—', color: 'var(--theme-text-tertiary)' };
  const rate = junk / total;
  const text  = `${formatPercent(rate)} junk rate`;
  const color =
    rate > 0.4  ? 'var(--color-danger-text)'  :
    rate > 0.2  ? 'var(--color-warning-text)' :
                  'var(--theme-text-tertiary)';
  return { text, color };
}

function rnrRateSub(rnr: number, total: number): SubLabel {
  if (total === 0) return { text: '—', color: 'var(--theme-text-tertiary)' };
  return {
    text:  `${formatPercent(rnr / total)} of total`,
    color: 'var(--theme-text-tertiary)',
  };
}

function firstTouchValue(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return '<1h';
  return `${Math.round(hours)}h`;
}

function firstTouchColor(hours: number | null): string {
  if (hours === null) return 'var(--theme-text-tertiary)';
  if (hours < 2)  return 'var(--color-success-text)';
  if (hours > 24) return 'var(--color-warning-text)';
  return 'var(--theme-text-tertiary)';
}

// ─────────────────────────────────────────────
// CampaignMetricsStrip
// ─────────────────────────────────────────────

type CampaignMetricsStripProps = {
  metrics:      CampaignDetailMetrics;
  distribution: AgentDistributionRow[];
};

export function CampaignMetricsStrip({
  metrics,
  distribution,
}: CampaignMetricsStripProps) {
  const { total_leads, won, in_discussion, nurturing, junk, rnr, avg_hours_to_first_touch } =
    metrics;

  const activePipeline = in_discussion + nurturing;

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      {/* Row 1 — 6 stat cards */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap:                 'var(--space-3)',
        }}
        className="md:grid-cols-3 lg:grid-cols-6"
      >
        <StatCard
          label="Total Leads"
          value={formatCompact(total_leads)}
        />

        <StatCard
          label="Won"
          value={formatCompact(won)}
          sub={conversionRateSub(won, total_leads)}
        />

        <StatCard
          label="Active Pipeline"
          value={formatCompact(activePipeline)}
          sub={{ text: 'in discussion + nurturing', color: 'var(--theme-text-tertiary)' }}
        />

        <StatCard
          label="Junk Rate"
          value={total_leads === 0 ? '—' : formatPercent(junk / total_leads)}
          sub={junkRateSub(junk, total_leads)}
        />

        <StatCard
          label="RNR"
          value={formatCompact(rnr)}
          sub={rnrRateSub(rnr, total_leads)}
        />

        <StatCard
          label="Avg. First Touch"
          value={firstTouchValue(avg_hours_to_first_touch)}
          sub={{
            text:  avg_hours_to_first_touch === null
              ? 'no data'
              : avg_hours_to_first_touch < 2
                ? 'excellent'
                : avg_hours_to_first_touch > 24
                  ? 'slow response'
                  : 'on track',
            color: firstTouchColor(avg_hours_to_first_touch),
          }}
        />
      </div>

      {/* Row 2 — Agent distribution bar (only when > 1 agent) */}
      {distribution.length > 1 && (
        <div
          style={{
            marginTop:    'var(--space-3)',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow:    'var(--shadow-1)',
            padding:      'var(--space-4)',
          }}
        >
          <AgentDistributionBar
            distribution={distribution}
            total={total_leads}
          />
        </div>
      )}
    </div>
  );
}
