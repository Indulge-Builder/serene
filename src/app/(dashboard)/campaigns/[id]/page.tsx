import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getLeadsByRoleCached,
  getCampaignDetailMetrics,
  getCampaignAgentDistribution,
} from '@/lib/services/leads-service';
import { getAdCreativesForCampaign } from '@/lib/services/ad-creatives-service';
import { getBudgetSummary } from '@/lib/services/ad-spend-service';
import { beautifyCampaignTitle, normalizeCampaignKey } from '@/lib/utils/campaigns';
import { resolveDateRangePreset } from '@/lib/constants/date-range-presets';
import type { LeadFilters, CampaignDetailMetrics, AgentDistributionRow } from '@/lib/types/database';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsPagination } from '@/components/leads/LeadsPagination';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';
import { CampaignMetricsStrip } from '@/components/campaigns/CampaignMetricsStrip';
import { CampaignMetricsStripSkeleton } from '@/components/campaigns/CampaignMetricsStripSkeleton';
import { CampaignAdPanel } from '@/components/campaigns/CampaignAdPanel';
import { BackButton } from '@/components/ui/BackButton';

// ─────────────────────────────────────────────
// Metrics strip — async inner component (own Suspense boundary)
// ─────────────────────────────────────────────

async function CampaignMetricsAsync({
  campaignName,
  dateFrom,
  dateTo,
}: {
  campaignName: string;
  dateFrom:     string;
  dateTo:       string;
}) {
  // All fetches run in parallel — never sequential awaits. Spend reuses the
  // SAME getBudgetSummary source as the /campaigns list cards (R-01 — no new
  // query, no new RPC) and the IDENTICAL date_from/date_to that drive the
  // metrics RPC, so spend and lead counts always describe the same window.
  const [metrics, distribution, spendRows] = await Promise.all([
    getCampaignDetailMetrics(campaignName, { date_from: dateFrom, date_to: dateTo }),
    getCampaignAgentDistribution(campaignName, { date_from: dateFrom, date_to: dateTo }),
    getBudgetSummary(dateFrom, dateTo),
  ]);

  // Campaign not found or no leads — render nothing (table empty state covers it)
  if (!metrics) return null;

  // Spend matched on the normalised campaign key — the same toLowerCase().trim()
  // invariant the ad_spend_daily.campaign_key column and the list-page map use.
  // null when no spend row exists for this campaign/window → the tile shows "—".
  const spend = spendRows.find(
    (r) => r.campaignKey === normalizeCampaignKey(campaignName),
  );

  return (
    <CampaignMetricsStrip
      metrics={metrics as CampaignDetailMetrics}
      distribution={distribution as AgentDistributionRow[]}
      totalSpend={spend ? spend.totalSpend : null}
    />
  );
}

// ─────────────────────────────────────────────
// Leads table — async inner component (own Suspense boundary)
// ─────────────────────────────────────────────

