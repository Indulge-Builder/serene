'use client';

import { useSyncExternalStore } from 'react';

/**
 * THE canonical media-query strings for client JS (responsive audit 2026-06,
 * decision D-1). Components never write a raw matchMedia string or read
 * window.innerWidth for layout decisions — they pass one of these to
 * useMediaQuery. Pixel values mirror DESIGN-DNA §2.7 / Tailwind v4 defaults;
 * if a breakpoint ever changes there, change it here too.
 */
export const MQ = {
  /** Below --bp-md (768px) — phones. The layout-shift boundary (DNA §9.1). */
  mobile: '(max-width: 767.98px)',
  /** Below --bp-lg (1024px) — anything narrower than the full-sidebar desktop shell. */
  tabletDown: '(max-width: 1023.98px)',
  /** Coarse pointer — touch-first device, regardless of width. */
  touch: '(pointer: coarse)',
} as const;

/**
 * useMediaQuery — THE viewport/media condition hook.
 *
 * SSR-safe via useSyncExternalStore: the server snapshot is always `false`
 * (desktop-first markup renders on the server; the client corrects on
 * hydration). Subscribes to MediaQueryList changes, so zoom and window
 * resize update live — never a mount-time snapshot.
 *
 * Prefer CSS (`md:` classes / stylesheet media queries) for anything that is
 * purely presentational; reach for this hook only when *behaviour* must
 * branch (e.g. single-pane vs split-pane navigation).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
