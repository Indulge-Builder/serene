import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getClientDetail, getQueendoms } from '@/lib/services/clients-service';
import { logClientAccess } from '@/lib/services/client-mutations';
import { canAccessRoute } from '@/lib/utils/route-access';
import { BackButton } from '@/components/ui/BackButton';
import { ClientIdentityCard } from '@/components/clients/ClientIdentityCard';
import { ClientHealthCard } from '@/components/clients/ClientHealthCard';
import { ClientFactsCard } from '@/components/clients/ClientFactsCard';
import { ClientRequestsCard } from '@/components/clients/ClientRequestsCard';
import { ClientWhatsAppCard } from '@/components/clients/ClientWhatsAppCard';
import { ClientPeopleCard } from '@/components/clients/ClientPeopleCard';
import { ClientObservationCard } from '@/components/clients/ClientObservationCard';
import { ClientActivityCard } from '@/components/clients/ClientActivityCard';
import { ClientAppCard, ClientMoneyCard, ClientRelationsCard, ClientAnticipationsCard, ClientNarrativeCard } from '@/components/clients/ClientSidebarCards';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { ESSENTIAL_FACETS, PREFERENCE_FACETS } from '@/lib/constants/client-facets';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function ClientPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, CLIENTS_PATH)) redirect('/dashboard');

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith(CLIENTS_PATH) ? rawFrom : CLIENTS_PATH;

  // RLS decides: a client outside the caller's queendom reads as missing.
  const [detail, queendoms] = await Promise.all([getClientDetail(id), getQueendoms()]);
  if (!detail) notFound();
  await logClientAccess(id, profile.id, 'clients_page');

  const privileged = profile.role === 'admin' || profile.role === 'founder';

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={backHref} label="Back to Clients" />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          {detail.client.full_name}<span className="page-title-dot">.</span>
        </h1>
      </div>

      <div className="serene-dossier-grid" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        <ClientIdentityCard detail={detail} queendoms={queendoms} canPickQueendom={privileged} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <ClientHealthCard clientId={detail.client.id} health={detail.health} />
          <ClientWhatsAppCard clientId={detail.client.id} group={detail.group} canLink={privileged} />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <ClientObservationCard clientId={detail.client.id} notes={detail.notes} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <ClientFactsCard clientId={detail.client.id} facts={detail.facts} facets={ESSENTIAL_FACETS} title="Essentials" icon="compass" />
        <ClientFactsCard clientId={detail.client.id} facts={detail.facts} facets={PREFERENCE_FACETS} title="Preferences" icon="heart" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <ClientRequestsCard tickets={detail.tickets} />
        <ClientActivityCard events={detail.events} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        <ClientPeopleCard clientId={detail.client.id} people={detail.people} />
        <ClientAppCard detail={detail} />
        <ClientMoneyCard detail={detail} />
        <ClientRelationsCard detail={detail} />
        <ClientAnticipationsCard detail={detail} />
        <ClientNarrativeCard detail={detail} />
      </div>
    </main>
  );
}
