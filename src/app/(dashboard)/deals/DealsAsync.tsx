import { getDealsByRole, getDealsSummary } from '@/lib/services/deals-service';
import { DealCard } from '@/components/deals/DealCard';
import { DealsSummaryStrip } from '@/components/deals/DealsSummaryStrip';
import { LeadsPagination } from '@/components/leads/LeadsPagination';
import type { UserRole, AppDomain, DealFilters } from '@/lib/types/database';

type DealsAsyncProps = {
  role:         UserRole;
  userId:       string;
  domain:       AppDomain;
  filters:      DealFilters;
  pageSize:     number;
};

export async function DealsAsync({
  role,
  userId,
  domain,
  filters,
  pageSize,
}: DealsAsyncProps) {
  const [{ deals, totalCount }, summary] = await Promise.all([
    getDealsByRole(role, userId, domain, filters),
    getDealsSummary(role, userId, domain, filters),
  ]);

  const page             = filters.page ?? 1;
  const hasActiveFilters =
    !!(filters.search || filters.domain || filters.deal_type || filters.agent_id || filters.date_from || filters.date_to);

  return (
    <>
      <DealsSummaryStrip summary={summary} />

      {deals.length === 0 ? (
        <div
          style={{
            padding:   'var(--space-16) var(--space-8)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              fontSize:   'var(--text-lg)',
              color:      'var(--theme-text-secondary)',
              margin:     0,
            }}
          >
            {hasActiveFilters ? 'Nothing matches these filters.' : 'No deals recorded yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {deals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} index={i} />
          ))}
        </div>
      )}

      {totalCount > pageSize && (
        <LeadsPagination page={page} pageSize={pageSize} totalCount={totalCount} />
      )}
    </>
  );
}
