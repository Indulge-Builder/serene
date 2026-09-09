'use client';

// VendorInvoicesCard — the vendor's last invoices.
//
// An invoice is a PATH on the job it was filed against (0183/0184), so each row
// carries its job's date, category, city and amount. The file itself lives in a
// PRIVATE bucket — "Open" mints a short-lived signed url through
// signVendorInvoiceAction and opens it; the path is never a public link, and a
// url is never stored.
//
// Client component only because opening a file is an action; the rows
// themselves are display-only.

import { useState, useTransition } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { signVendorInvoiceAction } from '@/lib/actions/vendors';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency, formatCount } from '@/lib/utils/numbers';
import { getRequestCategoryLabel } from '@/lib/constants/vendors';
import { useToast } from '@/hooks/useToast';
import type { VendorInvoice } from '@/lib/types/vendor';

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function VendorInvoicesCard({
  invoices,
  total,
}: {
  invoices: VendorInvoice[];
  total: number;
}) {
  const toast = useToast;
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open(path: string) {
    setPendingPath(path);
    startTransition(async () => {
      const result = await signVendorInvoiceAction({ path });
      setPendingPath(null);
      if (result.error || !result.data) {
        toast.danger(result.error ?? 'Could not open that invoice.');
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <CardHeader
        icon={FileText}
        label="Invoices"
        right={
          total > invoices.length ? (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 'var(--text-xs)',
                color: 'var(--neu-header-ink)',
              }}
            >
              Last {formatCount(invoices.length)} of {formatCount(total)}
            </span>
          ) : undefined
        }
      />

      {invoices.length === 0 ? (
        <div style={{ padding: 'var(--space-8) var(--space-6)' }}>
          <EmptyState variant="inline" title="No invoices on file yet." />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {invoices.map((inv, i) => (
            <div
              key={`${inv.engagementId}-${inv.path}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-6)',
                borderBottom:
                  i < invoices.length - 1 ? '1px solid var(--theme-paper-border)' : undefined,
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-md)',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--theme-paper)',
                  border: '1px solid var(--theme-paper-border)',
                  boxShadow: 'var(--neu-shadow-raised-sm)',
                  flexShrink: 0,
                }}
              >
                <FileText
                  style={{ width: '1rem', height: '1rem', color: 'var(--neu-accent-deep)', strokeWidth: 1.5 }}
                />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--theme-text-primary)',
                  }}
                >
                  {inv.ref}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--theme-text-tertiary)',
                    marginTop: '2px',
                  }}
                >
                  {formatDate(inv.date, 'd MMM yyyy')} · {getRequestCategoryLabel(inv.category)}
                  {inv.city ? ` · ${titleCase(inv.city)}` : ''}
                </span>
              </div>

              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'var(--text-sm)',
                  color: inv.amountInr == null ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {inv.amountInr == null ? '—' : formatCurrency(inv.amountInr, 'INR')}
              </span>

              <button
                type="button"
                onClick={() => open(inv.path)}
                disabled={pendingPath === inv.path}
                className="serene-pressable"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  background: 'transparent',
                  border: 'none',
                  padding: 'var(--space-1) var(--space-2)',
                  cursor: pendingPath === inv.path ? 'wait' : 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--weight-medium)',
                  color: 'var(--neu-accent-deep)',
                  opacity: pendingPath === inv.path ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {pendingPath === inv.path ? 'Opening…' : 'Open'}
                <ExternalLink style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.7 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