async function CampaignLeadsAsync({
  campaignName,
  role,
  userId,
  domain,
  filters,
}: {
  campaignName: string;
  role:         Parameters<typeof getLeadsByRoleCached>[0];
  userId:       string;
  domain:       Parameters<typeof getLeadsByRoleCached>[2];
  filters:      LeadFilters;
}) {
  const { leads, totalCount } = await getLeadsByRoleCached(role, userId, domain, filters);

  const pageSize = filters.pageSize ?? 50;
  const page     = filters.page ?? 1;

  return (
    <div>
      <LeadsTable
        leads={leads}
        userId={userId}
        role={role}
        filters={filters}
        hasActiveFilters={!!campaignName}
      />
      {totalCount > pageSize && (
        <LeadsPagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (profile.role === 'agent' || profile.role === 'guest') redirect('/dashboard');

  const { id } = await params;

  // Decode the campaign key. CampaignCard encodes with encodeURIComponent, so
  // the lossless inverse is decodeURIComponent — it round-trips a literal '+'
  // (Meta "Advantage+" campaigns), '/', and spaces, all of which appear in real
  // utm_campaign keys. Falls back to the raw param if a hand-typed URL is not
  // valid percent-encoding (decodeURIComponent throws on a stray '%').
  let campaignName: string;
  try {
    campaignName = decodeURIComponent(id);
  } catch {
    campaignName = id;
  }

  // Display-only beautified title via shared utility.
  // campaignName is used for all DB lookups — never campaignTitle.
  const campaignTitle = beautifyCampaignTitle(campaignName);

  const resolvedParams = await searchParams;

  function getString(key: string): string | null {
    const val = resolvedParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  const urlFrom = getString('date_from');
  const urlTo   = getString('date_to');
  const page    = Math.max(1, parseInt(getString('page') ?? '1', 10) || 1);

  // Effective window. The detail page defaults to "This Month" (the same preset
  // the Range filter offers) so Amount Spent always shows a real figure and the
  // metrics/leads/spend all describe one window. A picked range (both bounds)
  // overrides it; a half-set range falls back to the default so the three reads
  // never diverge. resolveDateRangePreset is the shared IST-anchored resolver —
  // never re-fork the month-boundary math here.
  const thisMonth = resolveDateRangePreset('this_month');
  const dateFrom  = urlFrom && urlTo ? urlFrom : thisMonth.from;
  const dateTo    = urlFrom && urlTo ? urlTo   : thisMonth.to;

  // campaignName is used identically in both the metrics RPC and the leads query
  // so the metrics and table rows are always for the same set.
  const filters: LeadFilters = {
    status:            null,
    last_call_outcome: null,
    domain:            null,
    agent_id:          null,
    source:            null,
    campaign:          campaignName,
    date_from:         dateFrom,
    date_to:           dateTo,
    search:            null,
    // Campaign drill-down is an analytics view of EVERY lead in the campaign —
    // a manager here must see the whole domain, never be scoped to their own
    // leads. 'all' overrides the My-Leads default getLeadsByRole applies.
    view:              'all',
    page,
    pageSize:          50,
  };

  // A campaign may have multiple ad videos — fetch them all (newest first).
  const adCreatives = await getAdCreativesForCampaign(campaignName);

  // Inline ad-creative upload is admin/founder only — the same gate
  // upsertAdCreative enforces server-side (managers can view this page but
  // never see the add-a-video affordance).
  const canUpload = profile.role === 'admin' || profile.role === 'founder';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Page header — back button + Playfair title */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <BackButton href="/campaigns" label="Back to Campaigns" />

        <h1 className="type-page-title" style={{ margin: 0, fontStyle: 'italic' }}>
          {campaignTitle}<span className="page-title-dot">.</span>
        </h1>
      </div>

      {/* Video + metrics row — ad video on the left, the 8 score tiles (2×4) on
          the right. The video panel renders immediately (creatives awaited
          up-front); the metrics stream into the right column via Suspense, so a
          slow RPC never delays the video. Stacks to one column below lg. */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[320px_1fr]"
        style={{ gap: 'var(--space-6)', marginBottom: 'var(--space-6)', alignItems: 'start' }}
      >
        {/* Left — ad video (or the add-a-video tile when empty) */}
        <CampaignAdPanel
          adCreatives={adCreatives}
          campaignKey={normalizeCampaignKey(campaignName)}
          canUpload={canUpload}
        />

        {/* Right — metrics strip, own Suspense boundary */}
        <Suspense fallback={<CampaignMetricsStripSkeleton />}>
          <CampaignMetricsAsync
            campaignName={campaignName}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </Suspense>
      </div>

      {/* Leads table — own Suspense boundary */}
      <Suspense fallback={<LeadsTableSkeleton />}>
        <CampaignLeadsAsync
          campaignName={campaignName}
          role={profile.role}
          userId={profile.id}
          domain={profile.domain}
          filters={filters}
        />
      </Suspense>
    </main>
  );
}
