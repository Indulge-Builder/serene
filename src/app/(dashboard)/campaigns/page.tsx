import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { cookies } from 'next/headers';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { resolveDomainParam } from '@/lib/utils/domain-scope';
import { getNotifications } from '@/lib/services/notifications-service';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
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
  // Scope domain from resolveDomainParam (param-first, cookie-fallback for
  // admin/founder; null for manager/agent). Manager is re-locked to callerDomain
  // here — the page-level half of the two-layer domain lock (the service forces
  // it too).
  scopeDomain: AppDomain | null,
): CampaignFilters {
  function getString(key: string): string | null {
    const val = searchParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  // Manager: domain always locked to their own (resolver returned null). Admin/
  // founder: the resolved scope.
  const domain: AppDomain | null =
    role === 'manager' ? callerDomain : scopeDomain;

  return {
    date_from: getString('date_from'),
    date_to:   getString('date_to'),
    domain,
    search:    getString('search'),
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

  const [resolvedParams, cookieStore] = await Promise.all([searchParams, cookies()]);
  const showDomainFilter = profile.role === 'admin' || profile.role === 'founder';

  // Single shared resolver: param-first, serene-domain cookie fallback for
  // admin/founder; null for manager/agent. Manager is re-locked to callerDomain
  // inside parseFilters; agents are already redirected above.
  const scopeDomain = resolveDomainParam(resolvedParams, cookieStore, profile.role);

  const filters = parseFilters(resolvedParams, profile.role, profile.domain, scopeDomain);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">Campaigns<span className="page-title-dot">.</span></h1>
        {TOP_BAR_ENABLED && (
          <PageControls
            userId={profile.id}
            isPrivileged={showDomainFilter}
            notificationsPromise={getNotifications(profile.id)}
          />
        )}
      </div>

      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <CampaignFiltersBar
          role={profile.role}
          showDomainFilter={showDomainFilter}
        />
      </div>

      {/* key: any filter/search change remounts the boundary so the skeleton
          re-shows while the new list fetches — without it the transition holds
          the stale cards with zero pending feedback. */}
      <Suspense key={JSON.stringify(filters)} fallback={<CampaignListSkeleton />}>
        <CampaignListAsync
          role={profile.role}
          callerDomain={profile.domain}
          filters={filters}
        />
      </Suspense>
    </main>
  );
}
