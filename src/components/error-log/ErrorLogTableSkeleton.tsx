// Pulse: the canonical `.skeleton` class via <Shimmer> (serene-skeleton-pulse,
// design-tokens.css §11.1) — never a private keyframe (design audit M-10).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

export function ErrorLogTableSkeleton() {
  // Rule V-08: skeleton never shown for less than 150ms — enforced by the parent Suspense boundary.
  const rows     = Array.from({ length: 6 });
  const colWidths = ['7rem', '4rem', '9rem', '6rem', '7rem'];

  return (
    <div
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Filter bar skeleton */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        {['14rem', '8rem'].map((w, i) => (
          <Shimmer
            key={i}
            w={w}
            h="2.25rem"
            delay={skeletonStagger(i)}
            style={{ background: 'var(--theme-paper-border)' }}
          />
        ))}
      </div>

      {/* Header row */}
      <div
        style={{
          display:      'flex',
          gap:          'var(--space-4)',
          padding:      'var(--space-3) var(--space-4)',
          background:   'var(--theme-paper-subtle)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        {colWidths.map((w, i) => (
          <Shimmer
            key={i}
            w={w}
            h="0.625rem"
            r="var(--radius-full)"
            delay={skeletonStagger(i)}
            style={{ background: 'var(--theme-paper-border)' }}
          />
        ))}
      </div>

      {/* Data rows */}
      {rows.map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-4)',
            padding:      'var(--space-3) var(--space-4)',
            borderBottom: rowIdx < rows.length - 1
              ? '1px solid var(--theme-paper-border)'
              : 'none',
          }}
        >
          {[
            `${50 + (rowIdx % 3) * 10}%`,
            `${60 + (rowIdx % 4) * 8}%`,
            `${45 + (rowIdx % 5) * 7}%`,
            `${55 + (rowIdx % 3) * 9}%`,
            `${40 + (rowIdx % 4) * 6}%`,
          ].map((pct, colIdx) => (
            <Shimmer
              key={colIdx}
              w={colWidths[colIdx]}
              h="1rem"
              r="var(--radius-full)"
              delay={skeletonStagger(rowIdx)}
              style={{ maxWidth: pct }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
