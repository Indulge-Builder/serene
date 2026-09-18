import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getQueendoms, listMembers } from '@/lib/services/members-service';
import { MembersFilters } from '@/components/members/MembersFilters';
import { MembersTable } from '@/components/members/MembersTable';
import { MembersTableSkeleton } from '@/components/members/MembersTableSkeleton';
import { AddMemberButton } from '@/components/members/AddMemberButton';
import { Pagination } from '@/components/ui/Pagination';
import { CLIENTS_LIST_PAGE_SIZE } from '@/lib/constants/sia-roles';
import { canAccessRoute } from '@/lib/utils/route-access';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import type { MemberListFilters } from '@/lib/types/member';
import type { MemberTier } from '@/lib/constants/member-facets';

// Who sees members: the whole queendom (any Sia member), admin and founder. The rows are
// RLS-scoped (member_visible); this gate only decides reachability, like every list page.

function parseFilters(sp: Awaited<SearchParams>): MemberListFilters {
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
    tier: (getString('tier') as MemberTier | null) ?? null,
    status: getString('status'),
    health: health === 'low' || health === 'mid' || health === 'high' ? health : null,
    unlinked: unlinked === 'whatsapp' || unlinked === 'freshdesk' || unlinked === 'zoho' || unlinked === 'app' || unlinked === 'queendom' ? unlinked : null,
    page: Math.max(1, parseInt(getString('page') ?? '1', 10) || 1),
  };
}

async function MembersAsync({ filters }: { filters: MemberListFilters }) {
  const { members, totalCount } = await listMembers(filters);
  const hasFilters = Boolean(filters.search || filters.queendom || filters.tier || filters.status || filters.health || filters.unlinked);
  return (
    <>
      <MembersTable members={members} hasFilters={hasFilters} />
      {totalCount > CLIENTS_LIST_PAGE_SIZE && (
        <Pagination page={filters.page} pageSize={CLIENTS_LIST_PAGE_SIZE} totalCount={totalCount} noun="member" />
      )}
    </>
  );
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
          Members<span className="page-title-dot">.</span>
        </h1>
        <AddMemberButton queendoms={queendoms} defaultQueendomId={profile.queendom_id ?? null} canPickQueendom={privileged} />
      </div>

      <div className="mb-4">
        <MembersFilters queendoms={privileged ? queendoms : queendoms.filter((q) => q.id === profile.queendom_id)} />
      </div>

      <Suspense key={JSON.stringify(filters)} fallback={<MembersTableSkeleton />}>
        <MembersAsync filters={filters} />
      </Suspense>
    </main>
  );
}
