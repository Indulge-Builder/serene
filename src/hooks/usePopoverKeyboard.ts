'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Keyboard support for legacy popovers; selection and search remain caller-owned. */
export function usePopoverKeyboard(open: boolean, panelRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>, onClose: () => void, manageArrowKeys = true, initialFocus = 'input:not(:disabled),[aria-selected="true"],button:not(:disabled)') {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    let panel: HTMLElement | null = null;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[data-drag-handle]'))) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close.current();
        trigger?.focus({ preventScroll: true }); return;
      }
      if (!manageArrowKeys) return;
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      if ((event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const options = Array.from(panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter(el => el.getClientRects().length > 0);
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      event.preventDefault(); options[next]?.focus();
    };
    const frame = requestAnimationFrame(() => {
      panel = panelRef.current;
      panel?.addEventListener('keydown', key);
      (panel?.querySelector<HTMLElement>(initialFocus) ?? panel?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      panel?.removeEventListener('keydown', key);
      if (panel?.contains(document.activeElement) || document.activeElement === document.body) trigger?.focus({ preventScroll: true });
    };
  }, [open, panelRef, triggerRef, manageArrowKeys, initialFocus]);
}
