// The shell's "not here" page: what notFound() from a ticket, member, vendor or lead page
// draws, inside the dashboard layout, so the sidebar, the theme and the way back stay.
// A record that was merged or removed lands here too, which is why the copy names it.
// Addresses outside the shell fall to app/not-found.tsx instead.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SearchX } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';

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

export default function DashboardNotFound() {
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <BackButton href="/dashboard" label="Back to the dashboard" />
        <h1 className="type-page-title m-0">
          Not here<span className="page-title-dot">.</span>
        </h1>
      </div>

      <EmptyState
        framed
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
