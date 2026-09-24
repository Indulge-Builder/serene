'use client';

// MemberWhatsAppCard — the member's WhatsApp group from the Sia archive: which group, how
// busy, when it last spoke, a link into Sia; and the link / unlink control. The picker lists
// the groups an admin or founder can see (getSiaGroupsAction is admin/founder); a queendom
// member sees the link read-only until Sia opens per queendom.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { getSiaGroupsAction } from '@/lib/actions/sia';
import { linkMemberGroupAction, unlinkMemberGroupAction } from '@/lib/actions/members';
import { formatCount } from '@/lib/utils/numbers';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { MemberGroupSummary } from '@/lib/types/member';
import type { SiaGroupRow } from '@/lib/services/sia-service';
import { siaGroupHref } from '@/lib/constants/sia-roles';

export function MemberWhatsAppCard({ clientId, group, canLink }: { clientId: string; group: MemberGroupSummary | null; canLink: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [groups, setGroups] = useState<SiaGroupRow[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!picking || groups) return;
    getSiaGroupsAction().then((res) => { if (res.data) setGroups(res.data); else toast.danger(res.error ?? 'Could not load groups.'); });
  }, [picking, groups]);

  const candidates = useMemo(() => {
    if (!groups) return [];
    const needle = q.trim().toLowerCase();
    return groups
      .filter((g) => g.group_kind !== 'internal' && g.group_kind !== 'vendor')
      .filter((g) => !needle || (g.subject ?? '').toLowerCase().includes(needle))
      .slice(0, 12);
  }, [groups, q]);

  function link(jid: string) {
    start(async () => {
      const res = await linkMemberGroupAction({ member_id: clientId, group_jid: jid });
      if (res.error) { toast.danger(res.error); return; }
      toast.success('Group linked.'); setPicking(false); router.refresh();
    });
  }
  function unlink() {
    if (!group) return;
    start(async () => {
      const res = await unlinkMemberGroupAction({ member_id: clientId, group_jid: group.group_jid });
      if (res.error) { toast.danger(res.error); return; }
      toast.success('Group unlinked.'); router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={MessageCircle} label="WhatsApp" right={canLink ? (
        <span style={{ marginLeft: 'auto' }}>
          {group ? <Button variant="ghost" size="xs" onClick={unlink} loading={pending}>Unlink</Button> : <Button variant="ghost" size="xs" onClick={() => setPicking((v) => !v)}>Link a group</Button>}
        </span>) : undefined} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {group ? (
          <>
            <InfoRow label="Group" value={<Link href={siaGroupHref(group.group_jid)} style={{ color: 'var(--neu-accent-deep)' }}>{group.subject ?? group.group_jid}</Link>} />
            <InfoRow label="Messages" value={formatCount(group.message_count)} />
            <InfoRow label="Last message" value={group.last_message_at ? formatRelativeTime(group.last_message_at) : '—'} />
            <InfoRow label="Members" value={group.member_count != null ? String(group.member_count) : '—'} />
          </>
        ) : (
          <EmptyState variant="inline" title="No group linked." description={canLink ? 'Pick the member\'s group so their conversation joins this profile.' : 'A bishop or admin links the group from Sia.'} />
        )}
        {picking && !group && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--theme-paper-border)' }}>
            <input className="serene-input neu-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search group name" autoFocus />
            {!groups ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Loading groups…</span> : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {candidates.map((g) => (
                  <li key={g.group_jid}>
                    <SelectionButton
                      appearance="row"
                      type="button"
                      onClick={() => link(g.group_jid)}
                      disabled={pending}
                      className="serene-pressable"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 'var(--space-2) var(--space-3)',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      {g.subject ?? g.group_jid}
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', marginLeft: 'var(--space-2)' }}>{g.group_kind}{g.message_count ? ` · ${formatCount(g.message_count)} msgs` : ''}</span>
                    </SelectionButton>
                  </li>
                ))}
                {candidates.length === 0 && <li style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>No group matches.</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
