// The root "not here" page: an address outside both shells. Nothing here needs a session
// and nothing is fetched, so a signed-out visitor sees it too. Inside the dashboard,
// (dashboard)/not-found.tsx draws the same state with the sidebar and the way back.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeedMandala } from '@/components/ui/SeedMandala';

/** The tickets/page.tsx link-as-button pattern: Button has no href, a Link wears its chrome. */
const LINK_BUTTON: CSSProperties = {
  display:      'inline-flex',
  alignItems:   'center',
  gap:          'var(--space-2)',
  padding:      'var(--space-2) var(--space-4)',
  borderRadius: 'var(--radius-sm)',
  fontSize:     'var(--text-sm)',
  fontWeight:   'var(--weight-medium)',
};

export default function RootNotFound() {
  return (
    <main
      style={{
        minHeight:      '100dvh',
        background:     'var(--neu-canvas)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            'var(--space-4)',
        padding:        'var(--space-8) var(--space-4)',
      }}
    >
      <SeedMandala size={96} />
      <EmptyState
        icon={SearchX}
        title="That page does not exist."
        description="The link may be old, or the record may have been merged or removed. Check the address, or go back to where you were."
        action={
          <Link href="/dashboard" className="serene-btn-secondary serene-pressable" style={LINK_BUTTON}>
            Go to the dashboard
          </Link>
        }
      />
    </main>
  );
}
