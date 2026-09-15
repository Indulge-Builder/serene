// /books — the organisation's money, read live from Zoho Books (admin/founder). Receivables,
// payables, cash, this month, the financial year, the accounts, overdue invoices, the latest
// invoices and payments. Zoho stays the ledger; this page never writes to it.

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AlertTriangle, FileText, Landmark, ReceiptIndianRupee } from 'lucide-react';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getBooksOverview } from '@/lib/services/zoho-service';
import { zohoOrgId } from '@/lib/services/zoho-api';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { BooksOverviewStrip, BooksBankAccounts } from '@/components/books/BooksOverview';
import { ZohoInvoicesTable, ZohoPaymentsTable } from '@/components/books/ZohoTables';
import { RefreshBooksButton } from '@/components/books/RefreshBooksButton';
import { BooksSkeleton } from './loading';

function canSee(role: string): boolean {
  return role === 'admin' || role === 'founder';
}

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-2) var(--space-2) var(--space-3)' };

async function BooksAsync() {
  let overview: Awaited<ReturnType<typeof getBooksOverview>> = null;
  let failure: string | null = null;
  try {
    overview = await getBooksOverview();
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
    console.error('[books/page] Zoho read failed', failure);
  }
  if (!overview) {
    return (
      <EmptyState
        icon={Landmark}
        title={failure ? 'Zoho did not answer.' : 'Zoho Books is not connected.'}
        description={failure ? 'The last good copy has expired. Try Refresh in a minute; if it keeps failing the token or the daily allowance needs a look.' : 'Add the Zoho credentials to the environment (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORGANIZATION_ID).'}
      />
    );
  }
  const orgId = zohoOrgId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <BooksOverviewStrip o={overview} />

      <div style={SHELL}>
        <CardHeader icon={AlertTriangle} label="Overdue invoices" right={<span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>{overview.overdueInvoices.length}{overview.overdueInvoices.length >= 50 ? '+' : ''} · oldest first</span>} />
        <div style={BODY}><ZohoInvoicesTable rows={overview.overdueInvoices} orgId={orgId} emptyTitle="Nothing overdue." previewRows={15} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 'var(--space-6)' }}>
        <div style={SHELL}>
          <CardHeader icon={FileText} label="Latest invoices" />
          <div style={BODY}><ZohoInvoicesTable rows={overview.recentInvoices} orgId={orgId} previewRows={12} /></div>
        </div>
        <div style={SHELL}>
          <CardHeader icon={ReceiptIndianRupee} label="Latest payments" />
          <div style={BODY}><ZohoPaymentsTable rows={overview.recentPayments} orgId={orgId} previewRows={12} /></div>
        </div>
      </div>

      <BooksBankAccounts accounts={overview.cash.accounts} />
    </div>
  );
}

export default async function BooksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!canSee(profile.role)) redirect('/dashboard');

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Books<span className="page-title-dot">.</span>
        </h1>
        <RefreshBooksButton />
      </div>
      <Suspense fallback={<BooksSkeleton />}>
        <BooksAsync />
      </Suspense>
    </main>
  );
}
