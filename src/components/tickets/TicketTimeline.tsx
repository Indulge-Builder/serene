'use client';

// TicketTimeline — the ticket's diary (every event, every actor) with the note composer.
// Notes are events; the draft is never cleared on error.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { addTicketNoteAction } from '@/lib/actions/tickets';
import { formatDate } from '@/lib/utils/dates';
import { TICKET_STATUSES, type TicketStatus } from '@/lib/constants/tickets';
import type { TicketDetail } from '@/lib/types/ticket';

function describe(e: TicketDetail['events'][number]): string {
  const m = e.meta as Record<string, unknown>;
  const lab = (s: unknown) => TICKET_STATUSES.labels[s as TicketStatus] ?? String(s ?? '');
  switch (e.event_type) {
    case 'created': return 'Ticket created';
    case 'proposed': return 'Ticket proposed';
    case 'approved': return 'Approved';
    case 'status_changed': return `Moved from ${lab(m.from)} to ${lab(m.to)}`;
    case 'reopened': return 'Reopened';
    case 'assigned': return 'Assigned';
    case 'reassigned': return `Reassigned${m.reason ? ` (${String(m.reason).replace(/_/g, ' ')})` : ''}`;
    case 'priority_changed': return `Priority ${m.from} → ${m.to}${m.approved ? ', approved' : ''}`;
    case 'brief_updated': return 'Brief updated';
    case 'checklist_ticked': return `${m.done ? 'Ticked' : 'Unticked'}: ${e.body ?? ''}`;
    case 'member_message_linked': return `${m.count ?? 1} message(s) linked`;
    case 'quote_added': return e.actor_kind === 'sentinel' && e.body ? `Money read from the notes: ${e.body}` : 'Money updated';
    case 'note': return 'Note';
    case 'sla_warning': return 'Deadline near';
    case 'sla_breached': return 'Deadline missed';
    case 'reminder_sent': return 'Reminder';
    // 'bishop' reaches every bishop of the queendom (a queendom can have two, 0242).
    case 'escalated': return `Escalated to the ${m.to && m.to !== 'bishop' ? String(m.to) : 'bishops'}`;
    case 'observation': return m.proposal === 'resolved' ? 'Proposal: resolved' : m.proposed_brief ? 'Proposal: the request changed' : 'Observation';
    case 'closed': return 'Closed';
    default: return e.event_type.replace(/_/g, ' ');
  }
}

export function TicketTimeline({ ticketId, events }: { ticketId: string; events: TicketDetail['events'] }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const body = draft.trim(); if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await addTicketNoteAction({ ticket_id: ticketId, body });
      if (r.error) { setError(r.error); return; }
      setDraft(''); router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={History} label="Timeline" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{events.length}</span>} />
      <ol style={{ margin: 0, padding: 'var(--space-2) var(--space-6)', listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
        {events.map((e) => {
          const who = e.actor_kind === 'human' ? (e.actor_name ?? 'Team') : e.actor_kind === 'sentinel' ? 'Sentinel' : e.actor_kind;
          const isNote = e.event_type === 'note';
          return (
            <li key={e.id} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--theme-paper-border)' }}>
              <Avatar name={who} size="sm" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>{who}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{describe(e)} · {formatDate(e.created_at, 'd MMM, h:mm a')}</span>
                </div>
                {isNote && e.body && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', color: 'var(--theme-text-primary)' }}>{e.body}</p>}
                {!isNote && e.body && e.event_type !== 'checklist_ticked' && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', whiteSpace: 'pre-wrap', color: 'var(--theme-text-secondary)' }}>{e.body}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }} maxLength={4000} rows={3}
          placeholder="What happened, what the vendor said, what to remember." className="serene-input neu-input" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: error ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)' }}>{error ?? 'Internal note; the member never sees it.'}</span>
          <Button size="sm" onClick={submit} loading={pending} disabled={!draft.trim()}>Add note</Button>
        </div>
      </div>
    </div>
  );
}
