'use client';

// AddClientButton — the page's primary CTA; opens ClientFormModal in create mode.
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { ClientFormModal } from './ClientFormModal';
import type { QueendomSummary } from '@/lib/types/client';

export function AddClientButton({ queendoms, defaultQueendomId, canPickQueendom }: { queendoms: QueendomSummary[]; defaultQueendomId: string | null; canPickQueendom: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MotionButton {...MOTION_BUTTON_DEFAULTS} onClick={() => setOpen(true)}>
        <UserPlus style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        New client
      </MotionButton>
      {open && <ClientFormModal open={open} onClose={() => setOpen(false)} queendoms={queendoms} defaultQueendomId={defaultQueendomId} canPickQueendom={canPickQueendom} />}
    </>
  );
}
