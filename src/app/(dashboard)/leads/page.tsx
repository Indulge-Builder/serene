import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { isGiaDomain, parseGiaDomainParam } from '@/lib/constants/domains';
import { getLeadFilterOptions, getAgentsForDomain, getActiveUsersForDomain } from '@/lib/services/leads-service';
import type { LeadFilters, LeadStatus, CallOutcome } from '@/lib/types/database';
import { LeadsFilters } from '@/components/leads/LeadsFilters';
import { LeadsTableAsync } from '@/components/leads/LeadsTableAsync';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';
import { AddLeadButton } from '@/components/leads/AddLeadButton';

// ─────────────────────────────────────────────
// Parse raw searchParams into a typed LeadFilters object
// ─────────────────────────────────────────────
function parseFilters(searchParams: Awaited<SearchParams>): LeadFilters {
  function getString(key: string): string | null {
    const val = searchParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }

  function getMulti<T extends string>(key: string): T[] | null {
    const raw = getString(key);
    if (!raw) return null;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean) as T[];
    return parts.length > 0 ? parts : null;
  }

  const page     = Math.max(1, parseInt(getString('page') ?? '1', 10) || 1);
  const pageSize = 30;

  return {
    status:            getMulti<LeadStatus>('status'),
    last_call_outcome: getMulti<CallOutcome>('outcome'),
    domain:            parseGiaDomainParam(getString('domain')),
    agent_id:          getString('agent_id'),
    source:            getString('source'),
    campaign:          getString('campaign'),
    date_from:         getString('date_from'),
    date_to:           getString('date_to'),
    search:            getString('search'),
    page,
    pageSize,
  };
}

// ─────────────────────────────────────────────
// Page — thin orchestrator
// ─────────────────────────────────────────────
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (profile.role === 'guest') redirect('/dashboard');

  const resolvedParams = await searchParams;
  const filters        = parseFilters(resolvedParams);

  const [filterOptions, initialAgents] = await Promise.all([
    getLeadFilterOptions(
      profile.role,
      profile.domain,
      filters.domain && isGiaDomain(filters.domain) ? filters.domain : null,
    ),
    (profile.role === 'admin' || profile.role === 'founder')
      ? getActiveUsersForDomain(profile.domain)
      : getAgentsForDomain(profile.domain),
  ]);

  const showAgentFilter  = profile.role !== 'agent';
  const showDomainFilter = profile.role === 'admin' || profile.role === 'founder';

  return (
    <>
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="type-page-title m-0">Leads<span className="page-title-dot">.</span></h1>

          <AddLeadButton
            callerProfile={{
              id:        profile.id,
              role:      profile.role,
              domain:    profile.domain,
              full_name: profile.full_name,
            }}
            initialAgents={initialAgents}
          />
        </div>

        <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <LeadsFilters
            role={profile.role}
            options={filterOptions}
            showAgentFilter={showAgentFilter}
            showDomainFilter={showDomainFilter}
          />
        </div>

        <Suspense fallback={<LeadsTableSkeleton />}>
          <LeadsTableAsync
            role={profile.role}
            userId={profile.id}
            domain={profile.domain}
            filters={filters}
          />
        </Suspense>
      </main>
    </>
  );
}
