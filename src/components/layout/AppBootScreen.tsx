'use client';

import React, { useEffect, useState } from 'react';
import { SeedMandala } from '@/components/ui/SeedMandala';

// AppBootScreen — the hero loading sequence (logo-motion handoff §Boot).
// Full-viewport on --neu-canvas: the mark draws itself (1.9s), then breathes
// on a barely-perceptible 90s turn inside a pulsing accent glow; the wordmark
// opens its tracking at 1.5s, the tagline fades up at 2.1s. The draw IS the
// progress indicator — no bar below the mark. Plays once per app load (a hard navigation — the
// dashboard layout persists across client-side route changes, so soft navs
// never replay it). The overlay SSRs with the shell, so it is visible from
// first paint; the layout beneath only streams once the shell's data has
// resolved server-side, so dismissal is time-based: hold until the sequence
// has played, then fade.

const SEQUENCE_MS = 3400;
const REDUCED_MS = 500;
// Once per browser session (2026-09-16): the draw sequence is a cold-start
// moment, not a reload tax. The first hard load of a tab/PWA session plays it;
// every later reload, deploy refresh, or back/forward restore in that session
// skips straight to the app. sessionStorage (not localStorage) so a fresh
// launch tomorrow still gets the mark. Wrapped in try/catch: private windows
// and blocked storage fall back to "play" (the old behaviour), never a crash.
const BOOT_SEEN_KEY = 'serene:boot-seen';

function hasBootPlayedThisSession(): boolean {
  try {
    if (sessionStorage.getItem(BOOT_SEEN_KEY) === '1') return true;
    sessionStorage.setItem(BOOT_SEEN_KEY, '1');
  } catch {}
  return false;
}

export function AppBootScreen() {
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // SSR always renders the cover (zero-flash on the true cold start); the
    // repeat-load skip resolves here, one frame in, on the same canvas colour.
    if (hasBootPlayedThisSession()) {
      setDone(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setLeaving(true), reduced ? REDUCED_MS : SEQUENCE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div
      role="status"
      aria-label="Serene is loading"
      onTransitionEnd={() => leaving && setDone(true)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-boot)' as React.CSSProperties['zIndex'],
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '34px',
        background: 'var(--neu-canvas)',
        opacity: leaving ? 0 : 1,
        pointerEvents: leaving ? 'none' : 'auto',
        transition: 'opacity 500ms var(--ease-in-out)',
      }}
    >
      {/* Soft ambient glow — theme accent (the ONLY theme-tinted piece of the
          mark's stage), pulsing in phase with the breath (both from 2.6s). */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, var(--neu-boot-glow) 0%, transparent 65%)',
          opacity: 0.25,
          animation: 'serene-logo-glow 4s ease-in-out 2.6s infinite both',
        }}
      />

      {/* Breathe wraps the spin — two nested elements so transforms compose. */}
      <div
        style={{
          position: 'relative',
          width: 190,
          height: 190,
          animation: 'serene-logo-breathe 4s ease-in-out 2.6s infinite',
        }}
      >
        <SeedMandala size={190} draw spin={90} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '26px',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--neu-text-primary)',
            // paddingLeft mirrors the final tracking so the word stays
            // optically centred while the letter-spacing opens.
            paddingLeft: '0.42em',
            animation: 'serene-word-in 1.4s cubic-bezier(0.22, 1, 0.36, 1) 1.5s both',
          }}
        >
          SERENE
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            color: 'var(--neu-text-tertiary)',
            animation: 'serene-tagline-in 900ms cubic-bezier(0.22, 1, 0.36, 1) 2.1s both',
          }}
        >
          Attending to every detail
        </div>
      </div>

      {/* Reduced motion: kill every loop; the mark rests finished, text lands
          static (the draw/spin classes are gated in the token layer — these
          inline loops need their own gate). */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [role="status"][aria-label="Serene is loading"] * {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
