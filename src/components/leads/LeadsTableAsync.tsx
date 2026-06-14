import { createClient } from '@/lib/supabase/server';
import { getLeadsByRoleCached } from '@/lib/services/leads-service';
import { getOpenCandidatesForCaller } from '@/lib/services/revival-service';
import type { LeadFilters, UserRole, AppDomain } from '@/lib/types/database';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsPagination } from '@/components/leads/LeadsPagination';
import { RevivalReviewBanner, type RevivalReviewRow } from '@/components/leads/RevivalReviewBanner';

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

  // Revival review banner — surfaces the AI reasoning + the shared <ReviveLeadButton>
  // beside each candidate (the leads table can only show identity). Only built for
  // the ?revival=true view; the candidate map is RLS-scoped on the session client.
  let revivalRows: RevivalReviewRow[] = [];
  if (filters.revival) {
    const supabase = await createClient();
    const candidates = await getOpenCandidatesForCaller(supabase);
    revivalRows = leads
      .map((l): RevivalReviewRow | null => {
        const c = candidates.get(l.id);
        if (!c) return null;
        return {
          leadId: l.id,
          slug: l.slug ?? null,
          name: [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed lead',
          status: l.status,
          candidateId: c.candidateId,
          reasoning: c.reasoning,
          verdict: c.verdict,
          suggestedReviveAt: c.suggestedReviveAt,
        };
      })
      .filter((r): r is RevivalReviewRow => r !== null);
  }

  const pageSize = filters.pageSize ?? 30;
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
      filters.search ||
      filters.going_cold ||
      filters.revival
    );

  return (
    <div>
      {filters.revival && <RevivalReviewBanner rows={revivalRows} />}

      <LeadsTable
        leads={leads}
        userId={userId}
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        goingCold={!!filters.going_cold}
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
