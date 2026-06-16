import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { cookies } from 'next/headers';
import { getCurrentProfile, getAssignableUsers } from '@/lib/services/profiles-service';
import { isGiaDomain, parseGiaDomainParam } from '@/lib/constants/domains';
import { LEAD_ASSIGNABLE_ROLES } from '@/lib/constants/roles';
import { resolveDomainParam } from '@/lib/utils/domain-scope';
import { getLeadFilterOptions } from '@/lib/services/leads-service';
import { getNotifications } from '@/lib/services/notifications-service';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
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
    going_cold:        searchParams.going_cold === 'true' ? true : undefined,
    revival:           searchParams.revival === 'true' ? true : undefined,
    view:              getString('view') === 'all' ? 'all' : getString('view') === 'mine' ? 'mine' : null,
    sort_order:        (searchParams.sort_order === 'asc' || searchParams.sort_order === 'desc')
                         ? searchParams.sort_order
                         : 'desc',
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

  const [resolvedParams, cookieStore] = await Promise.all([searchParams, cookies()]);
  const filters = parseFilters(resolvedParams);

  const showDomainFilter = profile.role === 'admin' || profile.role === 'founder';

  // Single shared resolver owns the domain decision: param-first, serene-domain
  // cookie fallback for admin/founder; null for manager/agent (getLeadsByRole
  // force-scopes them regardless). Overwrites the param-only value parseFilters set.
  filters.domain = resolveDomainParam(resolvedParams, cookieStore, profile.role);

  // Manager "My Leads" default: a manager lands on their own assigned leads
  // (same daily experience as an agent) unless they explicitly switch to All
  // Leads via the table's View toggle (?view=all). An absent param = 'mine'.
  // The toggle is manager-only — agents are always own-scoped, admin/founder
  // have no toggle (their param stays whatever parseFilters set, unused below).
  if (profile.role === 'manager' && filters.view !== 'all') {
    filters.view = 'mine';
  }

  const [filterOptions, initialAgents] = await Promise.all([
    getLeadFilterOptions(
      profile.role,
      profile.domain,
      filters.domain && isGiaDomain(filters.domain) ? filters.domain : null,
    ),
    // Admin/founder: all active users in their domain; everyone else: the
    // lead-carrying roles (agents + managers, LEAD_ASSIGNABLE_ROLES).
    getAssignableUsers({
      domain: profile.domain,
      roles:
        profile.role === 'admin' || profile.role === 'founder'
          ? undefined
          : LEAD_ASSIGNABLE_ROLES,
    }),
  ]);

  // Agent filter: never for agents (they only see their own). For a manager it
  // is meaningful only in the "All Leads" view — in My Leads the list is already
  // force-scoped to the manager, so an agent pick would be a silent no-op; hide
  // it there. Admin/founder always get it.
  const showAgentFilter =
    profile.role === 'manager'
      ? filters.view === 'all'
      : profile.role !== 'agent';

  return (
    <>
      {/* DNA §9.2 page-padding ladder: px-4 mobile → px-6 tablet → px-8 desktop */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="type-page-title m-0">Leads<span className="page-title-dot">.</span></h1>

          <div className="flex items-center gap-3">
            <AddLeadButton
              callerProfile={{
                id:        profile.id,
                role:      profile.role,
                domain:    profile.domain,
                full_name: profile.full_name,
              }}
              initialAgents={initialAgents}
            />
            {TOP_BAR_ENABLED && (
              <PageControls
                userId={profile.id}
                isPrivileged={showDomainFilter}
                notificationsPromise={getNotifications(profile.id)}
              />
            )}
          </div>
        </div>

        <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
          <LeadsFilters
            role={profile.role}
            options={filterOptions}
            showAgentFilter={showAgentFilter}
            showDomainFilter={showDomainFilter}
          />
        </div>

        {/* key: any filter/search/page/sort change remounts the boundary so the
            skeleton re-shows while the new rows fetch — without it the transition
            holds the stale table with zero pending feedback. */}
        <Suspense key={JSON.stringify(filters)} fallback={<LeadsTableSkeleton />}>
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
