/** Scrolls a container to its bottom edge (chat timelines, log panels). */
export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

let bodyScrollLocks = 0;
let previousStyles = { overflow: '', position: '', top: '', width: '' };
let lockedScrollY = 0;

/**
 * Locks body scroll (mobile drawer / sheet open). Returns the unlock function —
 * call it on close/unmount. Re-entrant: nested locks release only when the
 * last holder unlocks; the first lock records, the last unlock restores.
 *
 * `overflow: hidden` alone is not enough on iOS Safari — the page behind a
 * drawer or sheet still rubber-bands (mobile audit 2026-09-26). The lock is
 * the position-fixed body: the scroll offset is recorded, the body is pinned
 * at `top: -scrollY` so nothing jumps, and on the last unlock the styles come
 * back and the window is scrolled to where it was.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (bodyScrollLocks === 0) {
    const { style } = document.body;
    previousStyles = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      width: style.width,
    };
    lockedScrollY = window.scrollY;
    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${lockedScrollY}px`;
    style.width = '100%';
  }
  bodyScrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks === 0) {
      const { style } = document.body;
      style.overflow = previousStyles.overflow;
      style.position = previousStyles.position;
      style.top = previousStyles.top;
      style.width = previousStyles.width;
      window.scrollTo(0, lockedScrollY);
    }
  };
}
