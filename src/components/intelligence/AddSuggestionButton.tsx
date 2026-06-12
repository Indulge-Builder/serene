'use client';

// "+ Suggestion" header CTA on /helpdesk (AddLeadButton pattern). Rendered
// only for admin/founder — upsertServiceCaseAction enforces the same gate
// server-side. Modal chunk loads on intent (perf G-1) behind the mount latch.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import type { AppDomain } from '@/lib/types/database';

const AddSuggestionModal = dynamic(
  () => import('@/components/intelligence/AddSuggestionModal').then((m) => m.AddSuggestionModal),
  { ssr: false },
);

type Props = {
  /** The helpdesk library shelf the page resolved — pre-selects the modal's Domain field. */
  domain: AppDomain;
};

export function AddSuggestionButton({ domain }: Props) {
  const [open, setOpen] = useState(false);
  const mountModal = useMountOnFirstOpen(open);

  return (
    <>
      <MotionButton
        {...MOTION_BUTTON_DEFAULTS}
        variant="primary"
        type="button"
        iconLeft={Plus}
        iconMotion="rotate"
        onClick={() => setOpen(true)}
        style={{ boxShadow: 'var(--shadow-accent-glow)', whiteSpace: 'nowrap' }}
      >
        Suggestion
      </MotionButton>

      {mountModal && (
        <AddSuggestionModal
          open={open}
          onClose={() => setOpen(false)}
          initialDomain={domain}
        />
      )}
    </>
  );
}
