'use client';

// MembersTable — the /members dense table. Display-only (A-06): renders the rows the server
// filtered; the row click opens the dossier with ?from= so Back returns to this view.

import Link from 'next/link';
import { Tooltip } from '@/components/ui/Tooltip';
const LINK_STYLE = { color: 'inherit', textDecoration: 'none' } as const;
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
      <div className="hidden md:block" style={{ overflowX: 'auto' }}>
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
      {/* Card stack below md (mobile audit 2026-09-26, the LeadMobileCard shape): a nine-column
          table only scrolls sideways on a phone. One card per member with the fields a phone
          needs; the table stays the desktop rendering. */}
      <div className="md:hidden">
        {members.map((c, index) => <MemberMobileCard key={c.id} c={c} index={index} />)}
      </div>
    </div>
  );
}

/** The dossier link with ?from= so Back returns to this filtered view (shared by row and card). */
function useMemberHref(id: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  return `${CLIENTS_PATH}/${id}?from=${encodeURIComponent(fromUrl)}`;
}

const STATUS_PILL = (expired: boolean): React.CSSProperties => ({
  display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
  background: expired ? 'var(--color-neutral-light)' : 'var(--color-success-light)', color: expired ? 'var(--theme-text-secondary)' : 'var(--color-success-text)',
  whiteSpace: 'nowrap', flexShrink: 0,
});

const MemberMobileCard = memo(function MemberMobileCard({ c, index }: { c: MemberListItem; index: number }) {
  const router = useRouter();
  const href = useMemberHref(c.id);
  const expired = c.membership_status === 'Expired';
  const entering = index < 8;
  const queendom = c.queendom?.name.replace(' Queendom', '');
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open member ${c.full_name}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(href); } }}
      className={entering ? 'serene-row-enter' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 44,
        padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--theme-paper-border)',
        cursor: 'pointer', opacity: expired ? 0.7 : 1, animationDelay: entering ? `${index * 30}ms` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Avatar name={c.full_name} size="md" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link href={href} onClick={(e) => e.stopPropagation()} style={{ ...LINK_STYLE, display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</Link>
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[queendom, c.tier ? CLIENT_TIERS.labels[c.tier] : null].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
        <span style={STATUS_PILL(expired)}>{c.membership_status ?? '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
        <HealthPill score={c.health_score} />
        <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: c.open_tickets ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)' }}>
          {c.open_tickets} open {c.open_tickets === 1 ? 'ticket' : 'tickets'}
        </span>
        <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{c.last_contact_at ? formatRelativeTime(c.last_contact_at) : 'no contact yet'}</span>
      </div>
    </div>
  );
});

const MemberRow = memo(function MemberRow({ c }: { c: MemberListItem }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const href = useMemberHref(c.id);
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
            {/* A real link, so a keyboard can open the member; the row click stays for the mouse. */}
            <Link href={href} onClick={(e) => e.stopPropagation()} style={{ ...LINK_STYLE, display: 'block', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{c.full_name}</Link>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{c.primary_phone ?? 'no number'}</span>
          </div>
        </div>
      </td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{c.queendom?.name.replace(' Queendom', '') ?? '—'}</td>
      <td style={{ ...CELL, ...rowCell, color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>{c.tier ? CLIENT_TIERS.labels[c.tier] : '—'}</td>
      <td style={{ ...CELL, ...rowCell }}>
        <span style={STATUS_PILL(expired)}>{c.membership_status ?? '—'}</span>
      </td>
      <td style={{ ...CELL, ...rowCell, textAlign: 'center' }}><HealthPill score={c.health_score} /></td>
      <td style={{ ...CELL, ...rowCell, textAlign: 'center' }}>
        {c.assessment ? (
          <Tooltip label={`${ASSESSMENT_RISK_LABELS[c.assessment.risk]}: ${c.assessment.verdict}`} side="top"><span style={{ display: 'inline-flex' }}><HealthPill score={c.assessment.score} /></span></Tooltip>
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
  const words = `${title}: ${on ? 'linked' : 'not linked'}`;
  return (
    <Tooltip label={words} side="top">
      <span style={{ color: on ? 'var(--neu-accent-deep)' : 'var(--theme-text-tertiary)', opacity: on ? 1 : 0.35, display: 'inline-flex' }}>
        <Icon aria-hidden="true" style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />
        <span className="sr-only">{words}</span>
      </span>
    </Tooltip>
  );
}
