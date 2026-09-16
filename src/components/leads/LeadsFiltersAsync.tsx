// Server component — fetches the filter option lists and renders the filter
// strip (LeadsFilters inside the Row 2 paper strip of the page contract).
// Must be the direct child of a Suspense boundary in page.tsx with
// <FilterBarSkeleton> as the fallback (2026-09-16, perf: the leads header no
// longer waits on this query — the title + Add Lead CTA paint first, the
// strip streams in). The LeadsTableAsync pattern applied to the filter row.
import { getLeadFilterOptions } from '@/lib/services/leads-service';
import { LeadsFilters } from '@/components/leads/LeadsFilters';
import type { AppDomain, UserRole } from '@/lib/types/database';
import type { GiaDomain } from '@/lib/constants/domains';

type Props = {
  role: UserRole;
  /** The caller's own domain (profile.domain). */
  domain: AppDomain;
  /** The resolved global-domain scope (a Gia domain) for option narrowing, or null. */
  scopeDomain: GiaDomain | null;
  showAgentFilter: boolean;
  showDomainFilter: boolean;
};

export async function LeadsFiltersAsync({
  role,
  domain,
  scopeDomain,
  showAgentFilter,
  showDomainFilter,
}: Props) {
  const options = await getLeadFilterOptions(role, domain, scopeDomain);

  return (
    <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
      <LeadsFilters
        role={role}
        options={options}
        showAgentFilter={showAgentFilter}
        showDomainFilter={showDomainFilter}
      />
    </div>
  );
}
