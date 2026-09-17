// MemberActivityCard — the timeline (STORE 4): every touchpoint from every source in one
// stream. Fills as the projector runs; until then it says so. Server component.

import { Activity } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/dates';
import type { MemberEventRow } from '@/lib/types/member';

const KIND_LABEL: Record<string, string> = {
  message_in: 'Member wrote', message_out: 'We replied', ticket_created: 'Request opened', ticket_status: 'Request moved', ticket_resolved: 'Request resolved',
  note_added: 'Note', app_view: 'Viewed in the app', app_save: 'Saved in the app', app_wish: 'Added a wish', app_taste: 'Tastes updated', location: 'Location',
  payment: 'Payment', invoice: 'Invoice', renewal: 'Renewal', call: 'Call', fact_added: 'Learned', health_signal: 'Health signal',
};

export function MemberActivityCard({ events }: { events: MemberEventRow[] }) {
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={Activity} label="Activity" />
      <div style={{ padding: 'var(--space-3) var(--space-6) var(--space-4)' }}>
        {events.length === 0 ? (
          <EmptyState variant="inline" title="The timeline is empty." description="Tickets, messages, app signals and payments land here as the projector runs." />
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {events.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', minWidth: 110 }}>{formatDate(e.occurred_at, 'd MMM yy, h:mm a')}</span>
                <span style={{ color: 'var(--theme-text-primary)' }}>
                  <span style={{ fontWeight: 'var(--weight-medium)' }}>{KIND_LABEL[e.kind] ?? e.kind}</span>
                  {e.summary ? <span style={{ color: 'var(--theme-text-secondary)' }}> · {e.summary}</span> : null}
                  {e.tone && e.tone !== 'neutral' ? <span style={{ fontSize: 'var(--text-xs)', color: e.tone === 'praise' ? 'var(--color-success-text)' : 'var(--color-danger-text)', marginLeft: 'var(--space-2)' }}>{e.tone}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
