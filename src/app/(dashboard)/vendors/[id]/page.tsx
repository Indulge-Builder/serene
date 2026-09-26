import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasVendorAccess, hasElevatedPageAccess } from '@/lib/utils/route-access';
import {
  getVendorDetail,
  getVendorInvoices,
  getVendorCategories,
  resolveMergedVendorId,
  getLikelyDuplicates,
  readExtractionEvidence,
} from '@/lib/services/vendors-service';
import { BackButton } from '@/components/ui/BackButton';
import { VendorIdentityCard } from '@/components/vendors/VendorIdentityCard';
import { VendorScoreCard } from '@/components/vendors/VendorScoreCard';
import { VendorInvoicesCard } from '@/components/vendors/VendorInvoicesCard';
import { VendorNotesCard } from '@/components/vendors/VendorNotesCard';
import { VendorAdminActions } from '@/components/vendors/VendorAdminActions';
import { VendorVerifyBanner } from '@/components/vendors/VendorVerifyBanner';
import { VENDORS_PATH } from '@/lib/constants/vendors';
import { formatDate } from '@/lib/utils/dates';

export const metadata = { title: 'Vendor' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function VendorPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!hasVendorAccess(profile)) redirect('/dashboard');

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // Where Back goes. A vendor is reached from the list AND from Find a vendor,
  // and each passes its own URL (filters, or the search) through ?from= — the
  // leads pattern. Validated against our own prefix so the param can never
  // send anyone off the app; anything else falls back to the list.
  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith(VENDORS_PATH) ? rawFrom : VENDORS_PATH;

  // One read for the whole page — every card is a slice of the same shape, so a
  // per-card Suspense boundary would only fan the same query out.
  const [detail, invoices, categoriesInUse] = await Promise.all([
    getVendorDetail(id),
    getVendorInvoices(id),
    getVendorCategories(),
  ]);
  if (!detail) {
    // A merged-away id (0227): the row is gone, but vendor_merges says where it
    // went. A bookmark, a ticket note or a chat from last week still lands on the
    // supplier instead of a 404.
    const trail = await resolveMergedVendorId(id);
    if (trail) redirect(`${VENDORS_PATH}/${trail.keptVendorId}${sp.from ? `?from=${encodeURIComponent(rawFrom ?? '')}` : ''}`);
    notFound();
  }

  // The review step (2026-09-21): an extractor-written row nobody has confirmed
  // gets its evidence and its likely duplicates on the page. Nothing for a
  // hand-entered or archive vendor.
  const extracted = detail.vendor.sources.includes('freshdesk_live');
  const needsReview = extracted && detail.vendor.identity_status === 'unverified' && !detail.vendor.deleted_at;
  const likelyDuplicates = needsReview || hasElevatedPageAccess(profile) ? await getLikelyDuplicates(detail.vendor) : [];

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <BackButton href={backHref} label="Back" />
        <h1 className="type-page-title m-0" style={{ minWidth: 0, flex: '1 1 200px' }}>
          {detail.vendor.name}
          <span className="page-title-dot">.</span>
        </h1>
        {/* Merge and Remove are admin/founder only — the two writes here that are not
            additive. Everyone else on the concierge floor (0221) gets the page without
            them, rather than a button that refuses. */}
        {hasElevatedPageAccess(profile) && (
          <VendorAdminActions
            vendor={detail.vendor}
            history={{
              jobs: detail.engagements.length,
              reviews: detail.reviews.length,
              notes: detail.notes.length,
            }}
            suggested={likelyDuplicates}
          />
        )}
      </div>

      {needsReview && (
        <VendorVerifyBanner
          vendorId={detail.vendor.id}
          vendorName={detail.vendor.name}
          evidence={readExtractionEvidence(detail.vendor)}
          likelyDuplicates={likelyDuplicates.map((d) => ({ id: d.id, name: d.name, category: d.category, home_city: d.home_city }))}
          canMergeOrRemove={hasElevatedPageAccess(profile)}
        />
      )}

      {/* A removed vendor still opens by direct link, on purpose: that is how someone
          restores it. It must never be mistaken for a live one. */}
      {detail.vendor.deleted_at && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-6)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-warning-light)',
            color: 'var(--color-warning-text)',
            fontSize: 'var(--text-sm)',
          }}
        >
          This vendor was hidden on {formatDate(detail.vendor.deleted_at)}. It does not appear in the vendor list, in
          search, or in Find a vendor. Everything it knows is still here, and Restore puts it back.
        </div>
      )}

      {/* Top row: identity and score side by side, level with each other — the
          shared dossier grid (1fr + 320px), the same one /leads/[id] uses. Its
          default stretch alignment is what keeps the two cards the same height;
          invoices and notes run full width beneath, so the wide reading
          material is never squeezed into a column. */}
      <div className="serene-dossier-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <VendorIdentityCard
          categoriesInUse={categoriesInUse}
          vendor={detail.vendor}
          capabilities={detail.capabilities}
          categoriesUsed={detail.categoriesUsed}
          topAgents={detail.topAgents}
        />
        <VendorScoreCard
          score={detail.score}
          timesUsed={detail.timesUsed}
          ratings={detail.ratings}
          reviewerCount={detail.reviewerCount}
          preferences={detail.preferences}
          vendorId={detail.vendor.id}
          currentUserId={profile.id}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <VendorNotesCard
          vendorId={detail.vendor.id}
          notes={detail.notes}
          currentUserName={profile.full_name ?? 'You'}
        />
        <VendorInvoicesCard invoices={invoices.invoices} total={invoices.total} />
      </div>
    </main>
  );
}
