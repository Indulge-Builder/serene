import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getVendorDetail, getVendorInvoices, getVendorCategories } from '@/lib/services/vendors-service';
import { BackButton } from '@/components/ui/BackButton';
import { VendorIdentityCard } from '@/components/vendors/VendorIdentityCard';
import { VendorScoreCard } from '@/components/vendors/VendorScoreCard';
import { VendorInvoicesCard } from '@/components/vendors/VendorInvoicesCard';
import { VendorNotesCard } from '@/components/vendors/VendorNotesCard';
import { VENDORS_PATH } from '@/lib/constants/vendors';

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'founder') redirect('/dashboard');

  const { id } = await params;
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
        {/* preferHistory: a vendor is reached from the list AND from Find a
            vendor, so a fixed href would discard the search someone just ran. */}
        <BackButton href={VENDORS_PATH} label="Back" preferHistory />
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
