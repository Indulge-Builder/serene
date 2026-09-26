import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getMemberDetail, getQueendoms } from '@/lib/services/members-service';
import { logMemberAccess } from '@/lib/services/member-mutations';
import { canAccessRoute } from '@/lib/utils/route-access';
import { BackButton } from '@/components/ui/BackButton';
import { MemberIdentityCard } from '@/components/members/MemberIdentityCard';
import { MemberHealthCard } from '@/components/members/MemberHealthCard';
import { MemberFactsCard } from '@/components/members/MemberFactsCard';
import { MemberRequestsCard } from '@/components/members/MemberRequestsCard';
import { MemberWhatsAppCard } from '@/components/members/MemberWhatsAppCard';
import { MemberPeopleCard } from '@/components/members/MemberPeopleCard';
import { MemberObservationCard } from '@/components/members/MemberObservationCard';
import { MemberActivityCard } from '@/components/members/MemberActivityCard';
import { MemberAppCard, MemberMoneyCard, MemberRelationsCard, MemberAnticipationsCard, MemberNarrativeCard } from '@/components/members/MemberSidebarCards';
import { MemberVaultCard } from '@/components/members/MemberVaultCard';
import { MemberAssessmentCard } from '@/components/members/MemberAssessmentCard';
import type { MemberAssessment, MemberPulse } from '@/lib/types/member';
import { listVaultItems } from '@/lib/services/member-vault';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { ESSENTIAL_FACETS, PREFERENCE_FACETS } from '@/lib/constants/member-facets';

export const metadata = { title: 'Member' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function MemberPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, CLIENTS_PATH)) redirect('/dashboard');

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith(CLIENTS_PATH) ? rawFrom : CLIENTS_PATH;

  // RLS decides: a member outside the caller's queendom reads as missing.
  const [detail, queendoms] = await Promise.all([getMemberDetail(id), getQueendoms()]);
  if (!detail) notFound();
  // The vault list is read only once RLS has let the member through: it uses the admin client.
  const vault = await listVaultItems(detail.member.id);
  await logMemberAccess(id, profile.id, 'members_page');

  const privileged = profile.role === 'admin' || profile.role === 'founder';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={backHref} label="Back to Members" />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          {detail.member.full_name}<span className="page-title-dot">.</span>
        </h1>
      </div>

      <div className="serene-dossier-grid" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        <MemberIdentityCard detail={detail} queendoms={queendoms} canPickQueendom={privileged} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <MemberHealthCard clientId={detail.member.id} health={detail.health} />
          <MemberWhatsAppCard clientId={detail.member.id} group={detail.group} canLink={privileged} />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <MemberAssessmentCard memberId={detail.member.id} assessment={((detail.snapshot?.data ?? {}) as { assessment?: MemberAssessment }).assessment ?? null} pulse={((detail.snapshot?.data ?? {}) as { pulse?: MemberPulse }).pulse ?? null} />
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <MemberObservationCard clientId={detail.member.id} notes={detail.notes} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <MemberFactsCard clientId={detail.member.id} facts={detail.facts} facets={ESSENTIAL_FACETS} title="Essentials" icon="compass" />
        <MemberFactsCard clientId={detail.member.id} facts={detail.facts} facets={PREFERENCE_FACETS} title="Preferences" icon="heart" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <MemberRequestsCard tickets={detail.tickets} />
        <MemberActivityCard events={detail.events} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        <MemberPeopleCard clientId={detail.member.id} people={detail.people} />
        <MemberVaultCard memberId={detail.member.id} items={vault} canDelete={privileged} />
        <MemberAppCard detail={detail} />
        <MemberMoneyCard detail={detail} />
        <MemberRelationsCard detail={detail} />
        <MemberAnticipationsCard detail={detail} />
        <MemberNarrativeCard detail={detail} />
      </div>
    </main>
  );
}
