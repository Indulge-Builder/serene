'use client';

import { createContext, useContext, useEffect, useId, useRef, type RefObject } from 'react';

export const ModalScopeContext = createContext<string | undefined>(undefined);
export const useModalScope = () => useContext(ModalScopeContext);
const stack: string[] = [];
const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]';

/** Topmost modal owns focus. Owned portals remain inside its logical focus scope. */
export function useModalFocus(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void, dismissible = true) {
  const id = useId();
  const latest = useRef({ onClose, dismissible });
  useEffect(() => { latest.current = { onClose, dismissible }; }, [onClose, dismissible]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(id);
    const top = () => stack.at(-1) === id;
    const roots = () => [panelRef.current, ...Array.from(document.querySelectorAll<HTMLElement>('[data-modal-owner]')).filter(el => el.dataset.modalOwner === id)].filter((el): el is HTMLElement => !!el);
    const contains = (node: Node | null) => !!node && roots().some(root => root.contains(node));
    const focusable = () => roots().flatMap(root => Array.from(root.querySelectorAll<HTMLElement>(selector))).filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[hidden],[inert],[aria-hidden="true"]'));
    const focusPanel = () => panelRef.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => { if (top() && !contains(document.activeElement)) focusPanel(); });
    const onFocus = (event: FocusEvent) => { if (top() && !contains(event.target as Node)) focusPanel(); };
    const onKey = (event: KeyboardEvent) => {
      if (!top() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        // A child popover handles Escape first; do not dismiss its parent too.
        if (roots().some(root => root !== panelRef.current && root.getClientRects().length > 0)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (latest.current.dismissible) latest.current.onClose();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const index = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        if (!items.length) { focusPanel(); return; }
        const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        items[next].focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      const wasTop = top();
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, id, panelRef]);
  return id;
}
