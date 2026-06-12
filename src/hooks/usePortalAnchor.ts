'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type PortalAnchorPosition = { top: number; left: number; flipUp: boolean };

type UsePortalAnchorOptions = {
  /** Panel width in px used for flip math before the real panel is measured. */
  estimatedWidth?: number;
  /** Panel height in px used for flip math before the real panel is measured. */
  estimatedHeight?: number;
  /** Gap in px between the trigger and the panel. */
  gap?: number;
  /** Minimum px kept between the panel and the right viewport edge. */
  edgeMargin?: number;
  /**
   * Outside-pointerdown targets inside this selector do not close the panel.
   * Defaults to '[data-datepicker-panel]' because DatePicker portals its
   * calendar to document.body — month navigation must not close the panel
   * that contains the picker trigger.
   */
  ignoreSelector?: string;
};

/**
 * THE canonical floating-panel anchoring mechanism (portal escape — see
 * CLAUDE.md Pattern Notes). Owns: open state, trigger/panel refs,
 * getBoundingClientRect positioning with visualViewport offset correction,
 * flip-up/flip-left logic, reposition on scroll/resize/visualViewport,
 * outside-pointerdown close, and a post-mount rAF re-measure that corrects
 * the flip direction once the real panel dimensions are known.
 *
 * Pair with <FloatingPanel> from src/components/ui/FloatingPanel.tsx:
 *
 *   const range = usePortalAnchor();
 *   <button ref={range.triggerRef} onClick={range.toggle} aria-expanded={range.open}>…</button>
 *   <FloatingPanel {...range.panelProps}>…</FloatingPanel>
 *
 * Never re-implement this plumbing inline.
 */
export function usePortalAnchor<TTrigger extends HTMLElement = HTMLButtonElement>(
  options: UsePortalAnchorOptions = {},
) {
  const {
    estimatedWidth = 420,
    estimatedHeight = 100,
    gap = 4,
    edgeMargin = 8,
    ignoreSelector = '[data-datepicker-panel]',
  } = options;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<TTrigger>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PortalAnchorPosition>({
    top: 0,
    left: 0,
    flipUp: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(
    (panelW?: number, panelH?: number) => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const w = panelW ?? estimatedWidth;
      const h = panelH ?? estimatedHeight;
      const vvLeft = window.visualViewport?.offsetLeft ?? 0;
      const vvTop = window.visualViewport?.offsetTop ?? 0;
      const flipLeft = rect.left + w > window.innerWidth - edgeMargin;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < h && rect.top > spaceBelow;
      // Clamp into the viewport gutter — a panel wider than the space on
      // either side of the trigger (narrow viewports) must never start
      // off-screen left or overflow right when room exists.
      const rawLeft = (flipLeft ? rect.right - w : rect.left) - vvLeft;
      const left = Math.max(edgeMargin, Math.min(rawLeft, window.innerWidth - w - edgeMargin));
      const top = (flipUp ? rect.top - gap : rect.bottom + gap) - vvTop;
      setPosition({ top, left, flipUp });
    },
    [estimatedWidth, estimatedHeight, gap, edgeMargin],
  );

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (ignoreSelector && target instanceof Element && target.closest(ignoreSelector)) return;
      setOpen(false);
    }
    function reposition() {
      updatePosition();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [open, updatePosition, ignoreSelector]);

  // After AnimatePresence commits the panel node, re-measure the real panel
  // dimensions and correct any flip-direction error from the estimates.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const { width, height } = panelRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) updatePosition(width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    setOpen,
    toggle,
    close,
    mounted,
    triggerRef,
    panelRef,
    position,
    /** Spread onto <FloatingPanel> — keeps call sites to one line. */
    panelProps: { open, mounted, position, panelRef },
  };
}
