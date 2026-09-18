import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { hasVendorAccess } from '@/lib/utils/route-access';
import { getVendorCities } from '@/lib/services/vendors-service';
import { BackButton } from '@/components/ui/BackButton';
import { FindVendorPanel } from '@/components/vendors/FindVendorPanel';
import { VENDORS_PATH } from '@/lib/constants/vendors';

export default async function FindVendorPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!hasVendorAccess(profile)) redirect('/dashboard');

  // The parser matches against the cities we actually have, not a hardcoded
  // list — so a city only "exists" once a vendor serves it.
  const cities = await getVendorCities();

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <BackButton href={VENDORS_PATH} label="Back to vendors" />
        <h1 className="type-page-title m-0">
          Find a vendor<span className="page-title-dot">.</span>
        </h1>
      </div>

      <FindVendorPanel cities={cities} />
    </main>
  );
}
