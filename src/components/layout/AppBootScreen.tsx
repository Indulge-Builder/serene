'use client';

import React, { useEffect, useState } from 'react';
import { SeedMandala } from '@/components/ui/SeedMandala';

// AppBootScreen — the hero loading sequence (logo-motion handoff §Boot).
// Full-viewport on --neu-canvas: the mark and the SERENE / BY INDULGE lockup
// beneath it (2026-09-25, after the Indulge app's splash). The eight rings draw
// themselves (1.15s each, 90ms apart), the centre circle draws last and seals
// the mark, and once the draw completes (~1.9s) it turns continuously, one
// revolution per 24s (the Indulge app's mandalaSpin). The lockup fades in with
// the draw, and the word's tracking breathes open (0.10em → 0.42em, transform
// only) as the centre circle lands, on the splash's own clock. Nothing else: no
// tagline, no glow, no pulse. The draw IS the progress indicator — no bar below
// the mark. Plays once per app load (a hard navigation — the
// dashboard layout persists across client-side route changes, so soft navs
// never replay it). The overlay SSRs with the shell, so it is visible from
// first paint; the layout beneath only streams once the shell's data has
// resolved server-side, so dismissal is time-based: hold until the sequence
// has played, then fade.

const SEQUENCE_MS = 3400;
const REDUCED_MS = 500;
/** The draw ends when the centre circle finishes: 8 × 90ms stagger + 1150ms. */
const DRAW_DONE_MS = 8 * 90 + 1150;
/** One revolution per 24s: the Indulge app's CLOCK.mandalaSpin. */
const SPIN_S = 24;
/** The wordmark, one span per letter so each can travel on its own (the
 *  tracking reveal in design-tokens.css reads --serene-boot-gap). */
const WORD = 'SERENE';
const WORD_MIDDLE = (WORD.length - 1) / 2;
/** The word's set tracking, the Indulge splash's TRACK_TO. */
const WORD_TRACKING = '0.42em';
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
        background: 'var(--neu-canvas)',
        opacity: leaving ? 0 : 1,
        pointerEvents: leaving ? 'none' : 'auto',
        transition: 'opacity 500ms var(--ease-in-out)',
      }}
    >
      {/* The spin waits for the draw, so the rings trace in still and only
          then begin their slow, continuous turn. */}
      <SeedMandala
        size={176}
        draw
        spin={SPIN_S}
        style={{ animationDelay: `${DRAW_DONE_MS}ms` }}
      />

      {/* The lockup. SERENE is the serif wordmark set wide (the mobile bar's
          caps, at boot scale); the endorsement sits beneath it in small tracked
          caps, the Indulge lockup's order. Hidden from assistive tech: the
          status label already says what this is. */}
      <div
        aria-hidden="true"
        className="serene-boot-lockup"
        style={{
          marginTop: 'var(--space-10)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-normal)',
            letterSpacing: WORD_TRACKING,
            // Letter-spacing trails the last letter; the same space on the left
            // puts the word's optical middle under the mark's.
            paddingLeft: WORD_TRACKING,
            lineHeight: 1,
            color: 'var(--neu-text-primary)',
          }}
        >
          {Array.from(WORD, (letter, i) => (
            <span
              key={i}
              className="serene-boot-letter"
              style={{ '--serene-boot-gap': i - WORD_MIDDLE } as React.CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
            letterSpacing: '0.32em',
            paddingLeft: '0.32em',
            lineHeight: 1,
            textTransform: 'uppercase',
            color: 'var(--neu-text-tertiary)',
          }}
        >
          By Indulge
        </span>
      </div>

      {/* Reduced motion: the draw, spin and lockup classes are gated in the token
          layer, so the mark rests finished and still, the lockup sits set, and
          the cover fades after 500ms. */}
    </div>
  );
}
