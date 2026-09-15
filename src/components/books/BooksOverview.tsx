// BooksOverview — the organisation-wide money picture (server, display-only): receivables,
// payables, cash, this month, the financial year, the aging strip and the bank accounts.
// Every number is Zoho's, read live through zoho-service (five-minute Redis copy).

import { Landmark, Wallet, CreditCard, Clock } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { StatTile } from '@/components/ui/StatTile';
import { formatCount, formatCurrency, formatCurrencyCompact } from '@/lib/utils/numbers';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import type { BooksOverview as Overview } from '@/lib/types/zoho';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-4)' };
const tertiary = 'var(--theme-text-tertiary)';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div className="label-micro" style={{ color: tertiary }}>{title}</div>
      {children}
    </div>
  );
}

export function BooksOverviewStrip({ o }: { o: Overview }) {
  const r = o.receivables;
  const ratio = r.totalDue > 0 ? Math.round((r.overdue / r.totalDue) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <Section title="Money owed to us">
        <div style={GRID}>
          <StatTile label="Receivable" value={formatCurrencyCompact(r.totalDue)} sub={{ text: 'all unpaid invoices', color: tertiary }} />
          <StatTile label="Overdue" value={formatCurrencyCompact(r.overdue)} sub={{ text: `${ratio}% of receivable`, color: r.overdue > 0 ? 'var(--color-danger-text)' : tertiary }} />
          <StatTile label="Due today" value={formatCurrencyCompact(r.dueToday)} />
          <StatTile label="Due in 30 days" value={formatCurrencyCompact(r.dueWithin30)} />
          <StatTile label="Days to get paid" value={r.averageDaysToPay != null ? formatCount(r.averageDaysToPay) : '—'} sub={{ text: 'average, full payment', color: tertiary }} />
        </div>
        {r.aging.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
            <span style={{ color: tertiary }}>Aging</span>
            {r.aging.map((a) => (
              <span key={a.interval}>{a.interval_formatted}: <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrencyCompact(a.amount)}</span></span>
            ))}
          </div>
        )}
      </Section>

      <Section title="This month and the year">
        <div style={GRID}>
          <StatTile label="Invoiced this month" value={formatCurrencyCompact(o.thisMonth.invoiced)} sub={{ text: `since ${formatDate(o.thisMonth.from, 'd MMM')}`, color: tertiary }} />
          <StatTile label="Received this month" value={formatCurrencyCompact(o.thisMonth.received)} sub={{ text: 'payments recorded', color: tertiary }} />
          <StatTile label="Spent this month" value={formatCurrencyCompact(o.thisMonth.expenses)} sub={{ text: 'operating expenses', color: tertiary }} />
          <StatTile label="Income, FY to date" value={formatCurrencyCompact(o.fyToDate.income)} sub={{ text: `since ${formatDate(o.fyToDate.from, 'd MMM yyyy')}`, color: tertiary }} />
          <StatTile label="Net profit, FY to date" value={formatCurrencyCompact(o.fyToDate.netProfit)} sub={{ text: `${formatCurrencyCompact(o.fyToDate.expenses)} spent`, color: o.fyToDate.netProfit >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)' }} />
        </div>
      </Section>

      <Section title="Money we owe, and cash">
        <div style={GRID}>
          <StatTile label="Bills open" value={formatCurrencyCompact(o.payables.open)} sub={{ text: `${formatCount(o.payables.openCount)}${o.payables.more ? '+' : ''} bills`, color: tertiary }} />
          <StatTile label="Bills overdue" value={formatCurrencyCompact(o.payables.overdue)} sub={o.payables.overdue > 0 ? { text: 'past due date', color: 'var(--color-danger-text)' } : undefined} />
          <StatTile label="In the banks" value={formatCurrencyCompact(o.cash.banks)} sub={{ text: 'books balance', color: tertiary }} />
          <StatTile label="On cards" value={formatCurrencyCompact(o.cash.cards)} sub={{ text: 'credit card balances', color: tertiary }} />
          <StatTile label="In clearing" value={formatCurrencyCompact(o.cash.clearing)} sub={{ text: 'gateways, not yet settled', color: tertiary }} />
        </div>
      </Section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-5)', fontSize: 'var(--text-xs)', color: tertiary, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><Clock style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} />Read from Zoho {formatRelativeTime(o.fetchedAt)} · {o.org.name} · {o.org.currency}</span>
        {o.dailyRemaining != null && <span>{formatCount(o.dailyRemaining)} API calls left today</span>}
      </div>
    </div>
  );
}

export function BooksBankAccounts({ accounts }: { accounts: Overview['cash']['accounts'] }) {
  const icon = (t: string) => (t === 'credit_card' ? CreditCard : t === 'cash' ? Wallet : Landmark);
  const sorted = [...accounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return (
    <div style={SHELL}>
      <CardHeader icon={Landmark} label="Accounts" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{accounts.length}</span>} />
      <div style={BODY}>
        {sorted.map((a) => {
          // InfoRow is a client component: the icon renders here, inside the value, rather
          // than crossing the server boundary as a component reference.
          const Icon = icon(a.account_type);
          return (
            <InfoRow
              key={a.account_id}
              label={a.account_type.replace(/_/g, ' ')}
              value={
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <Icon style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, color: 'var(--theme-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.account_name}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? 'var(--color-danger-text)' : 'var(--theme-text-primary)', flexShrink: 0 }}>{formatCurrency(a.balance)}</span>
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
