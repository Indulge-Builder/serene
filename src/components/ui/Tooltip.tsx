'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  TOOLTIP_DURATION,
  TOOLTIP_INTENT_MS,
  EASE_SPRING,
  EASE_IN_OUT,
} from '@/lib/constants/motion';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';

/**
 * Tooltip — THE charcoal hover pill (polish handoff §05).
 *
 * Mode-aware pill (--neu-tooltip-* roles): charcoal-on-cream in light,
 * INVERTED cream-on-charcoal under [data-neu="dark"] (dark handoff §tooltip).
 * 180ms fade + 5px directional slide from the trigger side, ~500ms
 * hover-intent delay with instant reshow when moving between adjacent
 * triggers. Shows on :focus-visible too; NEVER on coarse pointers
 * (gated on MQ.finePointer). Hoverable content; Escape dismisses without closing a parent dialog.
 *
 * Positioning is deliberately NOT usePortalAnchor — that hook owns
 * click-driven dropdown panels (open state, outside-close, flip-down).
 * A tooltip is hover-driven, side-placed and centred on its trigger,
 * and needs none of the close plumbing; it shares only the
 * document.body portal escape. Do not migrate it onto usePortalAnchor.
 *
 * Required call sites (handoff): collapsed sidebar rail items (side
 * "right"), icon-only buttons (side "bottom", label + optional kbd),
 * truncated table cells (side "top", full text).
 *
 *   <Tooltip label="Refresh" kbd="R" side="bottom">
 *     <button aria-label="Refresh">…</button>
 *   </Tooltip>
 */

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: React.ReactNode;
  /** Optional shortcut chip rendered after the label. */
  kbd?: string;
  side?: TooltipSide;
  /** Gap between trigger and pill in px. */
  offset?: number;
  /** Disable entirely (e.g. while a menu owned by the trigger is open). */
  disabled?: boolean;
  /** Wrapper display — 'inline' (default) for buttons/cells, 'block' for
   *  full-width rows (sidebar rail links). The wrapper carries the hover
   *  handlers; it must not change the child's layout. */
  wrap?: 'inline' | 'block';
  children: React.ReactNode;
}

/** Shared across all tooltip instances: when one pill hid moments ago,
 *  the next trigger shows instantly (no second intent delay). */
let lastHiddenAt = 0;
const RESHOW_WINDOW_MS = 250;

const SLIDE = 5;

function slideOffset(side: TooltipSide): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: 0, y: SLIDE };
    case 'bottom': return { x: 0, y: -SLIDE };
    case 'left':   return { x: SLIDE, y: 0 };
    case 'right':  return { x: -SLIDE, y: 0 };
  }
}

