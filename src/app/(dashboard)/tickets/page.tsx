import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { Plus } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getQueendoms } from '@/lib/services/clients-service';
import { listTickets, listQueendomStaff } from '@/lib/services/tickets-service';
import { TicketsFilters } from '@/components/tickets/TicketsFilters';
import { TicketsTable } from '@/components/tickets/TicketsTable';
import { TicketsTableSkeleton } from '@/components/tickets/TicketsTableSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { canAccessRoute } from '@/lib/utils/route-access';
import { TICKETS_PATH, TICKETS_LIST_PAGE_SIZE, TICKET_STATUSES, TICKET_CATEGORIES, type TicketStatus, type TicketCategory } from '@/lib/constants/tickets';
import type { TicketListFilters } from '@/lib/types/ticket';

function parseFilters(sp: Awaited<SearchParams>): TicketListFilters {
  const getString = (key: string): string | null => { const v = sp[key]; if (!v) return null; return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null; };
  const statuses = (getString('status') ?? '').split(',').filter((s): s is TicketStatus => (TICKET_STATUSES.values as readonly string[]).includes(s));
  const cat = getString('category');
  return {
    status: statuses, queendom: getString('queendom'), assignee: getString('assignee'),
    category: cat && (TICKET_CATEGORIES.values as readonly string[]).includes(cat) ? (cat as TicketCategory) : null,
    search: getString('search'), mine: getString('mine') === '1', page: Math.max(1, parseInt(getString('page') ?? '1', 10) || 1),
  };
}

async function TicketsAsync({ filters, callerId }: { filters: TicketListFilters; callerId: string }) {
  const { tickets, totalCount } = await listTickets(filters, callerId);
  const hasFilters = Boolean(filters.search || filters.status.length || filters.queendom || filters.assignee || filters.category || filters.mine);
  return (
    <>
      <TicketsTable tickets={tickets} hasFilters={hasFilters} />
      {totalCount > TICKETS_LIST_PAGE_SIZE && <Pagination page={filters.page} pageSize={TICKETS_LIST_PAGE_SIZE} totalCount={totalCount} noun="ticket" />}
    </>
  );
}

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, TICKETS_PATH)) redirect('/dashboard');
  const filters = parseFilters(await searchParams);
  const privileged = profile.role === 'admin' || profile.role === 'founder';
  const [queendoms, staff] = await Promise.all([getQueendoms(), listQueendomStaff(privileged ? null : (profile.queendom_id ?? null))]);
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">Tickets<span className="page-title-dot">.</span></h1>
        <Link href={`${TICKETS_PATH}/new`} className="serene-btn-primary serene-pressable" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap' }}>
          <Plus style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} /> New ticket
        </Link>
      </div>
      <div className="mb-4"><TicketsFilters queendoms={privileged ? queendoms : queendoms.filter((q) => q.id === profile.queendom_id)} staff={staff} /></div>
      <Suspense key={JSON.stringify(filters)} fallback={<TicketsTableSkeleton />}>
        <TicketsAsync filters={filters} callerId={profile.id} />
      </Suspense>
    </main>
  );
}
