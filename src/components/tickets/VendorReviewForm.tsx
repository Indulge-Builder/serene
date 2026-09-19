'use client';

// VendorReviewForm — how the ticket went and how the vendor did, asked once a ticket with a vendor
// is resolved (founder, 2026-09-19). Four ratings of 1 to 5, any subset, and a few words. The
// review lands on the vendor's record against this ticket's job, which is what moves their score.

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { reviewTicketVendorAction } from '@/lib/actions/tickets';
import { REVIEW_DIMENSIONS, REVIEW_DIMENSION_LABELS, REVIEW_RATING_MAX, type ReviewDimension } from '@/lib/constants/vendors';

const HINT: Record<ReviewDimension, string> = { speed: 'How fast they responded and delivered', quality: 'How good the result was', pricing: 'Fair for what we got', reliability: 'Did what they said, when they said' };

export function VendorReviewForm({ ticketId, vendorName, onDone }: { ticketId: string; vendorName: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [ratings, setRatings] = useState<Partial<Record<ReviewDimension, number>>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => start(async () => {
    setError(null);
    const res = await reviewTicketVendorAction({ ticket_id: ticketId, ...ratings, comment: comment.trim() || null });
    if (res.error) { setError(res.error); return; } // the form keeps everything typed
    toast.success(`Thank you. ${vendorName}'s record is updated.`);
    onDone();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {REVIEW_DIMENSIONS.map((d) => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{REVIEW_DIMENSION_LABELS[d]}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{HINT[d]}</span>
          </div>
          <div role="radiogroup" aria-label={REVIEW_DIMENSION_LABELS[d]} style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {Array.from({ length: REVIEW_RATING_MAX }, (_, i) => i + 1).map((n) => {
              const on = ratings[d] === n;
              return (
                <button key={n} type="button" role="radio" aria-checked={on} disabled={pending}
                  onClick={() => setRatings((r) => ({ ...r, [d]: on ? undefined : n }))}
                  className="serene-pressable"
                  style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', border: '1px solid var(--theme-paper-border)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', background: on ? 'var(--theme-accent)' : 'var(--theme-paper)', color: on ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)' }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <textarea className="serene-input neu-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={pending}
        placeholder="How did the ticket go? Anything the next person should know about this vendor." style={{ resize: 'vertical' }} />
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button size="sm" onClick={save} loading={pending}>Save the review</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>Later</Button>
      </div>
    </div>
  );
}