export function Tooltip({
  label,
  kbd,
  side = 'top',
  offset = 10,
  disabled = false,
  wrap = 'inline',
  children,
}: TooltipProps) {
  const tooltipId = useId();
  const reducedMotion = useReducedMotion();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const finePointer = useMediaQuery(MQ.finePointer);
  const wrapperRef = useRef<HTMLElement>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    switch (side) {
      case 'top':    return { top: r.top - offset,    left: r.left + r.width / 2 };
      case 'bottom': return { top: r.bottom + offset, left: r.left + r.width / 2 };
      case 'left':   return { top: r.top + r.height / 2, left: r.left - offset };
      case 'right':  return { top: r.top + r.height / 2, left: r.right + offset };
    }
  }, [side, offset]);

  const show = useCallback(() => {
    const next = measure();
    if (!next) return;
    setPos(next);
    setOpen(true);
  }, [measure]);

  const hide = useCallback(() => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    intentTimer.current = null;
    setOpen((was) => {
      if (was) lastHiddenAt = Date.now();
      return false;
    });
  }, []);

  const onEnter = useCallback(() => {
    if (disabled || !finePointer) return;
    setKeyboardOpen(false);
    if (Date.now() - lastHiddenAt < RESHOW_WINDOW_MS) {
      show(); // adjacent-trigger reshow — no second intent delay
      return;
    }
    if (intentTimer.current) clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(show, TOOLTIP_INTENT_MS);
  }, [disabled, finePointer, show]);

  // Keyboard path — :focus-visible only, instant (no hover-intent wait).
  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (disabled) return;
      if (!(e.target instanceof Element) || !e.target.matches(':focus-visible')) return;
      setKeyboardOpen(true);
      show();
    },
    [disabled, show],
  );

  // Any scroll while open would strand the fixed pill — just hide.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, hide]);

  useEffect(
    () => () => {
      if (intentTimer.current) clearTimeout(intentTimer.current);
    },
    [],
  );

  // Attach the description to the actual trigger while preserving its own hints.
  useEffect(() => {
    if (!open || disabled) return;
    const wrapper = wrapperRef.current;
    const active = document.activeElement;
    const target = active instanceof HTMLElement && wrapper?.contains(active)
      ? active : wrapper?.querySelector<HTMLElement>('button,a,input,[tabindex]');
    if (target) {
      const ids = new Set((target.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
      ids.add(tooltipId);
      target.setAttribute('aria-describedby', [...ids].join(' '));
    }
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      hide();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => {
      document.removeEventListener('keydown', dismiss, true);
      if (target) {
        const ids = (target.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== tooltipId);
        if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
        else target.removeAttribute('aria-describedby');
      }
    };
  }, [open, disabled, tooltipId, hide]);

  const deferHide = () => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(hide, 120);
  };
  const keepOpen = () => {
    if (intentTimer.current) clearTimeout(intentTimer.current);
  };
  const slide = reducedMotion || keyboardOpen ? { x: 0, y: 0 } : slideOffset(side);
  // Centre the pill on the trigger along the cross axis.
  const centreTransform =
    side === 'top' || side === 'bottom'
      ? `translateX(-50%)${side === 'top' ? ' translateY(-100%)' : ''}`
      : `translateY(-50%)${side === 'left' ? ' translateX(-100%)' : ''}`;

  const Wrapper = wrap === 'block' ? 'div' : 'span';

  return (
    <Wrapper
      ref={wrapperRef as React.RefObject<HTMLDivElement>}
      onMouseEnter={onEnter}
      onMouseLeave={deferHide}
      onPointerDown={hide}
      onFocus={onFocus}
      onBlur={hide}
      style={wrap === 'block' ? undefined : { display: 'inline-flex', maxWidth: '100%', minWidth: 0 }}
    >
      {children}
      {mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && !disabled && pos && (
              <motion.span
                key="tooltip"
                role="tooltip"
                id={tooltipId}
                onMouseEnter={keepOpen}
                onMouseLeave={deferHide}
                initial={{ opacity: 0, x: slide.x, y: slide.y }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, transition: { duration: TOOLTIP_DURATION / 2, ease: EASE_IN_OUT } }}
                transition={{
                  opacity: { duration: keyboardOpen ? 0 : TOOLTIP_DURATION, ease: EASE_IN_OUT },
                  x: { duration: keyboardOpen ? 0 : TOOLTIP_DURATION, ease: EASE_SPRING },
                  y: { duration: keyboardOpen ? 0 : TOOLTIP_DURATION, ease: EASE_SPRING },
                }}
                // Framer owns x/y — the static centring shift must ride
                // transformTemplate or it gets clobbered (see motion.ts).
                transformTemplate={(_, generated) =>
                  generated === 'none' ? centreTransform : `${centreTransform} ${generated}`
                }
                style={{
                  position:      'fixed',
                  top:           pos.top,
                  left:          pos.left,
                  zIndex:        'var(--z-tooltip)' as React.CSSProperties['zIndex'],
                  display:       'inline-flex',
                  alignItems:    'center',
                  gap:           'var(--space-2)',
                  padding:       '7px 12px',
                  borderRadius:  '12px',
                  background:    'var(--neu-tooltip-bg)',
                  color:         'var(--neu-tooltip-text)',
                  fontFamily:    'var(--font-sans)',
                  fontSize:      '11.5px',
                  fontWeight:    'var(--weight-medium)' as React.CSSProperties['fontWeight'],
                  lineHeight:    'var(--leading-none)',
                  whiteSpace:    'nowrap',
                  boxShadow:     'var(--neu-tooltip-shadow)',
                  pointerEvents: 'auto',
                }}
              >
                {label}
                {kbd && (
                  <span
                    style={{
                      fontSize:     '9.5px',
                      fontWeight:   'var(--weight-semibold)' as React.CSSProperties['fontWeight'],
                      padding:      '2px 6px',
                      borderRadius: '5px',
                      background:   'var(--neu-tooltip-kbd-bg)',
                    }}
                  >
                    {kbd}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Wrapper>
  );
}
