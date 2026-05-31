import { getLeadsByRoleCached } from '@/lib/services/leads-service';
import type { LeadFilters, UserRole, AppDomain } from '@/lib/types/database';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsPagination } from '@/components/leads/LeadsPagination';

type LeadsTableAsyncProps = {
  role:    UserRole;
  userId:  string;
  domain:  AppDomain;
  filters: LeadFilters;
};

// Async server component — fetches leads + totalCount with applied filters,
// then hands off to LeadsTable (presentation) and LeadsPagination (navigation).
// Must be the direct child of the Suspense boundary in page.tsx.
export async function LeadsTableAsync({
  role,
  userId,
  domain,
  filters,
}: LeadsTableAsyncProps) {
  const { leads, totalCount } = await getLeadsByRoleCached(role, userId, domain, filters);

  const pageSize = filters.pageSize ?? 50;
  const page     = filters.page ?? 1;

  const hasActiveFilters =
    !!(
      (filters.status && filters.status.length > 0) ||
      (filters.last_call_outcome && filters.last_call_outcome.length > 0) ||
      filters.domain ||
      filters.agent_id ||
      filters.source ||
      filters.campaign ||
      filters.date_from ||
      filters.date_to ||
      filters.search
    );

  return (
    <div>
      <LeadsTable
        leads={leads}
        userId={userId}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Pagination — absent when all results fit on one page */}
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
