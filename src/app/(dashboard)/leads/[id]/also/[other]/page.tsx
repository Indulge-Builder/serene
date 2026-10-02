import { notFound, redirect } from 'next/navigation';
import { BackButton } from '@/components/ui/BackButton';
import { Alert } from '@/components/ui/Alert';
import { MetaLine } from '@/components/ui/MetaLine';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getSharedLeadView } from '@/lib/services/lead-identity';
import { LeadNotesSection } from '@/components/leads/LeadNotesSection';
import { LeadActivityLog } from '@/components/leads/LeadActivityLog';
import { getDomainLabel } from '@/lib/constants/domains';
import { LEAD_STATUS_BADGE, LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { getLeadSourceLabel } from '@/lib/constants/lead-sources';
import { formatDate } from '@/lib/utils/dates';

export const metadata = { title: 'Lead history' };

type Props = { params: Promise<{ id: string; other: string }> };

// The read-only history of the SAME person's lead in another domain (migration 0251).
// Reached only through a lead the viewer can already open: `id` is that lead, `other`
// is the sibling. getSharedLeadView is the gate (same person, viewer owns the anchor);
// anything else is a 404, never a hint that the lead exists.
export default async function SharedLeadHistoryPage({ params }: Props) {
  const { id, other } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const view = await getSharedLeadView(
    { userId: profile.id, role: profile.role, domain: profile.domain },
    id,
    other,
  );
  if (!view) notFound();

  const { lead, notes, activities, anchor } = view;
  const domainLabel = getDomainLabel(lead.domain);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <BackButton href={`/leads/${anchor.slug ?? anchor.id}`} label="Back to your lead" />

        <div style={{ minWidth: 0 }}>
          <h1 className="type-page-title" style={{ margin: 0 }}>
            {lead.name || 'Lead'}
          </h1>
          <div
            style={{
              display:    'flex',
              flexWrap:   'wrap',
              alignItems: 'center',
              gap:        'var(--space-2)',
              marginTop:  'var(--space-2)',
            }}
          >
            <span className={`status-pill status-pill--${LEAD_STATUS_BADGE[lead.status]}`}>
              {LEAD_STATUS_LABELS[lead.status]}
            </span>
            <MetaLine
              items={[
                domainLabel,
                lead.ownerName ?? 'Unassigned',
                `Since ${formatDate(lead.createdAt, 'dd MMM yyyy')}`,
                ...(lead.source ? [getLeadSourceLabel(lead.source)] : []),
                ...(lead.resolutionReason ? [lead.resolutionReason] : []),
              ]}
            />
          </div>
        </div>
      </div>

      <Alert tone="info">
        This is the {domainLabel} team&apos;s lead for the same person. You can read what has been
        discussed; only {lead.ownerName ?? `the ${domainLabel} team`} can change it.
      </Alert>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <LeadNotesSection notes={notes} readOnly />
      </div>

      <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <LeadActivityLog activities={activities} />
      </div>
    </main>
  );
}
