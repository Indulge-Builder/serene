// TicketSummaryCard — the facts of a mirrored ticket: who, what, where it stands, the SLA
// stamps and every filled custom field. Server component, display-only.

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { InfoRow } from '@/components/ui/InfoRow';
import { formatDate } from '@/lib/utils/dates';
import { fdPriorityLabel, fdSourceLabel } from '@/lib/constants/freshdesk';
import { FreshdeskStatusPill } from './FreshdeskStatusPill';
import { FreshdeskAttachments } from './FreshdeskAttachments';
import type { FdTicketDetail } from '@/lib/types/freshdesk';

function stamp(v: string | null | undefined): string {
  return v ? formatDate(v, 'd MMM yyyy, h:mm a') : '—';
}

/** Custom fields worth showing: non-empty, not false, not the nested category (shown above). */
function filledCustomFields(cf: Record<string, unknown>): { key: string; value: string }[] {
  const skip = new Set(['cf_category_of_request', 'cf_sub_category', 'cf_classification']);
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(cf)) {
    if (skip.has(k) || v == null || v === false || v === '') continue;
    const label = k.replace(/^cf_/, '').replace(/\d+$/, '').replace(/_/g, ' ');
    out.push({ key: label, value: typeof v === 'boolean' ? 'Yes' : String(v) });
  }
  return out;
}

export function TicketSummaryCard({ detail, ticketUrl }: { detail: FdTicketDetail; ticketUrl: string }) {
  const { ticket: t, agent, group, contact, member } = detail;
  const custom = filledCustomFields(t.custom_fields ?? {});
  const category = [t.category, t.sub_category, t.classification].filter(Boolean).join(' · ') || '—';

  return (
    <SectionCard
      title="Ticket"
      headerRight={
        <a
          href={ticketUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}
        >
          Open in Freshdesk
          <ExternalLink style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
        </a>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <InfoRow label="Status" value={<FreshdeskStatusPill status={t.status} label={t.status_label} />} divider />
        <InfoRow label="Priority" value={fdPriorityLabel(t.priority)} />
        <InfoRow label="Type" value={t.ticket_type ?? '—'} />
        <InfoRow label="Category" value={category} divider />
        <InfoRow
          label="Requester"
          value={
            member ? (
              <span>
                {t.requester_name ?? contact?.name ?? '—'}
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>
                  member record: {member.full_name}
                </span>
              </span>
            ) : (
              <span>
                {t.requester_name ?? contact?.name ?? '—'}
                <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>
                  not linked to a member
                </span>
              </span>
            )
          }
        />
        <InfoRow label="Phone" value={t.requester_phone_e164 ?? contact?.mobile ?? contact?.phone ?? '—'} copyable copyValue={t.requester_phone_e164 ?? undefined} />
        <InfoRow label="Queendom" value={group?.name ?? '—'} />
        <InfoRow label="Agent" value={agent?.name ?? '—'} />
        <InfoRow label="Source" value={fdSourceLabel(t.source)} divider />
        <InfoRow label="Created" value={stamp(t.fd_created_at)} />
        <InfoRow label="First response" value={stamp(t.first_responded_at)} />
        <InfoRow label="Response due" value={stamp(t.fr_due_by)} />
        <InfoRow label="Resolve due" value={stamp(t.due_by)} />
        <InfoRow label="Resolved" value={stamp(t.resolved_at)} />
        <InfoRow label="Closed" value={stamp(t.closed_at)} />
        <InfoRow label="Last change" value={stamp(t.fd_updated_at)} divider={custom.length > 0 || t.tags.length > 0} />
        {t.tags.length > 0 && <InfoRow label="Tags" value={t.tags.join(', ')} />}
        {custom.map((c) => (
          <InfoRow key={c.key} label={c.key} value={c.value} />
        ))}
        {(t.description_text || (t.attachments?.length ?? 0) > 0) && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}>
              Description
            </div>
            {t.description_text && (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', lineHeight: 1.6 }}>
                {t.description_text}
              </p>
            )}
            <FreshdeskAttachments attachments={t.attachments ?? []} />
          </div>
        )}
        {member && (
          <Link href={`/sia`} style={{ fontSize: 'var(--text-xs)', color: 'var(--neu-accent-deep)' }}>
            Open the member&apos;s WhatsApp group in Sia
          </Link>
        )}
      </div>
    </SectionCard>
  );
}
