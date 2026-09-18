'use client';

// SentinelProposal — the sentinel's suggested status move, inside the Sentinel card (plan 7.6).
// Exactly two actions, Approve and Dismiss (the Elaya proposal rule). Approve is the ordinary
// status move made by this person; the sentinel never moves a ticket itself.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { resolveSentinelProposalAction } from '@/lib/actions/tickets';

export function SentinelProposal({ ticketId, toLabel, reason }: { ticketId: string; toLabel: string; reason: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const answer = (decision: 'approve' | 'dismiss') => start(async () => {
    const res = await resolveSentinelProposalAction({ ticket_id: ticketId, decision });
    if (res.error) { toast.danger(res.error); return; }
    if (decision === 'approve') toast.success(`Moved to ${toLabel}.`);
    router.refresh();
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--neu-radius-tile, var(--radius-md))', background: 'var(--theme-accent-surface)' }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>Move this to {toLabel}?</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{reason}</span>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button size="xs" disabled={pending} onClick={() => answer('approve')}>Approve</Button>
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => answer('dismiss')}>Dismiss</Button>
      </div>
    </div>
  );
}
