// ZohoTables — the read-only grids over Zoho rows (Table<T>, the secondary-table primitive):
// invoices and payments. Each row links out to Zoho Books; nothing is edited here. Shared
// by /books and the client finance page.

import { ExternalLink } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils/numbers';
import { formatDate } from '@/lib/utils/dates';
import { zohoBooksWebUrl } from '@/lib/constants/zoho';
import { ZohoStatusPill } from './ZohoStatusPill';
import type { ZbInvoice, ZbPayment, ZbCreditNote } from '@/lib/types/zoho';

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

function ZohoLink({ orgId, kind, id, children }: { orgId: string; kind: 'invoices' | 'customerpayments' | 'creditnotes'; id: string; children: React.ReactNode }) {
  return (
    <a href={zohoBooksWebUrl(orgId, kind, id)} target="_blank" rel="noreferrer" style={{ color: 'var(--neu-accent-deep)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}<ExternalLink style={{ width: 10, height: 10, strokeWidth: 1.5 }} />
    </a>
  );
}

export function ZohoInvoicesTable({ rows, orgId, showCustomer = true, emptyTitle = 'No invoices.', previewRows }: { rows: ZbInvoice[]; orgId: string; showCustomer?: boolean; emptyTitle?: string; previewRows?: number }) {
  if (rows.length === 0) return <EmptyState variant="inline" title={emptyTitle} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table<ZbInvoice>
        rows={rows}
        rowKey={(r) => r.invoice_id}
        previewRows={previewRows}
        columns={[
          { id: 'number', header: 'Invoice', cell: (r) => <ZohoLink orgId={orgId} kind="invoices" id={r.invoice_id}><span style={mono}>{r.invoice_number}</span></ZohoLink> },
          ...(showCustomer ? [{ id: 'customer', header: 'Customer', cell: (r: ZbInvoice) => r.customer_name }] : []),
          { id: 'date', header: 'Date', cell: (r) => formatDate(r.date, 'd MMM yy') },
          { id: 'due', header: 'Due', cell: (r) => formatDate(r.due_date, 'd MMM yy') },
          { id: 'status', header: 'Status', cell: (r) => <ZohoStatusPill status={r.status} /> },
          { id: 'total', header: 'Total', align: 'right', cell: (r) => <span style={mono}>{formatCurrency(r.total)}</span> },
          { id: 'balance', header: 'Balance', align: 'right', cell: (r) => <span style={{ ...mono, color: r.balance > 0 ? 'var(--color-warning-text)' : 'var(--theme-text-tertiary)' }}>{formatCurrency(r.balance)}</span> },
        ]}
      />
    </div>
  );
}

export function ZohoPaymentsTable({ rows, orgId, showCustomer = true, emptyTitle = 'No payments.', previewRows }: { rows: ZbPayment[]; orgId: string; showCustomer?: boolean; emptyTitle?: string; previewRows?: number }) {
  if (rows.length === 0) return <EmptyState variant="inline" title={emptyTitle} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table<ZbPayment>
        rows={rows}
        rowKey={(r) => r.payment_id}
        previewRows={previewRows}
        columns={[
          { id: 'number', header: 'Payment', cell: (r) => <ZohoLink orgId={orgId} kind="customerpayments" id={r.payment_id}><span style={mono}>#{r.payment_number}</span></ZohoLink> },
          ...(showCustomer ? [{ id: 'customer', header: 'Customer', cell: (r: ZbPayment) => r.customer_name }] : []),
          { id: 'date', header: 'Date', cell: (r) => formatDate(r.date, 'd MMM yy') },
          { id: 'mode', header: 'Mode', cell: (r) => r.payment_mode || '—' },
          { id: 'for', header: 'For', cell: (r) => <span style={{ ...mono, fontSize: 'var(--text-xs)' }}>{r.invoice_numbers || (r.unused_amount > 0 ? 'advance' : '—')}</span> },
          { id: 'amount', header: 'Amount', align: 'right', cell: (r) => <span style={mono}>{formatCurrency(r.amount)}</span> },
        ]}
      />
    </div>
  );
}

export function ZohoCreditNotesTable({ rows, orgId }: { rows: ZbCreditNote[]; orgId: string }) {
  if (rows.length === 0) return <EmptyState variant="inline" title="No credit notes." />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table<ZbCreditNote>
        rows={rows}
        rowKey={(r) => r.creditnote_id}
        columns={[
          { id: 'number', header: 'Credit note', cell: (r) => <ZohoLink orgId={orgId} kind="creditnotes" id={r.creditnote_id}><span style={mono}>{r.creditnote_number}</span></ZohoLink> },
          { id: 'date', header: 'Date', cell: (r) => formatDate(r.date, 'd MMM yy') },
          { id: 'status', header: 'Status', cell: (r) => <ZohoStatusPill status={r.status} /> },
          { id: 'total', header: 'Total', align: 'right', cell: (r) => <span style={mono}>{formatCurrency(r.total)}</span> },
          { id: 'balance', header: 'Unused', align: 'right', cell: (r) => <span style={mono}>{formatCurrency(r.balance)}</span> },
        ]}
      />
    </div>
  );
}
