/** Scrolls a container to its bottom edge (chat timelines, log panels). */
export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

let bodyScrollLocks = 0;
let previousOverflow = '';

/**
 * Locks body scroll (mobile drawer / sheet open). Returns the unlock function —
 * call it on close/unmount. Re-entrant: nested locks release only when the
 * last holder unlocks.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (bodyScrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
