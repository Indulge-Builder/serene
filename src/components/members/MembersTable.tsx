'use client';

// MembersTable — the /members dense table. Display-only (A-06): renders the rows the server
// filtered; the row click opens the dossier with ?from= so Back returns to this view.

import { memo, useCallback, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Users, MessageCircle, Ticket, Landmark, Smartphone } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { CLIENT_TIERS } from '@/lib/constants/member-facets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { HealthPill } from './HealthPill';
import { ASSESSMENT_RISK_LABELS } from '@/lib/constants/member-assessment';
import type { MemberListItem } from '@/lib/types/member';

const HEAD: React.CSSProperties = {
  padding: 'var(--space-4)', textAlign: 'left', borderBottom: '1px solid var(--theme-paper-border)',
  whiteSpace: 'nowrap', color: 'var(--theme-text-tertiary)',
};
const CELL: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--theme-paper-border)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
};

export function MembersTable({ members, hasFilters }: { members: MemberListItem[]; hasFilters: boolean }) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        framed
        title={hasFilters ? 'Nobody matches these filters.' : 'No members yet.'}
        description={hasFilters ? 'Try clearing a filter.' : 'Add the first member with the button above.'}
      />
    );
  }
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="label-micro" style={HEAD}>Member</th>
              <th className="label-micro" style={HEAD}>Queendom</th>
              <th className="label-micro" style={HEAD}>Tier</th>
              <th className="label-micro" style={HEAD}>Status</th>
              <th className="label-micro" style={{ ...HEAD, textAlign: 'center' }}>Health</th>
              <th className="label-micro" style={{ ...HEAD, textAlign: 'center' }}>Serene</th>
              <th className="label-micro" style={{ ...HEAD, textAlign: 'right' }}>Open</th>
              <th className="label-micro" style={HEAD}>Last contact</th>
              <th className="label-micro" style={HEAD}>Renews</th>
              <th className="label-micro" style={HEAD}>Linked</th>
            </tr>
          </thead>
          <tbody>
            {members.map((c) => <MemberRow key={c.id} c={c} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MemberRow = memo(function MemberRow({ c }: { c: MemberListItem }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState(false);
  const fromUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const href = `${CLIENTS_PATH}/${c.id}?from=${encodeURIComponent(fromUrl)}`;
  const go = useCallback(() => router.push(href), [router, href]);
  const onEnter = useCallback(() => { setHovered(true); router.prefetch(href); }, [router, href]);
  const rowCell = hovered ? { background: 'var(--neu-surface-high)' } : undefined;
  const expired = c.membership_status === 'Expired';

  return (
    <tr onClick={go} onMouseEnter={onEnter} onMouseLeave={() => setHovered(false)} style={{ cursor: 'pointer', opacity: expired ? 0.7 : 1 }}>
      <td style={{ ...CELL, ...rowCell, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Avatar name={c.full_name} size="md" />
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{c.full_name}</span>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{c.primary_phone ?? 'no number'}</span>
          </div>
        </div>
      </td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{c.queendom?.name.replace(' Queendom', '') ?? '—'}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{c.tier ? CLIENT_TIERS.labels[c.tier] : '—'}</td>
      <td style={{ ...CELL, ...rowCell }}>
        <span style={{
          display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
          background: expired ? 'var(--color-neutral-light)' : 'var(--color-success-light)', color: expired ? 'var(--theme-text-secondary)' : 'var(--color-success-text)',
        }}>{c.membership_status ?? '—'}</span>
      </td>
      <td style={{ ...CELL, ...rowCell, textAlign: 'center' }}><HealthPill score={c.health_score} /></td>
      <td style={{ ...CELL, ...rowCell, textAlign: 'center' }}>
        {c.assessment ? (
          <span title={`${ASSESSMENT_RISK_LABELS[c.assessment.risk]}: ${c.assessment.verdict}`} style={{ display: 'inline-flex' }}><HealthPill score={c.assessment.score} /></span>
        ) : <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)' }}>{c.activity_score != null ? `pulse ${c.activity_score}` : '—'}</span>}
      </td>
      <td style={{ ...CELL, ...rowCell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: c.open_tickets ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)' }}>{c.open_tickets}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{c.last_contact_at ? formatRelativeTime(c.last_contact_at) : '—'}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{c.membership_end ? formatDate(c.membership_end, 'd MMM yyyy') : '—'}</td>
      <td style={{ ...CELL, ...rowCell }}>
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          <LinkDot on={c.linked.whatsapp} icon={MessageCircle} title="WhatsApp group" />
          <LinkDot on={c.linked.freshdesk} icon={Ticket} title="Freshdesk contact" />
          <LinkDot on={c.linked.zoho} icon={Landmark} title="Zoho customer" />
          <LinkDot on={c.linked.app} icon={Smartphone} title="App account" />
        </span>
      </td>
    </tr>
  );
});

function LinkDot({ on, icon: Icon, title }: { on: boolean; icon: React.ElementType; title: string }) {
  return (
    <span title={`${title}: ${on ? 'linked' : 'not linked'}`} style={{ color: on ? 'var(--neu-accent-deep)' : 'var(--theme-text-tertiary)', opacity: on ? 1 : 0.35, display: 'inline-flex' }}>
      <Icon style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
    </span>
  );
}
