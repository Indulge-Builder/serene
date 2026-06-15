'use client';

// Floating Elaya widget — a circular presence button in the bottom-opposite
// corner from the mobile nav hamburger (which floats top-left), on every
// dashboard route EXCEPT /elaya. Clicking it opens a modal that renders the
// SAME ElayaChatShell the /elaya page renders (hideIdentity, chat-only) — zero
// fork, so anything built on the main chat surface appears here automatically.
//
// Seeding crosses a server boundary: a 'use client' component can't call
// elaya-service (A-15), so getElayaChatSeedAction() resolves the exact same seed
// resolveElayaChatSeed gives the /elaya RSC page (R-01) — the widget continues
// the user's single active conversation, never a parallel one.
//
// Hidden on /elaya so two live ElayaChatShell instances never double-stream or
// double-count the daily cap. The button + modal portal to document.body to
// escape any transformed shell ancestor (the Phase-6 clipping fix).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { ElayaGlyph } from '@/components/ui/elaya-glyph';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';
import { getElayaChatSeedAction } from '@/lib/actions/elaya';
import { SPRING_CONFIG, ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { ElayaChatSeed } from '@/lib/services/elaya-service';

// The chat surface is heavy (SSE loop, MessageBar, DictationButton). Load it on
// intent — never into the dashboard route chunk (perf audit G-1, heavy-modal rule).
const ElayaChatShell = dynamic(
  () => import('@/components/elaya/ElayaChatShell').then((m) => m.ElayaChatShell),
  { ssr: false },
);

export function ElayaWidget() {
  const toast = useToast;
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seed, setSeed] = useState<ElayaChatSeed | null>(null);

  // Portal target only exists client-side.
  useEffect(() => setMounted(true), []);

  // The /elaya page already owns a live ElayaChatShell on the same conversation;
  // a second one here would double-stream and double-count the cap. Hide there.
  const onElayaPage = pathname === '/elaya';

  async function handleOpen() {
    if (loading) return;
    setLoading(true);
    // Re-seed on every open so the widget reflects the conversation's current
    // state (e.g. messages sent on /elaya in another tab) — the shell remounts
    // with fresh props because it only mounts while open && seed.
    const res = await getElayaChatSeedAction();
    setLoading(false);
    if (res.error || !res.data) {
      toast.danger(res.error ?? 'Elaya is unavailable right now.');
      return;
    }
    setSeed(res.data);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    // Drop the seed so the next open re-fetches and the shell remounts fresh.
    setSeed(null);
  }

  if (!mounted || onElayaPage) return null;

  return createPortal(
    <>
      {/* Floating trigger — bottom-right, the corner opposite the top-left nav
          hamburger. Accent-washed paper bubble (mirrors .serene-mobile-trigger),
          breathing glyph = Elaya is present. */}
      <motion.button
        type="button"
        aria-label="Open Elaya"
        className="serene-elaya-fab serene-pressable serene-touch"
        onClick={() => void handleOpen()}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING_CONFIG}
        whileHover={reduceMotion ? undefined : { scale: 1.05 }}
        whileTap={reduceMotion ? undefined : { scale: 0.95 }}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : (
          <ElayaGlyph size={24} />
        )}
      </motion.button>

      {/* The chat IS the modal surface — no card-in-a-card. The Dialog provides
          ONLY the overlay + rounded paper panel + entrance; the embedded shell
          fills it flush (its own refined presence header carries the close X,
          DESIGN-DNA §15.3 Surface A). bodyPadding={false} removes the inset so
          the chat sits edge-to-edge; hideCloseButton because the shell owns it. */}
      <Dialog
        open={open}
        onClose={handleClose}
        size="lg"
        hideCloseButton
        bodyPadding={false}
      >
        {/* Bounded height so the flex-fill chat renders a real chat area. The
            shell only mounts with a seed, so it always opens on the user's
            current conversation. */}
        <div className="flex flex-col" style={{ height: 'min(78dvh, 680px)' }}>
          <AnimatePresence mode="wait">
            {seed && (
              <motion.div
                key={seed.conversationId}
                className="flex flex-1 flex-col"
                style={{ minHeight: 0 }}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
              >
                <ElayaChatShell
                  conversationId={seed.conversationId}
                  initialMessages={seed.initialMessages}
                  greeting={seed.greeting}
                  remainingToday={seed.remainingToday}
                  embedded
                  onClose={handleClose}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Dialog>
    </>,
    document.body,
  );
}
