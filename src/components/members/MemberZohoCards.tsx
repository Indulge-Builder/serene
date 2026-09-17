// MemberZohoCards — the live Zoho part of the member finance page (server, display-only):
// the customer's balances, their invoices, payments and credit notes, straight from Zoho
// Books by the customer id on the spine (one-minute Redis copy; Refresh asks again).

import { FileText, Landmark, ReceiptIndianRupee } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { InfoRow } from '@/components/ui/InfoRow';
import { RevealId } from '@/components/ui/RevealId';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ZohoInvoicesTable, ZohoPaymentsTable, ZohoCreditNotesTable } from '@/components/books/ZohoTables';
import { RefreshMemberFinanceButton } from './RefreshMemberFinanceButton';
import { formatCount, formatCurrencyCompact } from '@/lib/utils/numbers';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { zohoBooksWebUrl } from '@/lib/constants/zoho';
import type { MemberFinance } from '@/lib/types/zoho';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const TABLE_BODY: React.CSSProperties = { padding: 'var(--space-2) var(--space-2) var(--space-3)' };
const tertiary = 'var(--theme-text-tertiary)';

export function MemberZohoCards({ clientId, zohoCustomerId, orgId, finance, failure }: { clientId: string; zohoCustomerId: string; orgId: string; finance: MemberFinance | null; failure: string | null }) {
  if (!finance) {
    return (
      <div style={SHELL}>
        <CardHeader icon={Landmark} label="Zoho Books" />
        <div style={BODY}>
          <EmptyState variant="inline" title={failure ? 'Zoho did not answer.' : 'Zoho Books is not connected.'} description={failure ? 'Try Refresh in a minute.' : 'The credentials are missing from the environment.'} />
          {failure && <div><RefreshMemberFinanceButton clientId={clientId} zohoCustomerId={zohoCustomerId} /></div>}
        </div>
      </div>
    );
  }
  const c = finance.contact;
  const t = finance.totals;
  const person = c?.contact_persons?.find((p) => p.is_primary_contact) ?? c?.contact_persons?.[0];
  const address = c?.billing_address ? [c.billing_address.address, c.billing_address.city, c.billing_address.state, c.billing_address.zip].filter(Boolean).join(', ') : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
        <StatTile label="Outstanding" value={formatCurrencyCompact(t.outstanding)} sub={t.outstanding > 0 ? { text: 'owed to us', color: 'var(--color-warning-text)' } : { text: 'nothing due', color: tertiary }} />
        <StatTile label="Invoiced" value={formatCurrencyCompact(t.invoiced)} sub={{ text: `${formatCount(t.invoiceCount)} invoices, all time`, color: tertiary }} />
        <StatTile label="Paid" value={formatCurrencyCompact(t.paid)} sub={{ text: `${formatCount(finance.payments.length)} payments`, color: tertiary }} />
        <StatTile label="Unused credits" value={formatCurrencyCompact(t.credits)} sub={{ text: 'advances and credit notes', color: tertiary }} />
      </div>

      <div style={SHELL}>
        <CardHeader
          icon={Landmark}
          label="Zoho customer"
          right={<span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>read {formatRelativeTime(finance.fetchedAt)}<RefreshMemberFinanceButton clientId={clientId} zohoCustomerId={zohoCustomerId} /></span>}
        />
        <div style={BODY}>
          <InfoRow label="Name" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{c?.contact_name ?? '—'}{c?.company_name ? <span style={{ color: tertiary }}>· {c.company_name}</span> : null}<RevealId value={zohoCustomerId} label="Zoho customer id" /><a href={zohoBooksWebUrl(orgId, 'contacts', zohoCustomerId)} target="_blank" rel="noreferrer" style={{ color: 'var(--neu-accent-deep)', fontSize: 'var(--text-xs)' }}>Open in Zoho</a></span>} />
          {c?.status && c.status !== 'active' && <InfoRow label="Status" value={<span style={{ color: 'var(--color-warning-text)' }}>{c.status}</span>} />}
          {(person?.email || c?.email) && <InfoRow label="Email" value={person?.email || c?.email} copyable />}
          {(person?.mobile || person?.phone || c?.mobile || c?.phone) && <InfoRow label="Phone" value={person?.mobile || person?.phone || c?.mobile || c?.phone} copyable />}
          {address && <InfoRow label="Billing address" value={address} />}
          {c?.gst_no && <InfoRow label="GST" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{c.gst_no}</span>} />}
          {c?.payment_terms_label && <InfoRow label="Payment terms" value={c.payment_terms_label} />}
          {c?.cf_queendon && <InfoRow label="Queendom (Zoho)" value={c.cf_queendon} />}
          {c?.created_time && <InfoRow label="Customer since" value={formatDate(c.created_time, 'd MMM yyyy')} />}
          {c?.notes && <InfoRow label="Zoho notes" value={c.notes} />}
        </div>
      </div>

      <div style={SHELL}>
        <CardHeader icon={FileText} label="Invoices" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{finance.invoices.length}</span>} />
        <div style={TABLE_BODY}><ZohoInvoicesTable rows={finance.invoices} orgId={orgId} showCustomer={false} emptyTitle="No invoices in Zoho for this customer." previewRows={20} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 'var(--space-6)' }}>
        <div style={SHELL}>
          <CardHeader icon={ReceiptIndianRupee} label="Payments" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{finance.payments.length}</span>} />
          <div style={TABLE_BODY}><ZohoPaymentsTable rows={finance.payments} orgId={orgId} showCustomer={false} emptyTitle="No payments recorded." previewRows={15} /></div>
        </div>
        <div style={SHELL}>
          <CardHeader icon={FileText} label="Credit notes" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{finance.creditNotes.length}</span>} />
          <div style={TABLE_BODY}><ZohoCreditNotesTable rows={finance.creditNotes} orgId={orgId} /></div>
        </div>
      </div>
    </div>
  );
}
