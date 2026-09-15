'use client';

// TicketsTable — the /tickets dense table (the board at list density). Display-only.

import { memo, useCallback, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime, formatDate } from '@/lib/utils/dates';
import { TICKETS_PATH, TICKET_CATEGORIES } from '@/lib/constants/tickets';
import { TicketStatusPill, PriorityDot } from './TicketStatusPill';
import type { TicketListItem } from '@/lib/types/ticket';

const HEAD: React.CSSProperties = { padding: 'var(--space-4)', textAlign: 'left', borderBottom: '1px solid var(--theme-paper-border)', whiteSpace: 'nowrap', color: 'var(--theme-text-tertiary)' };
const CELL: React.CSSProperties = { padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--theme-paper-border)', fontSize: 'var(--text-sm)', verticalAlign: 'middle' };

function dueCell(t: TicketListItem): { text: string; color: string } {
  const due = t.resolve_due_at;
  if (!due || t.status === 'resolved' || t.status === 'closed' || t.status === 'dropped') return { text: '—', color: 'var(--theme-text-tertiary)' };
  const past = new Date(due).getTime() < Date.now();
  return { text: past ? `overdue ${formatRelativeTime(due)}` : formatDate(due, 'd MMM, h:mm a'), color: past ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)' };
}

export function TicketsTable({ tickets, hasFilters, labels }: { tickets: TicketListItem[]; hasFilters: boolean; labels?: Record<string, string> }) {
  if (tickets.length === 0) {
    return (
      <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', padding: 'var(--space-12) var(--space-6)' }}>
        <EmptyState icon={ClipboardList} title={hasFilters ? 'No tickets match.' : 'Nothing open.'} description={hasFilters ? 'Try clearing a filter.' : 'Create a ticket from a client\'s messages in Sia, or by hand with New ticket.'} />
      </div>
    );
  }
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th className="label-micro" style={HEAD}>#</th>
            <th className="label-micro" style={HEAD}>Request</th>
            <th className="label-micro" style={HEAD}>Status</th>
            <th className="label-micro" style={HEAD}>Priority</th>
            <th className="label-micro" style={HEAD}>Genie</th>
            <th className="label-micro" style={HEAD}>Due</th>
            <th className="label-micro" style={HEAD}>Updated</th>
          </tr></thead>
          <tbody>{tickets.map((t) => <Row key={t.id} t={t} label={labels?.[t.status]} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

const Row = memo(function Row({ t, label }: { t: TicketListItem; label?: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [hovered, setHovered] = useState(false);
  const fromUrl = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;
  const href = `${TICKETS_PATH}/${t.id}?from=${encodeURIComponent(fromUrl)}`;
  const go = useCallback(() => router.push(href), [router, href]);
  const onEnter = useCallback(() => { setHovered(true); router.prefetch(href); }, [router, href]);
  const rc = hovered ? { background: 'var(--neu-surface-high)' } : undefined;
  const due = dueCell(t);
  return (
    <tr onClick={go} onMouseEnter={onEnter} onMouseLeave={() => setHovered(false)} style={{ cursor: 'pointer' }}>
      <td style={{ ...CELL, ...rc, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap' }}>{t.ticket_no}</td>
      <td style={{ ...CELL, ...rc, minWidth: 260 }}>
        <span style={{ display: 'block', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{t.title}</span>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{t.client_name} · {TICKET_CATEGORIES.labels[t.category] ?? t.category}{t.queendom_name ? ` · ${t.queendom_name.replace(' Queendom', '')}` : ''}</span>
      </td>
      <td style={{ ...CELL, ...rc }}><TicketStatusPill status={t.status} label={label} /></td>
      <td style={{ ...CELL, ...rc }}><PriorityDot priority={t.priority} approved={Boolean(t.priority_approved_at)} /></td>
      <td style={{ ...CELL, ...rc, color: t.assignee_name ? 'var(--theme-text-secondary)' : 'var(--color-warning-text)', whiteSpace: 'nowrap' }}>{t.assignee_name ?? 'unassigned'}</td>
      <td style={{ ...CELL, ...rc, color: due.color, whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{due.text}</td>
      <td style={{ ...CELL, ...rc, color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{formatRelativeTime(t.updated_at)}</td>
    </tr>
  );
});
