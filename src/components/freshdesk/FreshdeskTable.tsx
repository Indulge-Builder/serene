'use client';

// FreshdeskTable — the /freshdesk dense table. Display-only (A-06): renders the rows the
// server filtered; zero sorting or filtering here (the LeadsTable rule). Row click opens
// the ticket dossier with ?from= so Back returns to this exact view (the VendorRow pattern).

import { memo, useCallback, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime, formatDate } from '@/lib/utils/dates';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { FreshdeskStatusPill, FreshdeskPriorityDot } from './FreshdeskStatusPill';
import type { FdTicketListItem } from '@/lib/types/freshdesk';

const HEAD: React.CSSProperties = {
  padding: 'var(--space-4)',
  textAlign: 'left',
  borderBottom: '1px solid var(--theme-paper-border)',
  whiteSpace: 'nowrap',
  color: 'var(--theme-text-tertiary)',
};
const CELL: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--theme-paper-border)',
  fontSize: 'var(--text-sm)',
  verticalAlign: 'middle',
};

export function FreshdeskTable({ tickets, hasFilters }: { tickets: FdTicketListItem[]; hasFilters: boolean }) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        framed
        title={hasFilters ? 'Nothing matches these filters.' : 'The mirror is still filling.'}
        description={
          hasFilters
            ? 'Try a wider date range or clear a filter.'
            : 'The first sync pulls the newest tickets first; history follows over the next hours.'
        }
      />
    );
  }

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="label-micro" style={HEAD}>#</th>
              <th className="label-micro" style={HEAD}>Request</th>
              <th className="label-micro" style={HEAD}>Category</th>
              <th className="label-micro" style={HEAD}>Status</th>
              <th className="label-micro" style={HEAD}>Priority</th>
              <th className="label-micro" style={HEAD}>Agent</th>
              <th className="label-micro" style={HEAD}>Queendom</th>
              <th className="label-micro" style={HEAD}>Created</th>
              <th className="label-micro" style={HEAD}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <TicketRow key={t.id} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TicketRow = memo(function TicketRow({ t }: { t: FdTicketListItem }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState(false);
  const fromUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const href = `${FRESHDESK_PATH}/${t.id}?from=${encodeURIComponent(fromUrl)}`;
  const go = useCallback(() => router.push(href), [router, href]);
  const onEnter = useCallback(() => {
    setHovered(true);
    router.prefetch(href);
  }, [router, href]);
  const rowCell = hovered ? { background: 'var(--neu-surface-high)' } : undefined;
  const categoryLabel = t.category ? (t.sub_category ? `${t.category} · ${t.sub_category}` : t.category) : null;

  return (
    <tr onClick={go} onMouseEnter={onEnter} onMouseLeave={() => setHovered(false)} style={{ cursor: 'pointer' }}>
      <td style={{ ...CELL, ...rowCell, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--theme-text-tertiary)' }}>
        {t.id}
      </td>
      <td style={{ ...CELL, ...rowCell, minWidth: 260 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--theme-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 420,
          }}
        >
          {t.subject || '(no subject)'}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', marginTop: 1 }}>
          {t.requester_name ?? '—'}
          {t.is_escalated && (
            <span style={{ color: 'var(--color-danger-text)', marginLeft: 'var(--space-2)' }}>· escalated</span>
          )}
        </span>
      </td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{categoryLabel ?? '—'}</td>
      <td style={{ ...CELL, ...rowCell }}>
        <FreshdeskStatusPill status={t.status} label={t.status_label} />
      </td>
      <td style={{ ...CELL, ...rowCell }}>
        <FreshdeskPriorityDot priority={t.priority} />
      </td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{t.agent_name ?? '—'}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{t.group_name ?? '—'}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>
        {formatDate(t.fd_created_at, 'd MMM, h:mm a')}
      </td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>
        {formatRelativeTime(t.fd_updated_at)}
      </td>
    </tr>
  );
});
