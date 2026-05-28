import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import type { CampaignFilters, AppDomain } from '@/lib/types/database';
import { CampaignFilters as CampaignFiltersBar } from '@/components/campaigns/CampaignFilters';
import { CampaignListAsync } from '@/components/campaigns/CampaignListAsync';
import { CampaignListSkeleton } from '@/components/campaigns/CampaignListSkeleton';

// ─────────────────────────────────────────────
// Parse raw searchParams into CampaignFilters
// ─────────────────────────────────────────────
function parseFilters(
  searchParams: Awaited<SearchParams>,
  role: string,
  callerDomain: AppDomain,
): CampaignFilters {
  function getString(key: string): string | null {
    const val = searchParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  // Manager: domain always locked to their own — URL param is ignored
  const domain: AppDomain | null =
    role === 'manager'
      ? callerDomain
      : (getString('domain') as AppDomain | null);

  return {
    date_from: getString('date_from'),
    date_to:   getString('date_to'),
    domain,
  };
}

// ─────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (profile.role === 'agent' || profile.role === 'guest') redirect('/dashboard');

  const resolvedParams = await searchParams;
  const filters = parseFilters(resolvedParams, profile.role, profile.domain);

  return (
    <main className="flex-1 p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">Campaigns</h1>
      </div>

      <div
        style={{
          padding:      'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          border:       '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper)',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        <CampaignFiltersBar role={profile.role} filters={filters} />
      </div>

      <Suspense fallback={<CampaignListSkeleton />}>
        <CampaignListAsync
          role={profile.role}
          callerDomain={profile.domain}
          filters={filters}
        />
      </Suspense>
    </main>
  );
}
