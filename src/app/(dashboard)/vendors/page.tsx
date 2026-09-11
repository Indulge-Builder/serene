import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { Search } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { listVendors, getVendorCategories } from '@/lib/services/vendors-service';
import { VendorsFilters } from '@/components/vendors/VendorsFilters';
import { AddVendorButton } from '@/components/vendors/AddVendorButton';
import { VendorsTable } from '@/components/vendors/VendorsTable';
import { VendorsTableSkeleton } from '@/components/vendors/VendorsTableSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { VENDOR_LIST_PAGE_SIZE, VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorListFilters } from '@/lib/services/vendors-service';

// The vendor module is admin/founder for now — the same audience as the
// 0183–0186 SELECT policies. This redirect is the page-level mirror of the
// action-level requireProfile gate, exactly like /oversight and /budget.
function canSeeVendors(role: string): boolean {
  return role === 'admin' || role === 'founder';
}

function parseFilters(searchParams: Awaited<SearchParams>): VendorListFilters {
  function getString(key: string): string | null {
    const val = searchParams[key];
    if (!val) return null;
    return typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? null) : null;
  }
  return {
    search: getString('search'),
    category: getString('category'),
    page: Math.max(1, parseInt(getString('page') ?? '1', 10) || 1),
  };
}

/** Async child — the only place the list query is called, so a filter change
 *  re-renders the table alone and the filter bar stays put. */
async function VendorsTableAsync({ filters }: { filters: VendorListFilters }) {
  const { vendors, totalCount } = await listVendors(filters);
  return (
    <>
      <VendorsTable vendors={vendors} />
      {/* The shared pager rewrites ONLY `page` on the URL, so the search and the
          category filter survive the click. The first pager here was a bare
          `?page=N` link and dropped both on the way to page two. */}
      {totalCount > VENDOR_LIST_PAGE_SIZE && (
        <Pagination
          page={filters.page ?? 1}
          pageSize={VENDOR_LIST_PAGE_SIZE}
          totalCount={totalCount}
          noun="vendor"
        />
      )}
    </>
  );
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canSeeVendors(profile.role)) redirect('/dashboard');

  const resolved = await searchParams;
  const filters = parseFilters(resolved);
  const categories = await getVendorCategories();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Vendors<span className="page-title-dot">.</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Link
          href={`${VENDORS_PATH}/find`}
          className="serene-btn-secondary serene-pressable"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            whiteSpace: 'nowrap',
          }}
        >
          <Search style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
          Find a vendor
        </Link>
          <AddVendorButton categoriesInUse={categories} />
        </div>
      </div>

      <div className="mb-4">
        <VendorsFilters categories={categories} />
      </div>

      {/* Keyed so a filter change re-shows the skeleton (the leads-page rule:
          a transition alone would hold the old table with no feedback). */}
      <Suspense key={JSON.stringify(filters)} fallback={<VendorsTableSkeleton />}>
        <VendorsTableAsync filters={filters} />
      </Suspense>
    </main>
  );
}
