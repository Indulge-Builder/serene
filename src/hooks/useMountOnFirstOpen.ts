'use client';

import { useRef } from 'react';

/**
 * Mount-on-first-open latch for `next/dynamic` modals whose call site keeps
 * them permanently mounted (Dialog/modal.tsx owns its own
 * `<AnimatePresence>{open && …}` exit animation internally).
 *
 * `{useMountOnFirstOpen(open) && <HeavyModal open={open} … />}` defers the
 * lazy chunk fetch until the first open (load-on-intent, perf audit G-1)
 * while keeping the modal mounted afterwards so `open=false` still plays the
 * internal exit animation — conditional-rendering on `open` alone would cut it.
 *
 * Call sites that already conditional-render their modal (e.g. inside a
 * call-site `<AnimatePresence>` like SubTaskModal's) do NOT need this latch —
 * their existing conditional is already load-on-intent.
 */
export function useMountOnFirstOpen(open: boolean): boolean {
  const hasOpenedRef = useRef(false);
  // Monotonic latch — safe to set during render: the parent re-renders on
  // every `open` change, and the value only ever flips false → true.
  if (open) hasOpenedRef.current = true;
  return hasOpenedRef.current;
}
