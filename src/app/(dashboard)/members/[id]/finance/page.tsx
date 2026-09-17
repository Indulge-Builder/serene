// /members/[id]/finance — everything Serene holds about a member's money, on one page.
// Today: the membership money on the spine and the money events in store 4. With M2 the
// Zoho wallet, invoices and payments read live here. Access = whoever can see the member
// (RLS) AND canSeeMemberFinance (the one place to narrow it to a role later).

import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMemberDetail } from '@/lib/services/members-service';
import { logMemberAccess } from '@/lib/services/member-mutations';
import { canAccessRoute } from '@/lib/utils/route-access';
import { canSeeMemberFinance } from '@/lib/elaya/access';
import { Suspense } from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { MemberFinanceView } from '@/components/members/MemberFinanceView';
import { MemberZohoCards } from '@/components/members/MemberZohoCards';
import { MemberZohoSkeleton } from '@/components/members/MemberZohoSkeleton';
import { getMemberFinance } from '@/lib/services/zoho-service';
import { zohoOrgId } from '@/lib/services/zoho-api';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';

type Props = { params: Promise<{ id: string }> };

/** The live Zoho part streams in after the spine (four calls, a one-minute Redis copy). */
async function ZohoAsync({ clientId, zohoCustomerId }: { clientId: string; zohoCustomerId: string }) {
  let finance: Awaited<ReturnType<typeof getMemberFinance>> = null;
  let failure: string | null = null;
  try {
    finance = await getMemberFinance(zohoCustomerId);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
    console.error('[members/finance] Zoho read failed', failure);
  }
  return <MemberZohoCards clientId={clientId} zohoCustomerId={zohoCustomerId} orgId={zohoOrgId()} finance={finance} failure={failure} />;
}

export default async function MemberFinancePage({ params }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, CLIENTS_PATH)) redirect('/dashboard');

  const { id } = await params;
  if (!canSeeMemberFinance(profile)) redirect(`${CLIENTS_PATH}/${id}`);

  // RLS decides: a member outside the caller's queendom reads as missing.
  const detail = await getMemberDetail(id);
  if (!detail) notFound();
  await logMemberAccess(id, profile.id, 'finance_page');

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={`${CLIENTS_PATH}/${id}`} label={`Back to ${detail.member.full_name}`} />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          {detail.member.full_name}<span className="page-title-dot">.</span>
        </h1>
      </div>
      <MemberFinanceView detail={detail} />
      {detail.member.zoho_customer_id && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Suspense fallback={<MemberZohoSkeleton />}>
            <ZohoAsync clientId={id} zohoCustomerId={detail.member.zoho_customer_id} />
          </Suspense>
        </div>
      )}
    </main>
  );
}
