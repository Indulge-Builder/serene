import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getQueendoms, listClients } from '@/lib/services/clients-service';
import { ClientsFilters } from '@/components/clients/ClientsFilters';
import { ClientsTable } from '@/components/clients/ClientsTable';
import { ClientsTableSkeleton } from '@/components/clients/ClientsTableSkeleton';
import { AddClientButton } from '@/components/clients/AddClientButton';
import { Pagination } from '@/components/ui/Pagination';
import { CLIENTS_LIST_PAGE_SIZE } from '@/lib/constants/sia-roles';
import { canAccessRoute } from '@/lib/utils/route-access';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import type { ClientListFilters } from '@/lib/types/client';
import type { ClientTier } from '@/lib/constants/client-facets';

// Who sees clients: the whole queendom (any Sia member), admin and founder. The rows are
// RLS-scoped (client_visible); this gate only decides reachability, like every list page.

function parseFilters(sp: Awaited<SearchParams>): ClientListFilters {
  const getString = (key: string): string | null => {
    const v = sp[key];
    if (!v) return null;
    return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };
  const health = getString('health');
  const unlinked = getString('unlinked');
  return {
    search: getString('search'),
    queendom: getString('queendom'),
    tier: (getString('tier') as ClientTier | null) ?? null,
    status: getString('status'),
    health: health === 'low' || health === 'mid' || health === 'high' ? health : null,
    unlinked: unlinked === 'whatsapp' || unlinked === 'freshdesk' || unlinked === 'zoho' || unlinked === 'app' ? unlinked : null,
    page: Math.max(1, parseInt(getString('page') ?? '1', 10) || 1),
  };
}

async function ClientsAsync({ filters }: { filters: ClientListFilters }) {
  const { clients, totalCount } = await listClients(filters);
  const hasFilters = Boolean(filters.search || filters.queendom || filters.tier || filters.status || filters.health || filters.unlinked);
  return (
    <>
      <ClientsTable clients={clients} hasFilters={hasFilters} />
      {totalCount > CLIENTS_LIST_PAGE_SIZE && (
        <Pagination page={filters.page} pageSize={CLIENTS_LIST_PAGE_SIZE} totalCount={totalCount} noun="client" />
      )}
    </>
  );
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, CLIENTS_PATH)) redirect('/dashboard');

  const resolved = await searchParams;
  const filters = parseFilters(resolved);
  const queendoms = await getQueendoms();
  const privileged = profile.role === 'admin' || profile.role === 'founder';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Clients<span className="page-title-dot">.</span>
        </h1>
        <AddClientButton queendoms={queendoms} defaultQueendomId={profile.queendom_id ?? null} canPickQueendom={privileged} />
      </div>

      <div className="mb-4">
        <ClientsFilters queendoms={privileged ? queendoms : queendoms.filter((q) => q.id === profile.queendom_id)} />
      </div>

      <Suspense key={JSON.stringify(filters)} fallback={<ClientsTableSkeleton />}>
        <ClientsAsync filters={filters} />
      </Suspense>
    </main>
  );
}
