'use client';

// UsagePresence — THE active-time heartbeat (adoption tracking, migration 0126).
//
// Mounted ONCE in the dashboard layout so it runs for every authenticated page.
// Renders nothing. Its entire job: fire recordPresenceAction() every
// HEARTBEAT_MS, but ONLY when the user is genuinely ACTIVE —
//   • the tab is VISIBLE (document.visibilityState === 'visible'), AND
//   • there was a real INTERACTION in the last IDLE_MS (~2 min).
//
// This gate is the feature, not a nicety: agents stay logged in 24/7, so a
// heartbeat that fired on a hidden or idle tab would mark every 24/7 session
// as fully active and make the whole adoption metric worthless. A hidden tab
// stops beating within one interval; an idle (no-interaction) tab stops beating
// once the last interaction ages past IDLE_MS.
//
// The hot path is Redis-only (the action does ONE SET, no DB write). A dropped
// beat (network/Redis hiccup) is harmless — it's just one missing minute-tick.

import { useEffect, useRef } from 'react';
import { recordPresenceAction } from '@/lib/actions/usage';

const HEARTBEAT_MS = 60_000; // beat cadence while active
const IDLE_MS = 120_000; // interaction older than this ⇒ idle ⇒ no beat (the "~2 min" rule)

// Passive, low-frequency-enough signals that the human is present at the tab.
// We only read the *timestamp* of the latest one — never act per-event — so a
// shared bumpInteraction with no throttling is cheap (one Date.now() write).
const INTERACTION_EVENTS: (keyof DocumentEventMap)[] = [
  'pointerdown',
  'keydown',
  'mousemove',
  'scroll',
  'touchstart',
  'click',
];

export function UsagePresence() {
  // Refs (not state) — none of this should trigger a re-render.
  const lastInteractionRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard against overlapping in-flight beats if a send is slow.
  const inFlightRef = useRef(false);

  useEffect(() => {
    const bumpInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    const isActive = () =>
      document.visibilityState === 'visible' &&
      Date.now() - lastInteractionRef.current < IDLE_MS;

    const beat = () => {
      if (inFlightRef.current) return;
      if (!isActive()) return;
      inFlightRef.current = true;
      // Fire-and-forget: the response body is ignored; failures are non-fatal
      // (a missed beat = one missing tick). Never throws to the effect.
      recordPresenceAction()
        .catch(() => {})
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const startInterval = () => {
      if (intervalRef.current !== null) return;
      intervalRef.current = setInterval(beat, HEARTBEAT_MS);
    };

    const stopInterval = () => {
      if (intervalRef.current === null) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Becoming visible counts as presence: refresh the interaction clock so
        // a returning user beats immediately rather than waiting up to IDLE_MS.
        bumpInteraction();
        beat(); // one immediate beat on focus return
        startInterval();
      } else {
        // Hidden tab: stop the interval entirely so no beats fire while away.
        stopInterval();
      }
    };

    // Wire interaction listeners (passive — never block scroll/input).
    for (const ev of INTERACTION_EVENTS) {
      document.addEventListener(ev, bumpInteraction, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // Initial state: only run the loop if we start visible.
    if (document.visibilityState === 'visible') {
      beat(); // immediate first beat on mount (mount itself is presence)
      startInterval();
    }

    return () => {
      for (const ev of INTERACTION_EVENTS) {
        document.removeEventListener(ev, bumpInteraction);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      stopInterval();
    };
  }, []);

  return null;
}
