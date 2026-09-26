// MemberFinanceView — the finance page body (server, display-only): the membership money
// as stat tiles and the money movements the twin has recorded. The live Zoho part
// (MemberZohoCards) streams in beneath when the member has a Zoho customer id.

import Link from 'next/link';
import { Landmark, ReceiptIndianRupee } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoRow } from '@/components/ui/InfoRow';
import { StatTile } from '@/components/ui/StatTile';
import { formatDate } from '@/lib/utils/dates';
import { formatCount, formatCurrencyCompact } from '@/lib/utils/numbers';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import { isMoneyEventKind } from '@/lib/constants/member-facets';
import type { MemberDetail } from '@/lib/types/member';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };


function daysLeft(end: string | null): number | null {
  if (!end) return null;
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
}

export function MemberFinanceView({ detail }: { detail: MemberDetail }) {
  const c = detail.member;
  const left = daysLeft(c.membership_end);
  const movements = detail.events.filter((e) => isMoneyEventKind(e.kind));
  const expired = c.membership_status === 'Expired';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
        <StatTile label="Membership" value={c.membership_amount_inr != null ? formatCurrencyCompact(Number(c.membership_amount_inr)) : '—'} sub={c.membership_type ? { text: c.membership_type, color: 'var(--theme-text-tertiary)' } : undefined} />
        <StatTile label="Status" value={c.membership_status ?? '—'} sub={{ text: expired ? 'renewal due' : 'active plan', color: expired ? 'var(--color-warning-text)' : 'var(--theme-text-tertiary)' }} />
        <StatTile label="Started" value={c.membership_start ? formatDate(c.membership_start, 'd MMM yyyy') : '—'} />
        <StatTile label="Ends" value={c.membership_end ? formatDate(c.membership_end, 'd MMM yyyy') : '—'} sub={left != null ? { text: left >= 0 ? `${formatCount(left)} days left` : `${formatCount(-left)} days ago`, color: left != null && left < 30 ? 'var(--color-warning-text)' : 'var(--theme-text-tertiary)' } : undefined} />
        <StatTile label="Movements" value={formatCount(movements.length)} sub={{ text: 'recorded in Serene', color: 'var(--theme-text-tertiary)' }} />
      </div>

      {!c.zoho_customer_id && (
        <div style={SHELL}>
          <CardHeader icon={Landmark} label="Zoho" />
          <div style={BODY}>
            <InfoRow
              label="Customer"
              value={<span style={{ color: 'var(--theme-text-tertiary)' }}>Not linked. Add the Zoho customer id on the <Link href={`${CLIENTS_PATH}/${c.id}`} style={{ color: 'var(--neu-accent-deep)' }}>member page</Link> and the invoices, payments and balances appear here.</span>}
            />
          </div>
        </div>
      )}

      <div style={SHELL}>
        <CardHeader icon={ReceiptIndianRupee} label="Money movements" />
        <div style={BODY}>
          {movements.length === 0 ? (
            <EmptyState variant="inline" title="No movements recorded yet." description="Payments, invoices and renewals appear here as they reach the twin from tickets that carry money. The live Zoho ledger is below." />
          ) : movements.map((e) => (
            <InfoRow key={e.id} label={formatDate(e.occurred_at, 'd MMM yyyy')} value={`${e.kind} · ${e.summary}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
