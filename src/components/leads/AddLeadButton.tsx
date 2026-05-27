'use client';

import { useState } from 'react';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          height:         '2.25rem',
          paddingLeft:    'var(--space-4)',
          paddingRight:   'var(--space-4)',
          border:         'none',
          borderRadius:   'var(--radius-sm)',
          background:     'var(--theme-accent)',
          fontSize:       'var(--text-sm)',
          fontWeight:     'var(--weight-medium)',
          color:          'var(--theme-accent-fg)',
          cursor:         'pointer',
          transition:     'var(--transition-interactive)',
          boxShadow:      'var(--shadow-accent-glow)',
          whiteSpace:     'nowrap',
        }}
      >
        + Add Lead
      </button>

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
