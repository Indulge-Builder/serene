'use client';

// ReviveLeadButton — THE single revive action component, two mount points:
//   1. the review-context rows in RevivalReviewBanner (above the reused LeadsTable)
//   2. the lead dossier (RevivalDossierAction)
// One implementation, never two. It calls reviveLeadAction (which wraps the shared
// reviveLeadCore — the E2 task path) and, when a candidate is in review, optionally
// dismisses it. Revival NEVER changes the lead's status — this only creates a
// "Revived" follow-up task + resolves the candidate.

import { useTransition, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { reviveLeadAction, dismissRevivalCandidateAction } from '@/lib/actions/revival';
import { useToast } from '@/hooks/useToast';

type ReviveLeadButtonProps = {
  leadId: string;
  /** Present when reviving from the review tab — resolves the candidate to actioned. */
  candidateId?: string;
  /** Show a "Not now" dismiss alongside Revive (review-context only). */
  showDismiss?: boolean;
  size?: 'xs' | 'sm' | 'md';
  /** Fired after a successful revive or dismiss so the parent can drop the row. */
  onResolved?: (leadId: string) => void;
};

export function ReviveLeadButton({
  leadId,
  candidateId,
  showDismiss = false,
  size = 'sm',
  onResolved,
}: ReviveLeadButtonProps) {
  const toast = useToast;
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleRevive() {
    startTransition(async () => {
      const { error } = await reviveLeadAction({ leadId, candidateId });
      if (error) {
        toast.danger(error);
        return;
      }
      toast.success('Revived — a follow-up task is on the way.');
      setDone(true);
      onResolved?.(leadId);
    });
  }

  function handleDismiss() {
    if (!candidateId) return;
    startTransition(async () => {
      const { error } = await dismissRevivalCandidateAction({ candidateId, leadId });
      if (error) {
        toast.danger(error);
        return;
      }
      setDone(true);
      onResolved?.(leadId);
    });
  }

  if (done) return null;

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      {showDismiss && candidateId && (
        <Button
          variant="ghost"
          size={size}
          disabled={isPending}
          onClick={handleDismiss}
        >
          Not now
        </Button>
      )}
      <Button
        variant="primary"
        size={size}
        disabled={isPending}
        loading={isPending}
        iconLeft={Sparkles}
        onClick={handleRevive}
      >
        Revive
      </Button>
    </div>
  );
}
