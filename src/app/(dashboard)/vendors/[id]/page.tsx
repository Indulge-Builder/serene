import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasElevatedPageAccess } from '@/lib/utils/route-access';
import { getVendorDetail, getVendorInvoices, getVendorCategories } from '@/lib/services/vendors-service';
import { BackButton } from '@/components/ui/BackButton';
import { VendorIdentityCard } from '@/components/vendors/VendorIdentityCard';
import { VendorScoreCard } from '@/components/vendors/VendorScoreCard';
import { VendorInvoicesCard } from '@/components/vendors/VendorInvoicesCard';
import { VendorNotesCard } from '@/components/vendors/VendorNotesCard';
import { VENDORS_PATH } from '@/lib/constants/vendors';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function VendorPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!hasElevatedPageAccess(profile)) redirect('/dashboard');

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
  if (!detail) notFound();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <BackButton href={backHref} label="Back" />
        <h1 className="type-page-title m-0">
          {detail.vendor.name}
          <span className="page-title-dot">.</span>
        </h1>
      </div>

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
