'use client';

// TicketVendorCard — who does the job (ticket-vendor.ts). With no vendor it offers the ranked
// suggestions for THIS ticket (the one vendor ranking, asked with the ticket's own words and the
// member) and a search by name. Picking one puts the vendor on the ticket and opens the job on
// the vendor's record; resolving the ticket closes that job with the right outcome.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { setTicketVendorAction } from '@/lib/actions/tickets';
import { VendorFinder } from '@/components/tickets/VendorFinder';
import { VendorReviewForm } from '@/components/tickets/VendorReviewForm';
import { VENDORS_PATH } from '@/lib/constants/vendors';
import type { TicketVendorOption } from '@/lib/services/ticket-vendor';

const SHELL: React.CSSProperties = { background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' };
const BODY: React.CSSProperties = { padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

export function TicketVendorCard({ ticketId, vendor, live, status, review }: {
  ticketId: string; vendor: TicketVendorOption | null; live: boolean;
  status: string;
  /** Whether this ticket's vendor job has been reviewed (ticket-vendor.ts). */
  review: { reviewed: boolean; average: number | null; engagement_id: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [finding, setFinding] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const askReview = Boolean(vendor) && (status === 'resolved' || status === 'closed') && !review.reviewed && Boolean(review.engagement_id);

  const set = (vendorId: string | null) => start(async () => {
    const res = await setTicketVendorAction({ ticket_id: ticketId, vendor_id: vendorId });
    if (res.error) { toast.danger(res.error); return; }
    setFinding(false);
    router.refresh();
  });

  return (
    <div style={SHELL}>
      <CardHeader icon={Building2} label="Vendor" />
      <div style={BODY}>
        {vendor && !finding && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Link href={`${VENDORS_PATH}/${vendor.id}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--neu-accent-deep)' }}>{vendor.name}</Link>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{[vendor.category, vendor.city, vendor.phone].filter(Boolean).join(' · ') || 'No details on file'}</span>
            </div>
            {live && <div style={{ display: 'flex', gap: 'var(--space-2)' }}><Button size="xs" variant="ghost" disabled={pending} onClick={() => setFinding(true)}>Change</Button><Button size="xs" variant="ghost" disabled={pending} onClick={() => set(null)}>Remove</Button></div>}
            {!live && review.reviewed && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Reviewed{review.average != null ? ` · ${review.average.toFixed(1)} of 5` : ''}. It counts toward their score.</span>}
            {askReview && !reviewing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--neu-radius-tile, var(--radius-md))', background: 'var(--theme-accent-surface)' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>How did {vendor.name} do?</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>A minute now is what makes the next suggestion better.</span>
                <div><Button size="xs" onClick={() => setReviewing(true)}>Review the vendor</Button></div>
              </div>
            )}
            {askReview && reviewing && <VendorReviewForm ticketId={ticketId} vendorName={vendor.name} onDone={() => { setReviewing(false); router.refresh(); }} />}
          </>
        )}
        {!vendor && !finding && (
          live ? <Button size="xs" onClick={() => setFinding(true)}>Find a vendor</Button> : <EmptyState variant="inline" title="No vendor was used." />
        )}
        {finding && (
          <>
            <VendorFinder ticketId={ticketId} disabled={pending} onPick={(v) => set(v.id)} />
            <div><Button size="xs" variant="ghost" disabled={pending} onClick={() => setFinding(false)}>Cancel</Button></div>
          </>
        )}
      </div>
    </div>
  );
}
