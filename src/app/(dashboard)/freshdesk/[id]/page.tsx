import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getFreshdeskTicketDetail } from '@/lib/services/freshdesk-service';
import { freshdeskTicketUrl } from '@/lib/services/freshdesk-api';
import { freshdeskDb } from '@/lib/services/freshdesk-sync';
import { BackButton } from '@/components/ui/BackButton';
import { TicketSummaryCard } from '@/components/freshdesk/TicketSummaryCard';
import { TicketThread } from '@/components/freshdesk/TicketThread';
import { TicketChangesTimeline } from '@/components/freshdesk/TicketChangesTimeline';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { mapRows } from '@/lib/utils/rows';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function FreshdeskTicketPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'founder') redirect('/dashboard');

  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith(FRESHDESK_PATH) ? rawFrom : FRESHDESK_PATH;

  const [detail, groups] = await Promise.all([
    getFreshdeskTicketDetail(id),
    freshdeskDb().from('groups').select('id, name'),
  ]);
  if (!detail) notFound();
  const groupNames: Record<number, string> = {};
  mapRows<{ id: number; name: string }, void>(groups.data, (g) => { groupNames[g.id] = g.name; });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={backHref} label="Back to Freshdesk" />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--theme-text-tertiary)', fontSize: '0.6em', marginRight: 'var(--space-3)' }}>#{detail.ticket.id}</span>
          {detail.ticket.subject || 'Untitled request'}
          <span className="page-title-dot">.</span>
        </h1>
      </div>

      <div className="serene-dossier-grid" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <TicketThread
            conversations={detail.conversations}
            agentNames={detail.agentNames}
            requesterName={detail.ticket.requester_name ?? detail.contact?.name ?? null}
            requesterId={detail.ticket.requester_id}
            threadSynced={detail.ticket.conversations_synced_at != null}
          />
          <TicketChangesTimeline changes={detail.changes} agentNames={detail.agentNames} groupNames={groupNames} />
        </div>
        <TicketSummaryCard detail={detail} ticketUrl={freshdeskTicketUrl(detail.ticket.id)} />
      </div>
    </main>
  );
}
