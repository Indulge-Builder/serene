'use client';

import { useState } from 'react';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import type { AppDomain, UserRole } from '@/lib/types/database';

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

  return (
    <>
      <MotionButton
        {...MOTION_BUTTON_DEFAULTS}
        variant="primary"
        type="button"
        onClick={() => setOpen(true)}
        style={{ boxShadow: 'var(--shadow-accent-glow)', whiteSpace: 'nowrap' }}
      >
        + Add Lead
      </MotionButton>

      <AddLeadModal
        open={open}
        onClose={() => setOpen(false)}
        callerProfile={callerProfile}
        initialAgents={initialAgents}
        initialDomain={callerProfile.domain}
        onSuccess={() => setOpen(false)}
      />
    </>
  );
}
