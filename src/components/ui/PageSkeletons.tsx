// PageSkeletons — THE shared scaffold blocks for loading.tsx files.
//
// The Standard Page Layout Contract (root CLAUDE.md) mandates three repeated
// blocks on every list page: page header (title + CTA), filter bar (paper
// strip with --shadow-1), and content (card list or table). Every loading.tsx
// previously re-transcribed those blocks by hand (~100+ lines each) — when the
// real chrome changed, ten skeletons could silently drift. These primitives
// own the chrome once; loading files compose them with page-specific interiors.
//
// Server-component-safe: no hooks, no Framer Motion — shimmer comes from the
// global `.skeleton` CSS class (left→right sheen since the logo-motion
// handoff; the opacity pulse is gone). Bespoke interiors (dashboard bento,
// whatsapp split-pane) stay bespoke — only the repeated blocks live here.

import React from 'react';

/** Logo-motion handoff shimmer stagger: 150ms per element, capped. */
export function skeletonStagger(index: number): number {
  return Math.min(index * 150, 600);
}

export interface ShimmerProps {
  /** Width — number = px, string passed through. */
  w?: number | string;
  /** Height — number = px, string passed through. */
  h?: number | string;
  /** Border radius token (default --radius-sm). */
  r?: string;
  /** animationDelay in ms. */
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Base shimmer block — the `.skeleton` pulse with sizing props. */
export function Shimmer({ w, h, r = 'var(--radius-sm)', delay, className, style }: ShimmerProps) {
  return (
    <div
      className={className ? `skeleton ${className}` : 'skeleton'}
      style={{
        ...(w !== undefined ? { width: typeof w === 'number' ? `${w}px` : w } : {}),
        ...(h !== undefined ? { height: typeof h === 'number' ? `${h}px` : h } : {}),
        borderRadius: r,
        ...(delay ? { animationDelay: `${delay}ms` } : {}),
        ...style,
      }}
    />
  );
}

export interface PageHeaderSkeletonProps {
  /** Width of the page-title block (default 80). */
  titleWidth?: number;
  /** Width of the top-right CTA block; omit for pages without a CTA. */
  actionWidth?: number;
}

/** Row 1 of the Standard Page Layout Contract — title left, optional CTA right.
 *  The spinning seed-mandala watermark was removed 2026-07-06 — it read as
 *  clutter behind the shimmer blocks. The brand mark now rests only on the
 *  empty-state (`ui/EmptyState.tsx` `brand`), never on loading skeletons. */
export function PageHeaderSkeleton({
  titleWidth = 80,
  actionWidth,
}: PageHeaderSkeletonProps) {
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            'var(--space-4)',
        marginBottom:   'var(--space-6)',
      }}
    >
      <Shimmer w={titleWidth} h={36} />
      {actionWidth !== undefined && <Shimmer w={actionWidth} h={36} style={{ flexShrink: 0 }} />}
    </div>
  );
}

export interface FilterBarSkeletonProps {
  /** Width of a leading tab-tray shimmer (a view switcher sharing the strip); omit for none. */
  leading?: number;
  /** Render the 16px sliders-icon placeholder (default false). */
  icon?: boolean;
  /** Search shimmer width; number = fixed px, 'flex' = grow (default 220). */
  searchWidth?: number | 'flex';
  /** Widths of the filter-chip shimmers, staggered 40ms apart. */
  chips?: number[];
  /** Width of the right-aligned count shimmer; omit to skip. */
  countWidth?: number;
  /** flexWrap: wrap (card-list pages) vs single row (default false). */
  wrap?: boolean;
  /** Custom content — replaces the default icon/search/chips/count row. */
  children?: React.ReactNode;
}

/** Row 2 of the contract — the `--theme-paper` filter strip with `--shadow-1`. */
export function FilterBarSkeleton({
  leading,
  icon = false,
  searchWidth = 220,
  chips = [],
  countWidth,
  wrap = false,
  children,
}: FilterBarSkeletonProps) {
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
        padding:      'var(--space-4) var(--space-5)',
        marginBottom: 'var(--space-4)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        ...(wrap ? { flexWrap: 'wrap' as const } : {}),
      }}
    >
      {children ?? (
        <>
          {leading !== undefined && <Shimmer w={leading} h={36} r="var(--radius-md)" style={{ flexShrink: 0 }} />}
          {icon && <Shimmer w={16} h={16} r="var(--radius-xs)" style={{ flexShrink: 0 }} />}
          {searchWidth === 'flex' ? (
            <Shimmer h={34} style={{ flex: '1 1 200px', minWidth: '160px' }} />
          ) : (
            <Shimmer w={searchWidth} h={36} style={{ flexShrink: 0 }} />
          )}
          {chips.map((w, i) => (
            <Shimmer key={i} w={w} h={36} r="var(--radius-md)" delay={i * 40} style={{ flexShrink: 0 }} />
          ))}
          {countWidth !== undefined && (
            <Shimmer w={countWidth} h={12} r="var(--radius-xs)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
          )}
        </>
      )}
    </div>
  );
}

export interface SkeletonCardProps {
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * The paper card chrome card-list skeletons repeat: `--radius-lg`, border,
 * `--shadow-1`, flex row with `--space-4` gap and `--space-4/5` padding.
 * Override layout via `style` (e.g. `padding: 0, display: 'block'` for grids).
 */
export function SkeletonCard({ style, children }: SkeletonCardProps) {
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
        flexWrap:     'wrap',
        padding:      'var(--space-4) var(--space-5)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow:    'var(--shadow-1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The rows of a conversation rail (ui/ConversationRailRow's shape: 40px avatar,
 *  title + time, one preview line, a hairline between rows). */
export function RailRowsSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => {
        const delay = skeletonStagger(i);
        return (
          <div
            key={i}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-3)',
              padding:      'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--theme-paper-border)',
            }}
          >
            <Shimmer w={40} h={40} r="var(--radius-md)" delay={delay} style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <Shimmer w="58%" h={12} r="var(--radius-xs)" delay={delay} />
                <Shimmer w={34} h={10} r="var(--radius-xs)" delay={delay} style={{ flexShrink: 0 }} />
              </div>
              <Shimmer w="40%" h={10} r="var(--radius-xs)" delay={delay} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** The empty-state hero's shape (ui/EmptyState: 64px tile, title, one line): a pane
 *  before anything is picked. */
export function EmptyStateSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)' }}>
      <Shimmer w={64} h={64} r="var(--radius-xl)" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Shimmer w={170} h={20} />
        <Shimmer w={230} h={12} r="var(--radius-xs)" />
      </div>
    </div>
  );
}
