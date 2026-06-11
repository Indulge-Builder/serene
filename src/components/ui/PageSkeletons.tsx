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
// global `.skeleton` CSS class. Bespoke interiors (dashboard bento, whatsapp
// split-pane) stay bespoke — only the repeated blocks live here.

import React from 'react';

/** §11.4 stagger: 0/80/160/240/320ms, capped. */
export function skeletonStagger(index: number): number {
  return Math.min(index * 80, 320);
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

/** Row 1 of the Standard Page Layout Contract — title left, optional CTA right. */
export function PageHeaderSkeleton({ titleWidth = 80, actionWidth }: PageHeaderSkeletonProps) {
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
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
