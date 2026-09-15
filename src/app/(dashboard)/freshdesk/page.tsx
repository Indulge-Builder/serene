import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getFreshdeskClientScope,
  getFreshdeskFilterVocab,
  getFreshdeskOverview,
  hasFreshdeskFilters,
  listFreshdeskTickets,
} from '@/lib/services/freshdesk-service';
import { FreshdeskFilters } from '@/components/freshdesk/FreshdeskFilters';
import { FreshdeskOverview, FreshdeskOverviewSkeleton } from '@/components/freshdesk/FreshdeskOverview';
import { FreshdeskTable } from '@/components/freshdesk/FreshdeskTable';
import { FreshdeskTableSkeleton } from '@/components/freshdesk/FreshdeskTableSkeleton';
import { SyncNowButton } from '@/components/freshdesk/SyncNowButton';
import { Pagination } from '@/components/ui/Pagination';
import Link from 'next/link';
import { FRESHDESK_LIST_PAGE_SIZE, FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { dateFromUrlParam } from '@/lib/utils/filter-params';
import { toISTMidnight, toISTEndOfDay } from '@/lib/utils/ist';
import type { FdTicketListFilters } from '@/lib/types/freshdesk';

// The Freshdesk mirror is admin/founder for now — the same audience as the 0193 posture
// (service_role tables, the page gate is the trust boundary), exactly like /vendors.
function canSee(role: string): boolean {
  return role === 'admin' || role === 'founder';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFilters(sp: Awaited<SearchParams>): FdTicketListFilters {
  const getString = (key: string): string | null => {
    const v = sp[key];
    if (!v) return null;
    return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };
  const num = (v: string | null): number | null => (v && /^\d+$/.test(v) ? Number(v) : null);
  const from = dateFromUrlParam(getString('date_from'));
  const to = dateFromUrlParam(getString('date_to'));
  return {
    search: getString('search'),
    status: (getString('status') ?? '').split(',').filter((s) => /^\d+$/.test(s)).map(Number),
    group: num(getString('group')),
    agent: num(getString('agent')),
    category: getString('category'),
    priority: num(getString('priority')),
    dateFrom: from ? toISTMidnight(from).toISOString() : null,
    dateTo: to ? toISTEndOfDay(to).toISOString() : null,
    client: (() => { const v = getString('client'); return v && UUID_RE.test(v) ? v : null; })(),
    page: Math.max(1, parseInt(getString('page') ?? '1', 10) || 1),
  };
}

async function TicketsAsync({ filters }: { filters: FdTicketListFilters }) {
  const { tickets, totalCount } = await listFreshdeskTickets(filters);
  return (
    <>
      <FreshdeskTable tickets={tickets} hasFilters={hasFreshdeskFilters(filters)} />
      {totalCount > FRESHDESK_LIST_PAGE_SIZE && (
        <Pagination page={filters.page} pageSize={FRESHDESK_LIST_PAGE_SIZE} totalCount={totalCount} noun="ticket" />
      )}
    </>
  );
}

/** The strip answers for the same filters as the table (the page number is irrelevant to it). */
async function OverviewAsync({ filters }: { filters: FdTicketListFilters }) {
  const overview = await getFreshdeskOverview(filters);
  return <FreshdeskOverview overview={overview} />;
}

export default async function FreshdeskPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canSee(profile.role)) redirect('/dashboard');

  const resolved = await searchParams;
  const filters = parseFilters(resolved);
  const [vocab, scope] = await Promise.all([
    getFreshdeskFilterVocab(),
    filters.client ? getFreshdeskClientScope(filters.client) : Promise.resolve(null),
  ]);
  // The strip depends on every filter except the page number: paging must not re-count.
  const overviewKey = `overview:${JSON.stringify({ ...filters, page: 1 })}`;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Freshdesk<span className="page-title-dot">.</span>
        </h1>
        <SyncNowButton />
      </div>

      <Suspense key={overviewKey} fallback={<FreshdeskOverviewSkeleton />}>
        <OverviewAsync filters={filters} />
      </Suspense>

      <div className="mb-4">
        <FreshdeskFilters vocab={vocab} />
      </div>

      {filters.client && (
        <p style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
          Tickets for{' '}
          {scope ? <Link href={`${CLIENTS_PATH}/${scope.id}`} style={{ color: 'var(--neu-accent-deep)' }}>{scope.full_name}</Link> : 'one client'}
          {' · '}
          <Link href={FRESHDESK_PATH} style={{ color: 'var(--neu-accent-deep)' }}>Show all</Link>
        </p>
      )}

      <Suspense key={`tickets:${JSON.stringify(filters)}`} fallback={<FreshdeskTableSkeleton />}>
        <TicketsAsync filters={filters} />
      </Suspense>
    </main>
  );
}
