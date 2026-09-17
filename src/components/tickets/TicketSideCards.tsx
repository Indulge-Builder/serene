// The ticket page's display-only cards (server): the linked WhatsApp messages, the tasks,
// and the help window (what the twin and the mirror know that matters to this ticket).

import Link from 'next/link';
import { MessageCircle, Compass, MapPin, Ban, HeartPulse, Ticket as TicketIcon, CalendarClock, Eye } from 'lucide-react';
import { SENTINEL_TOKEN_BUDGET } from '@/lib/constants/tickets';
import type { SentinelState } from '@/lib/types/ticket';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { HealthPill } from '@/components/members/HealthPill';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { TICKETS_PATH, TICKET_STATUSES } from '@/lib/constants/tickets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { FACT_KEY_LABELS } from '@/lib/constants/member-facets';
import type { TicketDetail, TicketHelp } from '@/lib/types/ticket';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

export function TicketLinkedMessagesCard({ links }: { links: TicketDetail['links'] }) {
  return (
    <div style={SHELL}>
      <CardHeader icon={MessageCircle} label="The member's words" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{links.length}</span>} />
      <div style={BODY}>
        {links.length === 0 ? <EmptyState variant="inline" title="No messages linked." description="Select messages in Sia and create or link them to this ticket." /> :
          links.map((l) => (
            <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--neu-radius-tile, var(--radius-md))', background: l.from_me ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)', alignSelf: l.from_me ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>{l.from_me ? 'Indulge' : (l.sender_name ?? 'Member')} · {l.wa_timestamp ? formatDate(l.wa_timestamp, 'd MMM, h:mm a') : ''} · {l.link_kind}</span>
              <span style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{l.text ?? '(media or empty)'}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function TicketHelpPanel({ help, clientId, memberName }: { help: TicketHelp | null; clientId: string; memberName: string }) {
  const label = (facet: string, key: string) => FACT_KEY_LABELS[`${facet}.${key}`] ?? key.replace(/_/g, ' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={SHELL}>
        <CardHeader icon={Compass} label="Member" right={help?.health != null ? <span style={{ marginLeft: 'auto' }}><HealthPill score={help.health} /></span> : undefined} />
        <div style={BODY}>
          <Link href={`${CLIENTS_PATH}/${clientId}`} style={{ fontWeight: 'var(--weight-medium)', color: 'var(--neu-accent-deep)' }}>{memberName}</Link>
          {!help ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>The profile could not be read.</span> : (
            <>
              {help.dislikes.length > 0 && (
                <div>
                  <div className="label-micro" style={{ color: 'var(--color-danger-text)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 'var(--space-1)' }}><Ban style={{ width: 12, height: 12 }} /> Avoids</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 'var(--text-sm)' }}>{help.dislikes.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
              {help.addresses.length > 0 && (
                <div>
                  <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 'var(--space-1)' }}><MapPin style={{ width: 12, height: 12 }} /> Addresses</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 'var(--text-sm)' }}>{help.addresses.map((a, i) => <li key={i}><span style={{ color: 'var(--theme-text-tertiary)' }}>{a.key.replace(/_/g, ' ')}: </span>{a.value}</li>)}</ul>
                </div>
              )}
              {help.facts.length > 0 && (
                <div>
                  <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-1)' }}>What we know</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {help.facts.slice(0, 18).map((f, i) => <li key={i} style={{ color: f.polarity === 'dislikes' ? 'var(--color-danger-text)' : undefined }}><span style={{ color: 'var(--theme-text-tertiary)' }}>{label(f.facet, f.key)}: </span>{f.value}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {help && (help.similarTickets.length > 0 || help.openTickets.length > 0) && (
        <div style={SHELL}>
          <CardHeader icon={TicketIcon} label="Requests like this" />
          <div style={BODY}>
            {help.openTickets.map((t) => <div key={t.id} style={{ fontSize: 'var(--text-sm)' }}><Link href={`${TICKETS_PATH}/${t.id}`} style={{ color: 'var(--neu-accent-deep)' }}>{t.ticket_no}</Link> {t.title}<span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}> · {TICKET_STATUSES.labels[t.status]} (open now)</span></div>)}
            {help.similarTickets.map((t) => <div key={t.id} style={{ fontSize: 'var(--text-sm)' }}><Link href={`${FRESHDESK_PATH}/${t.id}`} style={{ color: 'var(--neu-accent-deep)' }}>#{t.id}</Link> {t.subject}<span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}> · {t.agent_name ?? '—'} · {formatDate(t.fd_created_at, 'MMM yy')}{t.resolved_at ? ' · resolved' : ''}</span></div>)}
          </div>
        </div>
      )}
      {help && help.anticipations.length > 0 && (
        <div style={SHELL}>
          <CardHeader icon={CalendarClock} label="Coming up" />
          <div style={BODY}>{help.anticipations.map((a, i) => <div key={i} style={{ fontSize: 'var(--text-sm)' }}>{formatDate(a.due_at, 'd MMM')} · {a.title}</div>)}</div>
        </div>
      )}
      {help && help.health == null && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><HeartPulse style={{ width: 12, height: 12 }} /> No health signals yet.</span>
      )}
    </div>
  );
}

/** The sentinel's own card: its summary of the ticket, when it last looked, when it looks next, what it has fired. */
export function TicketSentinelCard({ ticket }: { ticket: TicketDetail['ticket'] }) {
  const st = (ticket.sentinel_state ?? {}) as Partial<SentinelState>;
  const fired = Object.entries(st.fired ?? {}).sort(([, a], [, b]) => b.localeCompare(a));
  const live = !['closed', 'dropped'].includes(ticket.status);
  const spent = Number(st.tokens_in ?? 0) + Number(st.tokens_out ?? 0);
  const tone = st.last_tone && st.last_tone !== 'neutral' ? st.last_tone : null;
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={Eye} label="Sentinel" right={live && ticket.next_wake_at ? <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>next look {formatRelativeTime(ticket.next_wake_at)}</span> : undefined} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
        {ticket.summary ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>{ticket.summary}</p>
        ) : (
          <EmptyState variant="inline" title={live ? 'Watching. Nothing to say yet.' : 'Retired with the ticket.'} description={live ? 'A summary appears after the first note or member message.' : undefined} />
        )}
        {tone && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: tone === 'praise' ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>The member last sounded {tone}.</p>}
        {fired.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
            {fired.slice(0, 6).map(([k, at]) => (
              <li key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span>{k.replace(/_/g, ' ').replace(/:.*$/, '')}</span>
                <span style={{ color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>{formatRelativeTime(at)}</span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ margin: 0, fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
          {Number(st.wakes ?? 0)} looks · {Number(st.reads ?? 0)} readings · {spent > 0 ? `${Math.round((spent / SENTINEL_TOKEN_BUDGET) * 100)}% of its budget` : 'no model spend'}{st.last_wake_at ? ` · last ${formatRelativeTime(st.last_wake_at)}` : ''}
        </p>
      </div>
    </div>
  );
}
