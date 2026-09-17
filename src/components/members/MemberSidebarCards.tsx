// The dossier's smaller display-only cards (server): the app, money, relationships,
// anticipations and the narrative. Each shows what the twin holds today and says honestly
// what is not wired yet (the app feed and Zoho arrive in M2; the narrative with T4).

import Link from 'next/link';
import { Smartphone, Landmark, Network, CalendarClock, BookOpen } from 'lucide-react';
import { RevealId } from '@/components/ui/RevealId';
import { memberFinancePath } from '@/lib/constants/sia-roles';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoRow } from '@/components/ui/InfoRow';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/numbers';
import type { MemberDetail } from '@/lib/types/member';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

export function MemberAppCard({ detail }: { detail: MemberDetail }) {
  const appEvents = detail.events.filter((e) => e.kind.startsWith('app_') || e.kind === 'location');
  const linked = Boolean(detail.member.app_member_id);
  return (
    <div style={SHELL}>
      <CardHeader icon={Smartphone} label="App" />
      <div style={BODY}>
        {!linked ? <EmptyState variant="inline" title="No app account linked." /> :
          appEvents.length === 0 ? <EmptyState variant="inline" title="Linked, nothing received yet." description="Wishes, saves, tastes, city and screen time arrive with the app feed (M2)." /> :
          appEvents.slice(0, 12).map((e) => <InfoRow key={e.id} label={formatDate(e.occurred_at, 'd MMM')} value={e.summary} />)}
      </div>
    </div>
  );
}

export function MemberMoneyCard({ detail }: { detail: MemberDetail }) {
  const c = detail.member;
  const money = detail.events.filter((e) => e.kind === 'payment' || e.kind === 'invoice' || e.kind === 'renewal');
  return (
    <div style={SHELL}>
      <CardHeader icon={Landmark} label="Money" />
      <div style={BODY}>
        <InfoRow label="Membership" value={c.membership_amount_inr != null ? `${formatCurrency(Number(c.membership_amount_inr))} · ${c.membership_type ?? ''}` : '—'} />
        <InfoRow label="Term" value={`${c.membership_start ? formatDate(c.membership_start, 'd MMM yyyy') : '—'} to ${c.membership_end ? formatDate(c.membership_end, 'd MMM yyyy') : '—'}`} />
        <InfoRow
          label="Zoho"
          value={c.zoho_customer_id ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Link href={memberFinancePath(c.id)} style={{ color: 'var(--neu-accent-deep)' }}>See finance</Link>
              <RevealId value={c.zoho_customer_id} label="Zoho customer id" />
            </span>
          ) : <span style={{ color: 'var(--theme-text-tertiary)' }}>not linked</span>}
        />
        {money.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Wallet, invoices and payments read live from Zoho arrive in M2.</p>
        ) : money.slice(0, 10).map((e) => <InfoRow key={e.id} label={formatDate(e.occurred_at, 'd MMM yy')} value={e.summary} />)}
      </div>
    </div>
  );
}

export function MemberRelationsCard({ detail }: { detail: MemberDetail }) {
  const rel = detail.relations;
  return (
    <div style={SHELL}>
      <CardHeader icon={Network} label="Relationships" />
      <div style={BODY}>
        {rel.length === 0 ? <EmptyState variant="inline" title="No map yet." description="People, vendors, places and brands appear here as facts and requests accumulate." /> :
          rel.slice(0, 20).map((r) => <InfoRow key={r.id} label={`${r.relation} (${r.entity_kind})`} value={`${r.entity_label} · ${Math.round(Number(r.strength) * 100)}%`} />)}
      </div>
    </div>
  );
}

export function MemberAnticipationsCard({ detail }: { detail: MemberDetail }) {
  const items = detail.anticipations;
  return (
    <div style={SHELL}>
      <CardHeader icon={CalendarClock} label="Coming up" />
      <div style={BODY}>
        {items.length === 0 ? <EmptyState variant="inline" title="Nothing scheduled." description="Occasions, renewals and patterns show here when the twin expects them." /> :
          items.map((a) => <InfoRow key={a.id} label={formatDate(a.due_at, 'd MMM')} value={`${a.title}${a.suggested_action ? ` · ${a.suggested_action}` : ''}`} />)}
      </div>
    </div>
  );
}

export function MemberNarrativeCard({ detail }: { detail: MemberDetail }) {
  const data = (detail.snapshot?.data ?? {}) as { narrative?: { summary?: string; communication_style?: string; traits?: string[]; written_at?: string } };
  const n = data.narrative;
  return (
    <div style={SHELL}>
      <CardHeader icon={BookOpen} label="In a few words" />
      <div style={BODY}>
        {!n?.summary ? <EmptyState variant="inline" title="Not written yet." description="The weekly narrative arrives with the profiler." /> : (
          <>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>{n.summary}</p>
            {n.communication_style && <InfoRow label="Talks" value={n.communication_style} />}
            {n.traits?.length ? <InfoRow label="Traits" value={n.traits.join(', ')} /> : null}
            {n.written_at && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>written {formatDate(n.written_at, 'd MMM yyyy')}</span>}
          </>
        )}
      </div>
    </div>
  );
}
