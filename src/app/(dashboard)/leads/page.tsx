import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { cookies } from 'next/headers';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { isGiaDomain, parseGiaDomainParam } from '@/lib/constants/domains';
import { resolveDomainParam } from '@/lib/utils/domain-scope';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { CondensingPageHeader } from '@/components/layout/CondensingPageHeader';
import type { LeadFilters, LeadStatus, CallOutcome } from '@/lib/types/database';
import { FilterBarSkeleton } from '@/components/ui/PageSkeletons';
import { LeadsFiltersAsync } from '@/components/leads/LeadsFiltersAsync';
import { LeadsTableAsync } from '@/components/leads/LeadsTableAsync';
import { LeadsTableSkeleton } from '@/components/leads/LeadsTableSkeleton';
import { AddLeadButton } from '@/components/leads/AddLeadButton';

export const metadata = { title: 'Leads' };

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

  const isPrivileged = profile.role === 'admin' || profile.role === 'founder';
  // Agents also get the domain filter (2026-08-07) — a cross-domain agent can
  // narrow their own list to one domain. Additive narrowing only: the service
  // composes it on top of assigned_to = userId, never widening scope.
  const showDomainFilter = isPrivileged || profile.role === 'agent';

  // Single shared resolver owns the domain decision: param-first, serene-domain
  // cookie fallback for admin/founder; agent reads the ?domain= param only
  // (allowAgentParam — this page opts in); null for manager (getLeadsByRole
  // force-scopes them regardless). Overwrites the param-only value parseFilters set.
  filters.domain = resolveDomainParam(resolvedParams, cookieStore, profile.role, {
    allowAgentParam: true,
  });

  // Manager "My Leads" default: a manager lands on their own assigned leads
  // (same daily experience as an agent) unless they explicitly switch to All
  // Leads via the table's View toggle (?view=all). An absent param = 'mine'.
  // The toggle is manager-only — agents are always own-scoped, admin/founder
  // have no toggle (their param stays whatever parseFilters set, unused below).
  if (profile.role === 'manager' && filters.view !== 'all') {
    filters.view = 'mine';
  }

  // Nothing else is awaited before the header (2026-09-16, perf): the filter
  // option lists stream in behind <LeadsFiltersAsync> below, and the Add Lead
  // modal fetches its assignee list on first open (getAssignableUsersAction —
  // admin/founder: every active user in the domain; everyone else: the
  // lead-carrying roles). The header paints as soon as the profile resolves.
  const optionsScopeDomain =
    filters.domain && isGiaDomain(filters.domain) ? filters.domain : null;

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
        {/* Sticky header — condenses past 24px scroll (polish §07) */}
        <CondensingPageHeader title="Leads">
          <AddLeadButton
            callerProfile={{
              id:        profile.id,
              role:      profile.role,
              domain:    profile.domain,
              full_name: profile.full_name,
            }}
          />
          {TOP_BAR_ENABLED && (
            <PageControls
              isPrivileged={isPrivileged}
            />
          )}
        </CondensingPageHeader>

        {/* Filter strip streams in behind its own boundary; the skeleton is the
            same Row 2 paper strip the route loading.tsx shows. No key: a scope
            change keeps the current strip through the transition. */}
        <Suspense fallback={<FilterBarSkeleton chips={[80, 96, 88, 100]} />}>
          <LeadsFiltersAsync
            role={profile.role}
            domain={profile.domain}
            scopeDomain={optionsScopeDomain}
            showAgentFilter={showAgentFilter}
            showDomainFilter={showDomainFilter}
          />
        </Suspense>

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
