import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getLeadsByRoleCached,
  getCampaignDetailMetrics,
  getCampaignAgentDistribution,
} from '@/lib/services/leads-service';
import type { LeadFilters, CampaignDetailMetrics, AgentDistributionRow } from '@/lib/types/database';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsPagination } from '@/components/leads/LeadsPagination';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';
import { CampaignMetricsStrip } from '@/components/campaigns/CampaignMetricsStrip';
import { CampaignMetricsStripSkeleton } from '@/components/campaigns/CampaignMetricsStripSkeleton';

// ─────────────────────────────────────────────
// Metrics strip — async inner component (own Suspense boundary)
// ─────────────────────────────────────────────

async function CampaignMetricsAsync({
  campaignName,
  dateFrom,
  dateTo,
}: {
  campaignName: string;
  dateFrom:     string | null;
  dateTo:       string | null;
}) {
  // All three fetches run in parallel — never sequential awaits
  const [metrics, distribution] = await Promise.all([
    getCampaignDetailMetrics(campaignName, { date_from: dateFrom, date_to: dateTo }),
    getCampaignAgentDistribution(campaignName, { date_from: dateFrom, date_to: dateTo }),
  ]);

  // Campaign not found or no leads — render nothing (table empty state covers it)
  if (!metrics) return null;

  return (
    <CampaignMetricsStrip
      metrics={metrics as CampaignDetailMetrics}
      distribution={distribution as AgentDistributionRow[]}
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

  // Decode: URL-encoded utm_campaign value.
  // decodeURIComponent throws on a malformed percent-sequence (e.g. %GG) → Q-10.
  let campaignName: string;
  try {
    campaignName = decodeURIComponent(id);
  } catch {
    notFound();
    return null as never;
  }

  const resolvedParams = await searchParams;

  function getString(key: string): string | null {
    const val = resolvedParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  const dateFrom = getString('date_from');
  const dateTo   = getString('date_to');
  const page     = Math.max(1, parseInt(getString('page') ?? '1', 10) || 1);

  // campaignName is used identically in both the metrics RPC and the leads query
  // so the metrics and table rows are always for the same set.
  const filters: LeadFilters = {
    status:            null,
    last_call_outcome: null,
    agent_id:          null,
    source:            null,
    campaign:          campaignName,
    date_from:         dateFrom,
    date_to:           dateTo,
    search:            null,
    page,
    pageSize:          50,
  };

  return (
    <main className="flex-1 p-8">
      {/* Back link */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <a
          href="/campaigns"
          style={{
            fontFamily:     'var(--font-sans)',
            fontSize:       'var(--text-xs)',
            fontWeight:     'var(--weight-medium)',
            color:          'var(--theme-text-secondary)',
            textDecoration: 'none',
            letterSpacing:  'var(--tracking-wide)',
            transition:     'color var(--duration-fast) var(--ease-in-out)',
          }}
        >
          ← Campaigns
        </a>
      </div>

      {/* Page title */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="type-page-title" style={{ margin: 0, fontStyle: 'italic' }}>
          {campaignName}<span className="page-title-dot">.</span>
        </h1>
      </div>

      {/* Metrics strip — own Suspense boundary, streams independently of the table */}
      <Suspense fallback={<CampaignMetricsStripSkeleton />}>
        <CampaignMetricsAsync
          campaignName={campaignName}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </Suspense>

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
