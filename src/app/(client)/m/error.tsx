'use client';

// The mobile layer's error boundary (/m/*): a room that could not be drawn. One raised card
// on the canvas, the shared EmptyState at its compact scale, one way to try again. No page
// title here: the mobile rooms carry no h1. --neu-* tokens only, like every mobile surface.

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function MobileError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[mobile error boundary]', error);
  }, [error]);

  return (
    <div
      className="flex-1 flex flex-col justify-center px-5 pb-8"
      style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
    >
      <div
        className="rounded-[24px] bg-(--neu-surface) border border-(--neu-edge)"
        style={{ boxShadow: 'var(--neu-shadow-raised)', padding: 'var(--space-6)' }}
      >
        <EmptyState
          variant="inline"
          icon={TriangleAlert}
          title="This page could not be drawn."
          description="Nothing you did caused it. Try again; if it keeps happening, tell the tech team what you were opening."
          action={<Button variant="primary" onClick={reset}>Try again</Button>}
        />
        {error.digest && (
          <p
            style={{
              margin:     'var(--space-3) 0 0',
              textAlign:  'center',
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-2xs)',
              color:      'var(--neu-text-tertiary)',
            }}
          >
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
