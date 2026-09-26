'use client';

// The shell's error boundary: a page that threw while drawing, shown inside the dashboard
// layout so the sidebar, the theme and the way back stay. A failure in the layout itself
// goes past this file to app/global-error.tsx.

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function DashboardError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error);
  }, [error]);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <BackButton href="/dashboard" label="Back to the dashboard" />
        <h1 className="type-page-title m-0">
          A hitch<span className="page-title-dot">.</span>
        </h1>
      </div>

      <EmptyState
        framed
        icon={TriangleAlert}
        title="This page could not be drawn."
        description="Nothing you did caused it. Try again; if it keeps happening, tell the tech team what you were opening."
        action={<Button variant="primary" onClick={reset}>Try again</Button>}
      />

      {/* The digest is what the server log carries for this failure: the one line to send. */}
      {error.digest && (
        <p
          style={{
            margin:     'var(--space-4) 0 0',
            textAlign:  'center',
            fontFamily: 'var(--font-mono)',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
          }}
        >
          Reference {error.digest}
        </p>
      )}
    </main>
  );
}
