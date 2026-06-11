// Section 11.2: table skeleton — 50 rows matching pageSize to prevent layout jump
// during pagination (pre-mortem: skeleton shorter than content = layout jump).
// Section 11.3: header skeleton-lines at 20%/35%/20%/15%, h-2.5
//               rows same column structure, h-3 per cell, py-3 = 48px total
// Pulse: the canonical `.skeleton` class via <Shimmer> (eia-skeleton-pulse,
// design-tokens.css §11.1) — never a private keyframe (design audit M-10).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

const ROWS = 50;
const COL_WIDTHS = ['4rem', '7rem', '7rem', '8rem', '5rem'];

export function LeadsTableSkeleton() {
  return (
    <div
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Filter bar skeleton — mirrors the real LeadsFilters bar */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
          flexWrap:     'wrap',
        }}
      >
        {['6rem', '5.5rem', '5rem', '5rem', '5rem', '10rem'].map((w, i) => (
          <Shimmer
            key={i}
            w={w}
            h="2.25rem"
            delay={skeletonStagger(i)}
            style={{ background: 'var(--theme-paper-border)' }}
          />
        ))}
        {/* Column picker trigger skeleton */}
        <Shimmer
          w="5.5rem"
          h="2.25rem"
          style={{ background: 'var(--theme-paper-border)', marginLeft: 'var(--space-3)' }}
        />
      </div>

      {/* Header row — Section 11.3: 20%/35%/20%/15%/10% widths, h-2.5 */}
      <div
        style={{
          display:      'flex',
          gap:          'var(--space-4)',
          padding:      'var(--space-3) var(--space-4)',
          background:   'var(--theme-paper-subtle)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        {COL_WIDTHS.map((w, i) => (
          <Shimmer
            key={i}
            w={w}
            h="0.625rem"
            r="var(--radius-full)"
            delay={skeletonStagger(i)}
            style={{ maxWidth: ['20%', '35%', '20%', '15%', '10%'][i], background: 'var(--theme-paper-border)' }}
          />
        ))}
      </div>

      {/* Data rows — Section 11.3: py-3 = 48px total, h-3 cells */}
      {Array.from({ length: ROWS }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-4)',
            padding:      'var(--space-3) var(--space-4)',
            borderBottom: rowIdx < ROWS - 1 ? '1px solid var(--theme-paper-border)' : 'none',
          }}
        >
          {[
            `${40 + (rowIdx % 3) * 10}%`,
            `${55 + (rowIdx % 4) * 8}%`,
            `${45 + (rowIdx % 5) * 7}%`,
            `${60 + (rowIdx % 3) * 9}%`,
            `${50 + (rowIdx % 4) * 6}%`,
          ].map((fillW, colIdx) => (
            <Shimmer
              key={colIdx}
              w={COL_WIDTHS[colIdx]}
              h="0.75rem"
              r="var(--radius-full)"
              delay={skeletonStagger(rowIdx)}
              style={{ maxWidth: fillW }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
