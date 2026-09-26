'use client';

// MemberIdentityCard — who the member is, their membership, their queendom and team, and
// the four links to the other systems (WhatsApp, Freshdesk, Zoho, the app). The Edit button
// opens MemberFormModal in edit mode (any queendom member, admin, founder — decided 2026-09-15).

import { useState } from 'react';
import Link from 'next/link';
import { Crown, Landmark, MessageCircle, Pencil, Phone, Smartphone, Ticket, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/numbers';
import { CLIENT_TIERS, type MemberTier } from '@/lib/constants/member-facets';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { memberFinancePath, siaGroupHref } from '@/lib/constants/sia-roles';
import { RevealId } from '@/components/ui/RevealId';
import { MemberFormModal } from './MemberFormModal';
import type { MemberDetail, QueendomSummary } from '@/lib/types/member';

function LinkRow({ icon, label, value, href, hint }: { icon: LucideIcon; label: string; value: string | null; href?: string; hint: string }) {
  return (
    <InfoRow
      icon={icon}
      label={label}
      value={
        value ? (
          href ? <Link href={href} style={{ color: 'var(--neu-accent-deep)' }}>{value}</Link> : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{value}</span>
        ) : (
          <span style={{ color: 'var(--theme-text-tertiary)' }}>{hint}</span>
        )
      }
    />
  );
}

/**
 * A link to another system keyed by an id nobody wants to read: the row shows the action
 * ("See tickets"), and the id sits behind a small # icon (hover to see, click to copy).
 */
function SystemRow({ icon, label, id, idLabel, action, href, hint }: { icon: LucideIcon; label: string; id: string | null; idLabel: string; action: string; href?: string; hint: string }) {
  return (
    <InfoRow
      icon={icon}
      label={label}
      value={
        id ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {href ? <Link href={href} style={{ color: 'var(--neu-accent-deep)' }}>{action}</Link> : <span style={{ color: 'var(--theme-text-secondary)' }}>{action}</span>}
            <RevealId value={id} label={idLabel} />
          </span>
        ) : (
          <span style={{ color: 'var(--theme-text-tertiary)' }}>{hint}</span>
        )
      }
    />
  );
}

/** `canSeeMoney` false (the Joker head): no amount, no finance link; the page has already
 *  taken the figures out of `detail`, this only drops the rows that would read "—". */
export function MemberIdentityCard({ detail, queendoms, canPickQueendom, canSeeMoney = true }: { detail: MemberDetail; queendoms: QueendomSummary[]; canPickQueendom: boolean; canSeeMoney?: boolean }) {
  const [editing, setEditing] = useState(false);
  const { member: c, queendom, team, group } = detail;
  const expired = c.membership_status === 'Expired';

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader
        icon={Users}
        label="Member"
        right={
          <span style={{ marginLeft: 'auto' }}>
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              <Pencil style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} /> Edit
            </Button>
          </span>
        }
      />
      <div style={{ padding: 'var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Avatar name={c.full_name} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>{c.full_name}</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
              <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', background: expired ? 'var(--color-neutral-light)' : 'var(--color-success-light)', color: expired ? 'var(--theme-text-secondary)' : 'var(--color-success-text)' }}>
                {c.membership_status ?? 'Status unknown'}
              </span>
              {c.tier && <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', background: 'var(--theme-accent-surface)', color: 'var(--neu-accent-deep)' }}>{CLIENT_TIERS.labels[c.tier as MemberTier] ?? c.tier}</span>}
              {c.identity_status === 'verified' && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', alignSelf: 'center' }}>identity verified</span>}
            </div>
          </div>
        </div>

        <InfoRow icon={Phone} label="WhatsApp" value={c.primary_phone ?? '—'} copyable copyValue={c.primary_phone ?? undefined} />
        {c.alt_phones.length > 0 && <InfoRow label="Other numbers" value={c.alt_phones.join(', ')} />}
        <InfoRow icon={Crown} label="Queendom" value={queendom?.name ?? <span style={{ color: 'var(--theme-text-tertiary)' }}>Not assigned</span>} divider />
        {(team.queen || team.bishops.length > 0 || team.joker || team.genies.length > 0) && (
          <InfoRow
            label="Team"
            value={
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {team.queen && <span>Queen {team.queen.full_name}. </span>}
                {team.bishops.length > 0 && <span>{team.bishops.length > 1 ? 'Bishops' : 'Bishop'} {team.bishops.map((b) => b.full_name).join(' and ')}. </span>}
                {team.joker && <span>Joker {team.joker.full_name}. </span>}
                {team.genies.length > 0 && <span style={{ color: 'var(--theme-text-secondary)' }}>{team.genies.length} genies.</span>}
              </span>
            }
          />
        )}
        <InfoRow label="Membership" value={`${c.membership_start ? formatDate(c.membership_start, 'd MMM yyyy') : '—'} to ${c.membership_end ? formatDate(c.membership_end, 'd MMM yyyy') : '—'}`} />
        {canSeeMoney && <InfoRow label="Amount" value={c.membership_amount_inr != null ? formatCurrency(Number(c.membership_amount_inr)) : '—'} divider />}

        <LinkRow icon={MessageCircle} label="WhatsApp group" value={group ? (group.subject ?? group.group_jid) : (c.wa_invite_link ? 'Invite link saved, group not matched' : null)} href={group ? siaGroupHref(group.group_jid) : undefined} hint="Not linked" />
        <SystemRow icon={Ticket} label="Freshdesk" id={c.freshdesk_contact_id} idLabel="Freshdesk contact id" action="See tickets" href={`${FRESHDESK_PATH}?member=${c.id}`} hint="No contact id" />
        {canSeeMoney && <SystemRow icon={Landmark} label="Zoho customer" id={c.zoho_customer_id} idLabel="Zoho customer id" action="See finance" href={memberFinancePath(c.id)} hint="No customer id" />}
        <SystemRow icon={Smartphone} label="App member" id={c.app_member_id} idLabel="App member id" action="Linked" hint="No app account" />
      </div>
      {editing && (
        <MemberFormModal open={editing} onClose={() => setEditing(false)} queendoms={queendoms} defaultQueendomId={c.queendom_id} canPickQueendom={canPickQueendom} canSeeMoney={canSeeMoney} member={c} />
      )}
    </div>
  );
}
