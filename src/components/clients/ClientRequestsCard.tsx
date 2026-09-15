// ClientRequestsCard — the client's requests: today the mirrored Freshdesk tickets (open
// first, then the most recent), each opening the Freshdesk dossier. Sia tickets join here
// in T1. Server component, display-only.

import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FreshdeskStatusPill } from '@/components/freshdesk/FreshdeskStatusPill';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import type { ClientTicketSummary } from '@/lib/types/client';

function Row({ t }: { t: ClientTicketSummary }) {
  return (
    <li style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--theme-paper-border)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link href={`${FRESHDESK_PATH}/${t.id}`} style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.subject || `Ticket #${t.id}`}
        </Link>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
          #{t.id} · {[t.category, t.sub_category].filter(Boolean).join(' · ') || 'uncategorised'} · {t.agent_name ?? 'unassigned'} · {formatDate(t.fd_created_at, 'd MMM yyyy')}
          {t.resolved_at ? ` · resolved ${formatRelativeTime(t.resolved_at)}` : ''}
          {t.is_escalated ? ' · escalated' : ''}
        </span>
      </div>
      <FreshdeskStatusPill status={t.status} label={t.status_label} />
    </li>
  );
}

export function ClientRequestsCard({ tickets }: { tickets: { open: ClientTicketSummary[]; recent: ClientTicketSummary[]; total: number } }) {
  const openIds = new Set(tickets.open.map((t) => t.id));
  const recent = tickets.recent.filter((t) => !openIds.has(t.id));
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={Ticket} label="Requests" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{tickets.open.length} open · {tickets.total} all time</span>} />
      <div style={{ padding: 'var(--space-2) var(--space-6) var(--space-4)' }}>
        {tickets.total === 0 ? (
          <EmptyState variant="inline" title="No requests on record." description="Tickets appear here as they are mirrored from Freshdesk, and from Serene once ticketing lands." />
        ) : (
          <>
            {tickets.open.length > 0 && (
              <>
                <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', padding: 'var(--space-2) 0' }}>Open</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{tickets.open.map((t) => <Row key={t.id} t={t} />)}</ul>
              </>
            )}
            {recent.length > 0 && (
              <>
                <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', padding: 'var(--space-3) 0 var(--space-2)' }}>Recent</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{recent.map((t) => <Row key={t.id} t={t} />)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
