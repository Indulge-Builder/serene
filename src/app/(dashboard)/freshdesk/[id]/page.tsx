import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getFreshdeskViewerScope, pinnedFreshdeskGroup } from '@/lib/services/sia-access';
import { buildInvoiceDraft } from '@/lib/services/finance-service';
import { zohoOrgId } from '@/lib/services/zoho-api';
import { hasFinanceAccess } from '@/lib/utils/route-access';
import { TicketInvoicePanel } from '@/components/finance/TicketInvoicePanel';
import { FINANCE_INVOICE_DUE_STATUS } from '@/lib/constants/finance';
import { zohoBooksWebUrl } from '@/lib/constants/zoho';
import { getFreshdeskTicketDetail } from '@/lib/services/freshdesk-service';
import { freshdeskTicketUrl } from '@/lib/services/freshdesk-api';
import { freshdeskDb } from '@/lib/services/freshdesk-sync';
import { BackButton } from '@/components/ui/BackButton';
import { TicketSummaryCard } from '@/components/freshdesk/TicketSummaryCard';
import { TicketThread } from '@/components/freshdesk/TicketThread';
import { TicketChangesTimeline } from '@/components/freshdesk/TicketChangesTimeline';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { mapRows } from '@/lib/utils/rows';

export const metadata = { title: 'Freshdesk ticket' };

// Making an invoice writes to Zoho Books and then to Freshdesk (actions/finance.ts, two calls).
export const maxDuration = 60;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function FreshdeskTicketPage({ params, searchParams }: Props) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // Same scope as the list (sia-access.ts): a queendom viewer opens only their own groups' tickets.
  const viewer = await getFreshdeskViewerScope(profile);
  if (!viewer) redirect('/dashboard');
  const pin = pinnedFreshdeskGroup(viewer);
  // The invoice panel (0250): finance, admin and founder. A finance teammate's Freshdesk IS the
  // invoice queue, so for them a ticket with nothing to invoice and no invoice reads as not there.
  const makesInvoices = hasFinanceAccess(profile);

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
  // Not theirs reads as not there: a ticket number must not confirm that another queendom's ticket exists.
  if (pin.pinned && (detail.ticket.group_id == null || !pin.groupIds.includes(detail.ticket.group_id))) notFound();
  const invoiceDraft = makesInvoices ? await buildInvoiceDraft(id, profile.id) : null;
  const showInvoice = Boolean(invoiceDraft && (detail.ticket.status === FINANCE_INVOICE_DUE_STATUS || invoiceDraft.existing));
  if (viewer.kind === 'finance' && !showInvoice) notFound();
  let invoiceUrl: string | null = null;
  try {
    const zid = invoiceDraft?.existing?.zoho_invoice_id;
    invoiceUrl = zid ? zohoBooksWebUrl(zohoOrgId(), 'invoices', zid) : null;
  } catch { /* Zoho is not configured here: the panel shows without the link */ }
  const groupNames: Record<number, string> = {};
  mapRows<{ id: number; name: string }, void>(groups.data, (g) => { groupNames[g.id] = g.name; });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', minWidth: 0 }}>
        <BackButton href={backHref} label={viewer.kind === 'finance' ? 'Back to invoices due' : 'Back to Freshdesk'} />
        <h1 className="type-page-title m-0" style={{ minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--theme-text-tertiary)', fontSize: '0.6em', marginRight: 'var(--space-3)' }}>#{detail.ticket.id}</span>
          {detail.ticket.subject || 'Untitled request'}
          <span className="page-title-dot">.</span>
        </h1>
      </div>

      <div className={showInvoice ? 'serene-dossier-grid serene-dossier-grid--wide-aside' : 'serene-dossier-grid'} style={{ alignItems: 'start' }}>
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
        {showInvoice && invoiceDraft ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
            <TicketInvoicePanel initialDraft={invoiceDraft} initialZohoUrl={invoiceUrl} canRelease={profile.role === 'admin' || profile.role === 'founder'} />
            <TicketSummaryCard detail={detail} ticketUrl={freshdeskTicketUrl(detail.ticket.id)} />
          </div>
        ) : (
          <TicketSummaryCard detail={detail} ticketUrl={freshdeskTicketUrl(detail.ticket.id)} />
        )}
      </div>
    </main>
  );
}
