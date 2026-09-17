'use client';

// AddMemberButton — the page's primary CTA; opens MemberFormModal in create mode.
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { MemberFormModal } from './MemberFormModal';
import type { QueendomSummary } from '@/lib/types/member';

export function AddMemberButton({ queendoms, defaultQueendomId, canPickQueendom }: { queendoms: QueendomSummary[]; defaultQueendomId: string | null; canPickQueendom: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MotionButton {...MOTION_BUTTON_DEFAULTS} onClick={() => setOpen(true)}>
        <UserPlus style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        New member
      </MotionButton>
      {open && <MemberFormModal open={open} onClose={() => setOpen(false)} queendoms={queendoms} defaultQueendomId={defaultQueendomId} canPickQueendom={canPickQueendom} />}
    </>
  );
}
