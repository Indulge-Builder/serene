'use client';

// VendorVerifyBanner — the review step on an extractor-written vendor's page (2026-09-21).
//
// The live extractor (0214) wrote this row from a Freshdesk note and marked it
// `unverified`. A person now gives one of three answers:
//   confirm  — "Looks right", here, open to anyone with vendor access; the floor knows
//              its suppliers and confirming is the additive answer;
//   merge    — it is another row under a different spelling; the likely matches are
//              listed here (the facts the extractor and the phone book already hold),
//              and Merge in on the page does the fold (admin/founder);
//   remove   — it was never a supplier; Remove on the page (admin/founder).
// The banner shows the evidence the machine left, because a person cannot judge a
// name without the sentence it was read from.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { verifyVendorAction } from '@/lib/actions/vendors';
import { formatDate } from '@/lib/utils/dates';
import { VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorExtractionEvidence, VendorRow } from '@/lib/types/vendor';

type Props = {
  vendorId: string;
  vendorName: string;
  evidence: VendorExtractionEvidence;
  /** Live rows that are probably the same supplier (getLikelyDuplicates). */
  likelyDuplicates: Pick<VendorRow, 'id' | 'name' | 'category' | 'home_city'>[];
  /** Whether this person can merge or remove (admin/founder); shapes the hint only. */
  canMergeOrRemove: boolean;
};

export function VendorVerifyBanner({ vendorId, vendorName, evidence, likelyDuplicates, canMergeOrRemove }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;

  function confirm() {
    startTransition(async () => {
      const res = await verifyVendorAction({ id: vendorId });
      if (res.error) {
        toast.danger(res.error);
        return;
      }
      setDone(true);
      toast.success(`${vendorName} confirmed`, { message: 'It leaves the Needs a look queue.' });
      router.refresh();
    });
  }

  const where = evidence.ticketId
    ? `ticket #${evidence.ticketId}${evidence.readAt ? ` on ${formatDate(evidence.readAt)}` : ''}`
    : 'a Freshdesk note';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        marginBottom: 'var(--space-6)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--theme-accent-surface)',
        color: 'var(--theme-text-primary)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <Sparkles style={{ width: '1rem', height: '1rem', strokeWidth: 1.5, color: 'var(--neu-accent-deep)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <p style={{ margin: 0 }}>
          <strong style={{ fontWeight: 'var(--weight-semibold)' }}>Written by the extractor</strong> from {where}, and not yet
          checked by a person.
          {evidence.quote && (
            <>
              {' '}It read:{' '}
              <em style={{ color: 'var(--theme-text-secondary)' }}>&ldquo;{evidence.quote}&rdquo;</em>
            </>
          )}
        </p>
        {likelyDuplicates.length > 0 && (
          <p style={{ margin: 0, color: 'var(--theme-text-secondary)' }}>
            Might be the same supplier as{' '}
            {likelyDuplicates.map((d, i) => (
              <span key={d.id}>
                {i > 0 && (i === likelyDuplicates.length - 1 ? ' or ' : ', ')}
                <Link
                  href={`${VENDORS_PATH}/${d.id}`}
                  style={{ color: 'var(--neu-accent-deep)', fontWeight: 'var(--weight-medium)' }}
                >
                  {d.name}
                </Link>
              </span>
            ))}
            .{' '}
            {canMergeOrRemove
              ? 'If so, open the row you are keeping and use Merge in there.'
              : 'If so, tell an admin, who can merge the two.'}
          </p>
        )}
        <p style={{ margin: 0, color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)' }}>
          Not a supplier at all?{' '}
          {canMergeOrRemove ? 'Use Remove at the top of this page.' : 'Tell an admin, who can remove it.'}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={confirm} disabled={pending} loading={pending}>
        <Check style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        Looks right
      </Button>
    </div>
  );
}
