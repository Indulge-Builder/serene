'use client';

import { ModalScopeContext, useModalFocus } from '@/hooks/useModalFocus';
import { Button } from '@/components/ui/Button';
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  ENTER_DURATION,
  EXIT_DURATION,
  EASE_OUT_EXPO,
  EASE_IN_EXPO,
  EASE_IN_OUT,
} from '@/lib/constants/motion';
import { lockBodyScroll } from '@/lib/utils/scroll';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DialogProps {
  open: boolean;
  /** Prevent dismissal while a mutation is in flight. */
  pending?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  /** Hides the header close button */
  hideCloseButton?: boolean;
  /**
   * Body padding. Default `true` (the standard --space-5/6 inset). Pass `false`
   * when the child owns its own surface edge-to-edge (e.g. an embedded chat
   * panel that must sit flush against the modal chrome — no card-in-a-card).
   */
  bodyPadding?: boolean;
  /**
   * Tailwind max-width class override — takes precedence over size.
   * Exists for backward compat with callers that pass maxWidth="max-w-lg".
   */
  maxWidth?: string;
}

const MAX_WIDTH: Record<Exclude<DialogSize, 'full'>, string> = {
  sm: '480px',
  md: '600px',
  lg: '760px',
  xl: '960px',
};

export function Dialog({
  open,
  pending = false,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
  bodyPadding = true,
  maxWidth,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const isFull = size === 'full';
  const panelRef = useRef<HTMLDivElement>(null);

  const scopeId = useModalFocus(open, panelRef, onClose, !pending);

  // Lock body scroll while open — stops the scrollbar disappear/reappear that
  // shifts the page one frame as the fixed overlay mounts (the Called-modal
  // jitter). lockBodyScroll is re-entrant, so nested dialogs stay correct.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // SSR guard — after the hooks so hook order stays stable (ConfirmDialog pattern).
  if (typeof document === 'undefined') return null;

  // Portaled to document.body (2026-07-02): a CSS transform on any ancestor —
  // every Framer entrance animation — would re-anchor these fixed elements and
  // trap their z-index in that ancestor's stacking context. The portal makes
  // every Dialog consumer transform-safe by construction, matching
  // ConfirmDialog / FloatingPanel / NotificationPanel. z tokens unchanged.
  return createPortal(
    <ModalScopeContext.Provider value={scopeId}>
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: ENTER_DURATION, ease: EASE_IN_OUT }}
            onClick={() => { if (!pending) onClose(); }}
            className={
              isFull
                ? 'flex items-stretch justify-center p-0'
                // Bottom sheet <md (DNA R-06): panel docks to the bottom edge,
                // no gutter; centered dialog with the space-4 gutter from md up.
                : 'flex items-end justify-center p-0 md:items-center md:p-4'
            }
            style={{
              position:   'fixed',
              inset:      0,
              // Neumorphic scrim — warm umber (README modal recipe; the
              // sanctioned scrim treatment for this design system). No
              // backdrop-filter: it is not sanctioned on modal overlays (V-06)
              // and its per-frame recompute caused the open-animation shimmer.
              backgroundColor: 'var(--neu-scrim)',
              zIndex:     ('var(--z-overlay)' as React.CSSProperties['zIndex']),
            }}
          >
            {/* Panel */}
            <motion.div
              key="dialog-panel"
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-busy={pending || undefined}
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descId : undefined}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: ENTER_DURATION, ease: EASE_OUT_EXPO } }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: EXIT_DURATION, ease: EASE_IN_EXPO } }}
              onClick={(e) => e.stopPropagation()}
              className={[
                maxWidth,
                isFull
                  ? 'rounded-none'
                  // <md: sheet — top corners only, 90dvh ceiling, safe-area pad.
                  // md+: classic centered dialog radius + an 85dvh ceiling so a
                  // tall body (long lists) scrolls INSIDE the panel (its body is
                  // already flex:1 overflow:auto) instead of pushing the panel
                  // past the viewport and scrolling the page behind the overlay.
                  : 'rounded-t-xl rounded-b-none md:rounded-xl max-md:max-h-[90dvh] md:max-h-[85dvh] max-md:pb-[env(safe-area-inset-bottom)]',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                background:   'var(--neu-surface-high)',
                border:       '1px solid var(--neu-edge)',
                boxShadow:    'var(--neu-shadow-modal)',
                overflow:     'hidden',
                outline:      'none', // programmatic panel focus draws no ring
                display:      'flex',
                flexDirection:'column',
                zIndex:       ('var(--z-modal)' as React.CSSProperties['zIndex']),
                ...(isFull
                  ? { width: '100%', height: '100%' }
                  : { width: '100%', maxWidth: maxWidth ? undefined : MAX_WIDTH[size as keyof typeof MAX_WIDTH] }),
              }}
            >
              {/* Header — same <md gutter tightening as the body */}
              {(title || !hideCloseButton) && (
                <div
                  className="max-md:px-4!"
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    padding:        'var(--space-4) var(--space-6)',
                    background:     'var(--neu-section-bg)',
                    borderBottom:   '1px solid var(--theme-paper-border)',
                    flexShrink:     0,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {title && (
                      <h2
                        id={titleId}
                        style={{
                          fontFamily:  'var(--font-sans)',
                          fontSize:    'var(--text-base)',
                          fontWeight:  'var(--weight-semibold)',
                          color:       'var(--theme-text-primary)',
                          margin:      0,
                          lineHeight:  'var(--leading-snug)',
                        }}
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p
                        id={descId}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize:   'var(--text-sm)',
                          color:      'var(--theme-text-secondary)',
                          margin:     '0.25rem 0 0',
                        }}
                      >
                        {description}
                      </p>
                    )}
                  </div>

                  {!hideCloseButton && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      iconMotion="rotate"
                      type="button"
                      onClick={() => { if (!pending) onClose(); }}
                      aria-label="Close dialog"
                      disabled={pending}
                    >
                      <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}

              {/* Body — the <md bottom sheet drops to the space-4 inset (the
                  desktop space-6 gutters eat ~13% of a 360px sheet and read
                  as fields floating in a void); md+ keeps the classic inset. */}
              <div
                className={bodyPadding ? 'max-md:px-4! max-md:py-4!' : undefined}
                style={{
                  flex:       1,
                  overflow:   'auto',
                  padding:    bodyPadding ? 'var(--space-5) var(--space-6)' : 0,
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-primary)',
                  lineHeight: 'var(--leading-normal)',
                  display:    bodyPadding ? undefined : 'flex',
                  flexDirection: bodyPadding ? undefined : 'column',
                  minHeight:  bodyPadding ? undefined : 0,
                }}
              >
                {children}
              </div>

              {/* Footer — same <md gutter tightening as the body */}
              {footer && (
                <div
                  className="max-md:px-4!"
                  style={{
                    display:        'flex',
                    justifyContent: 'flex-end',
                    gap:            'var(--space-3)',
                    padding:        'var(--space-4) var(--space-6)',
                    borderTop:      '1px solid var(--theme-paper-border)',
                    flexShrink:     0,
                  }}
                >
                  {footer}
                </div>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </ModalScopeContext.Provider>,
    document.body,
  );
}
