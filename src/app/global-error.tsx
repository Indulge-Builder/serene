'use client';

// The last boundary: the root layout itself failed, so there is no shell, no theme and no
// stylesheet to lean on. This file draws its own <html> and <body> with inline styles.
// It is the ONE place a component may write raw hex: the cream canvas and the ink below
// are the light-mode fallbacks of --neu-canvas and --neu-text-primary, written as values
// because the CSS variables may never have loaded when this page is the one that renders.

import { useEffect } from 'react';

const CANVAS = '#ECE8E1';
const INK    = '#38332B';

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin:         0,
          minHeight:      '100vh',
          background:     CANVAS,
          color:          INK,
          fontFamily:     'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        24,
          boxSizing:      'border-box',
        }}
      >
        <main style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <h1
            style={{
              margin:     '0 0 12px',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle:  'italic',
              fontWeight: 400,
              fontSize:   26,
              lineHeight: 1.3,
            }}
          >
            Serene could not start.
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Reload the page. If it keeps happening, tell the tech team.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              appearance:   'none',
              border:       'none',
              cursor:       'pointer',
              background:   INK,
              color:        CANVAS,
              fontFamily:   'inherit',
              fontSize:     14,
              fontWeight:   600,
              padding:      '10px 20px',
              borderRadius: 12,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                margin:     '20px 0 0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize:   11,
                opacity:    0.6,
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
