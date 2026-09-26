import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { Search } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasVendorAccess } from '@/lib/utils/route-access';
import { listVendors, getVendorCategories, listVendorsNeedingReview } from '@/lib/services/vendors-service';
import { VendorsFilters } from '@/components/vendors/VendorsFilters';
import { AddVendorButton } from '@/components/vendors/AddVendorButton';
import { VendorsTable } from '@/components/vendors/VendorsTable';
import { VendorReviewQueue } from '@/components/vendors/VendorReviewQueue';
import { VendorsTableSkeleton } from '@/components/vendors/VendorsTableSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { TOP_BAR_ENABLED } from '@/lib/constants/feature-flags';
import { PageControls } from '@/components/layout/PageControls';
import { VENDOR_LIST_PAGE_SIZE, VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorListFilters } from '@/lib/services/vendors-service';

export const metadata = { title: 'Vendors' };

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
  // Admin, founder, the whole concierge domain (founder, 2026-09-18) and the tech workbench for the
  // page only. The actions ask hasVendorActionAccess; the SQL mirror is can_access_vendors() (0221).
  if (!hasVendorAccess(profile)) redirect('/dashboard');

  const resolved = await searchParams;
  const filters = parseFilters(resolved);
  const [categories, review] = await Promise.all([getVendorCategories(), listVendorsNeedingReview()]);

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
          <span className="max-md:sr-only">Find a vendor</span>
        </Link>
          <AddVendorButton categoriesInUse={categories} />
          {TOP_BAR_ENABLED && <PageControls isPrivileged={false} />}
        </div>
      </div>

      {/* The extractor's unconfirmed rows, newest first (2026-09-21). Renders nothing
          when there are none, so the page is unchanged on a quiet day. Sits above the
          filter bar because it is a to-do, not a view of the table. */}
      <VendorReviewQueue items={review.items} totalCount={review.totalCount} />

      <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
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
