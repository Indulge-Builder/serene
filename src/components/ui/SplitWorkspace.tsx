// SplitWorkspace — THE two-card conversation layout (2026-09-25): a 340px rail card
// beside a flexible pane card from md up, on the workspace ground under the page
// header. Sia and WhatsApp both compose it, and so do their loading.tsx skeletons,
// so the page and its skeleton can never drift apart.
//
// Below md the shell shows one card at a time (its own useMediaQuery switch) and
// the rail spans the width. These pieces own the card chrome and the widths only.
// Display stays with the caller's utilities (e.g. `hidden md:flex` on an empty
// pane), because an unlayered class here would override Tailwind's layered ones.
//
// Server-component-safe: no hooks, no motion.

import type { ReactNode } from 'react';

const CARD =
  'rounded-(--radius-lg) border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1) overflow-hidden min-h-0';

/** The row that holds the two cards; fills the height left under the page header. */
export function SplitWorkspace({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 flex gap-4">{children}</div>;
}

/** The list card: full width below md, a fixed 340px column from md up. */
export function SplitRail({ children }: { children: ReactNode }) {
  return <aside className={`${CARD} flex flex-col w-full md:w-[340px] md:shrink-0`}>{children}</aside>;
}

/** The rail's top strip (search, filters): a hairline separates it from the list. */
export function SplitRailHeader({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 px-3 pt-3 pb-2 border-b border-(--theme-paper-border) flex flex-col gap-2">
      {children}
    </div>
  );
}

/** The rail's scrolling list. */
export function SplitRailList({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>;
}

/**
 * The open conversation card. `className` sets its display: the default is a flex
 * column (a chat); an empty or loading pane centres its content and passes
 * `hidden md:flex items-center justify-center` so a phone never shows it.
 */
export function SplitPane({ children, className = 'flex flex-col' }: { children: ReactNode; className?: string }) {
  return <section className={`${CARD} relative flex-1 min-w-0 ${className}`}>{children}</section>;
}
