'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import type { AppDomain, UserRole } from '@/lib/types/database';

// Load-on-intent (perf audit G-1): the modal + its form chain stay out of the
// /leads route chunk until the button is first clicked.
const AddLeadModal = dynamic(
  () => import('@/components/leads/AddLeadModal').then((m) => m.AddLeadModal),
  { ssr: false },
);

type CallerProfile = {
  id: string;
  role: UserRole;
  domain: AppDomain;
  full_name: string;
};

type Agent = { id: string; full_name: string };

type Props = {
  callerProfile: CallerProfile;
  initialAgents: Agent[];
};

export function AddLeadButton({ callerProfile, initialAgents }: Props) {
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
        Add Lead
      </MotionButton>

      {mountModal && (
        <AddLeadModal
          open={open}
          onClose={() => setOpen(false)}
          callerProfile={callerProfile}
          initialAgents={initialAgents}
          initialDomain={callerProfile.domain}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  );
}
