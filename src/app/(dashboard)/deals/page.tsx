import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { cookies } from 'next/headers';
import { getLeadFilterOptions } from '@/lib/services/leads-service';
import { resolveDomainParam } from '@/lib/utils/domain-scope';
import { getNotifications } from '@/lib/services/notifications-service';
import { resolveDateRangePreset } from '@/lib/constants/date-range-presets';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
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
  // Final scope domain from resolveDomainParam (param-first, cookie-fallback for
  // admin/founder; already null for manager/agent — no role branch needed here).
  scopeDomain: AppDomain | null,
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

  return {
    search:        getString('search'),
    domain:        scopeDomain,
    deal_type:     getString('deal_type'),
    deal_category: getString('deal_category'),
    agent_id:      role === 'agent' ? null : getString('agent_id'),
    date_from:     getString('date_from'),
    date_to:       getString('date_to'),
    page:          getInt('page', 1),
    pageSize:      PAGE_SIZE,
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

  const [resolvedParams, cookieStore] = await Promise.all([searchParams, cookies()]);

  // Default the date range to "This Month" on a cold landing (no date params at
  // all). Redirect so the URL is the single source of truth — the filter bar's
  // Range trigger then reads "This Month", and the query + summary scope to it.
  // `?dates=all` is the escape hatch the Clear action lands on (date_from/to
  // null but dates=all present) so clearing isn't re-defaulted back to a month.
  const hasDateParam =
    'date_from' in resolvedParams ||
    'date_to' in resolvedParams ||
    'dates' in resolvedParams;
  if (!hasDateParam) {
    const { from, to } = resolveDateRangePreset('this_month');
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (typeof value === 'string') next.set(key, value);
      else if (Array.isArray(value) && value[0] != null) next.set(key, value[0]);
    }
    next.set('date_from', from);
    next.set('date_to', to);
    redirect(`/deals?${next.toString()}`);
  }

  const showDomainFilter = profile.role === 'admin' || profile.role === 'founder';

  // Single shared resolver: param-first, serene-domain cookie fallback for
  // admin/founder; null for manager/agent (force-scoped server-side).
  const scopeDomain = resolveDomainParam(resolvedParams, cookieStore, profile.role);

  const filters = parseFilters(resolvedParams, profile.role, scopeDomain);
  const showAgentFilter  = profile.role !== 'agent';

  // Fetch agent list for filter dropdown (once at page level — not in filter component)
  const { agents } = await getLeadFilterOptions(profile.role, profile.domain, null);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Row 1 — Page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">Deals<span className="page-title-dot">.</span></h1>
        <div className="flex items-center gap-3">
          <AddDealButton
            callerRole={profile.role}
            callerDomain={profile.domain}
            callerName={profile.full_name ?? ''}
            callerId={profile.id}
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
      {/* key: any filter/search/page change remounts the boundary so the
          skeleton re-shows while the new rows fetch — without it the transition
          holds the stale list with zero pending feedback. */}
      <Suspense key={JSON.stringify(filters)} fallback={<DealsSkeleton />}>
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
