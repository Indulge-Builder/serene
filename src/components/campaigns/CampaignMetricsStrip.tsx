// CampaignMetricsStrip — Server Component
// Renders 6 stat cards + agent distribution bar for the campaign detail page.
// Zero DB calls — all data comes via props from the page's Promise.all.

import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/numbers';
import { StatTile, type StatTileSub } from '@/components/ui/StatTile';
import { AgentDistributionBar } from '@/components/campaigns/AgentDistributionBar';
import type { CampaignDetailMetrics, AgentDistributionRow } from '@/lib/types/database';

type SubLabel = StatTileSub;

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
  /** Ad spend for the active window (BudgetCampaignRow.totalSpend, same source
   *  as the /campaigns list cards). null → no spend row → tile renders "—". */
  totalSpend?:  number | null;
};

export function CampaignMetricsStrip({
  metrics,
  distribution,
  totalSpend = null,
}: CampaignMetricsStripProps) {
  const { total_leads, won, in_discussion, nurturing, junk, rnr, avg_hours_to_first_touch } =
    metrics;

  const activePipeline = in_discussion + nurturing;

  const hasSpend = totalSpend !== null && totalSpend !== undefined;
  // Cost per lead is derived from the SAME window's spend + leads — "—" (never
  // ₹0) when there is no spend row or no leads, matching the list-page contract.
  const costPerLead = hasSpend && total_leads > 0 ? totalSpend / total_leads : null;

  return (
    <div>
      {/* 8 stat cards (6 pipeline + Amount Spent + Cost/Lead) as a 2×4 grid —
          sits in the right column beside the ad video on the detail page.
          Inline grid-template-columns would override the responsive classes —
          the column count must live in classes only.
          Below sm it drops to a single column; from sm up it is the 2×4 grid. */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 'var(--space-3)' }}
      >
        <StatTile
          label="Total Leads"
          value={formatCompact(total_leads)}
        />

        <StatTile
          label="Won"
          value={formatCompact(won)}
          sub={conversionRateSub(won, total_leads)}
        />

        <StatTile
          label="Active Pipeline"
          value={formatCompact(activePipeline)}
          sub={{ text: 'in discussion + nurturing', color: 'var(--theme-text-tertiary)' }}
        />

        <StatTile
          label="Junk Rate"
          value={total_leads === 0 ? '—' : formatPercent(junk / total_leads)}
          sub={junkRateSub(junk, total_leads)}
        />

        <StatTile
          label="RNR"
          value={formatCompact(rnr)}
          sub={rnrRateSub(rnr, total_leads)}
        />

        <StatTile
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

        {/* Amount Spent — ad spend for the active window (from /budget uploads,
            reusing getBudgetSummary). "—" when no spend row, never ₹0. */}
        <StatTile
          label="Amount Spent"
          value={hasSpend ? formatCurrency(Math.round(totalSpend as number)) : '—'}
        />

        {/* Cost / Lead — spend ÷ leads for the SAME window. "—" at zero leads or
            no spend (the costPerLead null contract), never ₹0. */}
        <StatTile
          label="Cost / Lead"
          value={costPerLead === null ? '—' : formatCurrency(Math.round(costPerLead))}
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
