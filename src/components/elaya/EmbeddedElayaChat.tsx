'use client';

// EmbeddedElayaChat — THE shared body of every embedded Elaya surface: resolve
// the user's single active conversation, then render the SAME ElayaChatShell
// (embedded mode — flush, chat-only) the /elaya page renders, with a breathing
// glyph holding the seat while the seed lands. Both the floating ElayaWidget and
// the dashboard ElayaPresenceCard compose this — never re-inline the
// seed-resolve + shell render + glyph fallback again (R-01/R-03).
//
// Two seeding modes, by who owns the conversation lifecycle:
//   • seed passed in  → render immediately (the floating widget prefetches on
//     hover and hands its warm seed down; it owns re-fetch-on-reopen itself).
//   • no seed         → resolve on mount via getElayaChatSeedAction (the card,
//     which is always-on and never re-opens). A 'use client' surface can't call
//     elaya-service directly (A-15), so the seed crosses the boundary here.
//
// The shell is heavy (SSE loop, MessageBar, DictationButton) — it loads on
// intent, never into a route chunk (perf audit G-1). Callers that want to warm
// the chunk early import `loadElayaChatShell` and call it on hover/focus.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ElayaGlyph } from '@/components/ui/elaya-glyph';
import { useToast } from '@/hooks/useToast';
import { getElayaChatSeedAction } from '@/lib/actions/elaya';
import { formErrors } from '@/lib/validations/form-errors';
import type { ElayaChatSeed } from '@/lib/services/elaya-service';

export const loadElayaChatShell = () =>
  import('@/components/elaya/ElayaChatShell').then((m) => m.ElayaChatShell);

const ElayaChatShell = dynamic(loadElayaChatShell, { ssr: false });

type Props = {
  /**
   * A pre-resolved seed. When provided, the chat renders immediately and this
   * component does NOT fetch (the caller owns the conversation lifecycle — e.g.
   * the floating widget, which prefetches on hover). When absent, the component
   * resolves the seed itself on mount.
   */
  seed?: ElayaChatSeed | null;
  /** Forwarded to ElayaChatShell — shows its close affordance (the floating widget). */
  onClose?: () => void;
  /** Glyph size for the holding state. Default 28. */
  glyphSize?: number;
};

export function EmbeddedElayaChat({ seed: externalSeed, onClose, glyphSize = 28 }: Props) {
  const toast = useToast;
  const selfSeed = externalSeed === undefined; // undefined = resolve here; null = caller still loading
  const [seed, setSeed] = useState<ElayaChatSeed | null>(externalSeed ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!selfSeed) return; // caller owns seeding — never fetch
    let alive = true;
    getElayaChatSeedAction().then((res) => {
      if (!alive) return;
      if (res.error || !res.data) {
        setFailed(true);
        toast.danger(res.error ?? formErrors.elayaUnavailable);
        return;
      }
      setSeed(res.data);
    });
    return () => {
      alive = false;
    };
  }, [selfSeed, toast]);

  // The active seed: a caller-supplied one wins (it re-renders on prop change);
  // otherwise the one this component resolved.
  const activeSeed = selfSeed ? seed : externalSeed ?? null;

  if (activeSeed) {
    return (
      <ElayaChatShell
        conversationId={activeSeed.conversationId}
        initialMessages={activeSeed.initialMessages}
        greeting={activeSeed.greeting}
        remainingToday={activeSeed.remainingToday}
        embedded
        onClose={onClose}
      />
    );
  }

  // Holding state — her breathing glyph keeps Elaya present (a static glyph =
  // absent) while the conversation resolves; the same line on a failed seed.
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      style={{ gap: 'var(--space-3)', padding: 'var(--space-5)', minHeight: 0 }}
    >
      <span style={{ color: 'var(--theme-accent)', display: 'flex' }}>
        <ElayaGlyph size={glyphSize} />
      </span>
      <span
        className="italic"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-sm)',
          color: 'var(--theme-text-tertiary)',
        }}
      >
        {failed ? 'Elaya is catching her breath…' : 'Elaya is gathering her thoughts…'}
      </span>
    </div>
  );
}
