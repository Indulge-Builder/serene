import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getTicketDetail, getTicketHelp, getTicketSettings } from '@/lib/services/tickets-service';
import { logMemberAccess } from '@/lib/services/member-mutations';
import { canAccessRoute } from '@/lib/utils/route-access';
import { BackButton } from '@/components/ui/BackButton';
import { TicketHeaderControls } from '@/components/tickets/TicketHeaderControls';
import { TicketBriefCard } from '@/components/tickets/TicketBriefCard';
import { TicketChecklistCard } from '@/components/tickets/TicketChecklistCard';
import { TicketTimeline } from '@/components/tickets/TicketTimeline';
import { TicketMoneyCard } from '@/components/tickets/TicketMoneyCard';
import { TicketLinkedMessagesCard, TicketHelpPanel, TicketSentinelCard } from '@/components/tickets/TicketSideCards';
import { TicketVendorCard } from '@/components/tickets/TicketVendorCard';
import { getTicketVendor, getTicketVendorReview } from '@/lib/services/ticket-vendor';
import { TicketTasksCard } from '@/components/tickets/TicketTasksCard';
import { TicketTagsCard } from '@/components/tickets/TicketTagsCard';
import { TICKETS_PATH } from '@/lib/constants/tickets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function TicketPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canAccessRoute(profile, TICKETS_PATH)) redirect('/dashboard');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const rawFrom = sp.from ? decodeURIComponent(sp.from) : null;
  const backHref = rawFrom?.startsWith(TICKETS_PATH) ? rawFrom : TICKETS_PATH;

  const detail = await getTicketDetail(id);
  if (!detail) notFound();
  const [help, settings, vendor] = await Promise.all([
    getTicketHelp(detail.member.id, detail.ticket.category, detail.ticket.id), getTicketSettings(),
    detail.ticket.vendor_id ? getTicketVendor(detail.ticket.vendor_id) : Promise.resolve(null),
  ]);
  const review = await getTicketVendorReview(detail.ticket);
  await logMemberAccess(detail.member.id, profile.id, 'ticket_help');
  const canApprove = profile.role !== 'agent';
  const t = detail.ticket;
  const due = t.resolve_due_at && !['resolved', 'closed', 'dropped'].includes(t.status) ? t.resolve_due_at : null;

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', minWidth: 0 }}>
        <BackButton href={backHref} label="Back to Tickets" />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--theme-text-tertiary)', fontSize: '0.6em', marginRight: 'var(--space-3)' }}>{t.ticket_no}</span>
          {t.title}<span className="page-title-dot">.</span>
        </h1>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3) var(--space-5)', alignItems: 'center', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
        <span>For <Link href={`${CLIENTS_PATH}/${detail.member.id}`} style={{ color: 'var(--neu-accent-deep)', fontWeight: 'var(--weight-medium)' }}>{detail.member.full_name}</Link></span>
        <span>Opened {formatDate(t.created_at, 'd MMM, h:mm a')}</span>
        {t.first_response_due_at && !t.first_responded_at && <span style={{ color: new Date(t.first_response_due_at) < new Date() ? 'var(--color-danger-text)' : undefined }}>First response due {formatRelativeTime(t.first_response_due_at)}</span>}
        {due && <span style={{ color: new Date(due) < new Date() ? 'var(--color-danger-text)' : undefined }}>Resolve by {formatDate(due, 'd MMM, h:mm a')}</span>}
        {!t.priority_approved_at && <span style={{ color: 'var(--color-warning-text)' }}>Priority awaiting approval; the SLA has not started.</span>}
      </div>

      <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)', background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)' }}>
        <TicketHeaderControls ticket={t} staff={detail.staff} canApprove={canApprove} labels={settings.statusLabels} vendorName={vendor?.name ?? null} />
      </div>

      <div className="serene-dossier-grid serene-dossier-grid--340 serene-dossier-grid--aside-left" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <TicketSentinelCard ticket={t} />
          <TicketVendorCard ticketId={t.id} vendor={vendor} live={!['resolved', 'closed', 'dropped'].includes(t.status)} status={t.status} review={review} />
          <TicketTagsCard ticketId={t.id} tags={t.tags ?? []} vocabulary={settings.tags} />
          <TicketHelpPanel help={help} clientId={detail.member.id} memberName={detail.member.full_name} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          <TicketBriefCard ticket={t} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)' }}>
            <TicketChecklistCard ticket={t} />
            <TicketMoneyCard ticket={t} />
          </div>
          <TicketLinkedMessagesCard links={detail.links} />
          <TicketTimeline ticketId={t.id} events={detail.events} />
          <TicketTasksCard ticketId={t.id} tasks={detail.tasks} staff={detail.staff} defaultAssignee={t.assignee_id} />
        </div>
      </div>
    </main>
  );
}
