import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getLeadFilterOptions } from '@/lib/services/leads-service';
import { parseGiaDomainParam } from '@/lib/constants/domains';
import type { DealFilters, AppDomain } from '@/lib/types/database';
import { DealsFilters } from '@/components/deals/DealsFilters';
import { AddDealButton } from '@/components/deals/AddDealButton';
import { DealsAsync } from './DealsAsync';
import { DealsSkeleton } from './DealsSkeleton';

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────
// Parse raw searchParams into DealFilters
// No `status` field — status='won' is a structural service constraint.
// ─────────────────────────────────────────────
function parseFilters(
  searchParams: Awaited<SearchParams>,
  role: string,
  callerDomain: AppDomain,
): DealFilters {
  function getString(key: string): string | null {
    const val = searchParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  function getInt(key: string, fallback: number): number {
    const raw = getString(key);
    const n   = raw ? parseInt(raw, 10) : NaN;
    return isNaN(n) || n < 1 ? fallback : n;
  }

  // Manager: domain always locked — URL param ignored
  const domain: AppDomain | null =
    role === 'manager'
      ? null // manager constraint applied at service level via callerDomain arg
      : parseGiaDomainParam(getString('domain'));

  return {
    search:    getString('search'),
    domain,
    deal_type: getString('deal_type'),
    agent_id:  role === 'agent' ? null : getString('agent_id'),
    date_from: getString('date_from'),
    date_to:   getString('date_to'),
    page:      getInt('page', 1),
    pageSize:  PAGE_SIZE,
  };
}

// ─────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const resolvedParams   = await searchParams;
  const filters          = parseFilters(resolvedParams, profile.role, profile.domain);
  const showDomainFilter = profile.role === 'admin' || profile.role === 'founder';
  const showAgentFilter  = profile.role !== 'agent';

  // Fetch agent list for filter dropdown (once at page level — not in filter component)
  const { agents } = await getLeadFilterOptions(profile.role, profile.domain, null);

  return (
    <main className="flex-1 p-8">
      {/* Row 1 — Page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">Deals<span className="page-title-dot">.</span></h1>
        <AddDealButton
          callerRole={profile.role}
          callerDomain={profile.domain}
          callerName={profile.full_name ?? ''}
          callerId={profile.id}
        />
      </div>

      {/* Row 2 — Filter bar */}
      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
        <DealsFilters
          role={profile.role}
          showDomainFilter={showDomainFilter}
          showAgentFilter={showAgentFilter}
          agents={agents}
        />
      </div>

      {/* Row 3 — Content */}
      <Suspense fallback={<DealsSkeleton />}>
        <DealsAsync
          role={profile.role}
          userId={profile.id}
          domain={profile.domain}
          filters={filters}
          pageSize={PAGE_SIZE}
        />
      </Suspense>
    </main>
  );
}
