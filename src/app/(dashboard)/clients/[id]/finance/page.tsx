// /clients/[id]/finance — everything Serene holds about a client's money, on one page.
// Today: the membership money on the spine and the money events in store 4. With M2 the
// Zoho wallet, invoices and payments read live here. Access = whoever can see the client
// (RLS) AND canSeeClientFinance (the one place to narrow it to a role later).

import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getClientDetail } from '@/lib/services/clients-service';
import { logClientAccess } from '@/lib/services/client-mutations';
import { canAccessRoute } from '@/lib/utils/route-access';
import { canSeeClientFinance } from '@/lib/elaya/access';
import { Suspense } from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { ClientFinanceView } from '@/components/clients/ClientFinanceView';
import { ClientZohoCards } from '@/components/clients/ClientZohoCards';
import { ClientZohoSkeleton } from '@/components/clients/ClientZohoSkeleton';
import { getClientFinance } from '@/lib/services/zoho-service';
import { zohoOrgId } from '@/lib/services/zoho-api';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';

type Props = { params: Promise<{ id: string }> };

/** The live Zoho part streams in after the spine (four calls, a one-minute Redis copy). */
async function ZohoAsync({ clientId, zohoCustomerId }: { clientId: string; zohoCustomerId: string }) {
  let finance: Awaited<ReturnType<typeof getClientFinance>> = null;
  let failure: string | null = null;
  try {
    finance = await getClientFinance(zohoCustomerId);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
    console.error('[clients/finance] Zoho read failed', failure);
  }
  return <ClientZohoCards clientId={clientId} zohoCustomerId={zohoCustomerId} orgId={zohoOrgId()} finance={finance} failure={failure} />;
}

export default async function ClientFinancePage({ params }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, CLIENTS_PATH)) redirect('/dashboard');

  const { id } = await params;
  if (!canSeeClientFinance(profile)) redirect(`${CLIENTS_PATH}/${id}`);

  // RLS decides: a client outside the caller's queendom reads as missing.
  const detail = await getClientDetail(id);
  if (!detail) notFound();
  await logClientAccess(id, profile.id, 'finance_page');

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={`${CLIENTS_PATH}/${id}`} label={`Back to ${detail.client.full_name}`} />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          {detail.client.full_name}<span className="page-title-dot">.</span>
        </h1>
      </div>
      <ClientFinanceView detail={detail} />
      {detail.client.zoho_customer_id && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Suspense fallback={<ClientZohoSkeleton />}>
            <ZohoAsync clientId={id} zohoCustomerId={detail.client.zoho_customer_id} />
          </Suspense>
        </div>
      )}
    </main>
  );
}
