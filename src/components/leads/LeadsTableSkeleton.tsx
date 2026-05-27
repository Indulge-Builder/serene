// Section 11.2: table skeleton — 50 rows matching pageSize to prevent layout jump
// during pagination (pre-mortem: skeleton shorter than content = layout jump).
// Section 11.3: header skeleton-lines at 20%/35%/20%/15%, h-2.5
//               rows same column structure, h-3 per cell, py-3 = 48px total

const ROWS = 50;
const COL_WIDTHS = ['4rem', '7rem', '7rem', '8rem', '5rem'];

// Section 11.4: stagger delays — 0/80/160/240/320ms, cap at 400ms
const STAGGER_DELAYS = [0, 80, 160, 240, 320];

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
          <div
            key={i}
            style={{
              width:          w,
              height:         '2.25rem',
              borderRadius:   'var(--radius-sm)',
              background:     'var(--theme-paper-border)',
              animationDelay: `${STAGGER_DELAYS[Math.min(i, STAGGER_DELAYS.length - 1)]}ms`,
              animation:      `skelPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) ${STAGGER_DELAYS[Math.min(i, STAGGER_DELAYS.length - 1)]}ms infinite`,
            }}
          />
        ))}
        {/* Column picker trigger skeleton */}
        <div
          style={{
            width:        '5.5rem',
            height:       '2.25rem',
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper-border)',
            marginLeft:   'var(--space-3)',
            animation:    'skelPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) 0ms infinite',
          }}
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
          <div
            key={i}
            style={{
              width:        w,
              maxWidth:     ['20%', '35%', '20%', '15%', '10%'][i],
              height:       '0.625rem',
              borderRadius: 'var(--radius-full)',
              background:   'var(--theme-paper-border)',
              animation:    `skelPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) ${STAGGER_DELAYS[Math.min(i, STAGGER_DELAYS.length - 1)]}ms infinite`,
            }}
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
            <div
              key={colIdx}
              style={{
                width:        COL_WIDTHS[colIdx],
                maxWidth:     fillW,
                height:       '0.75rem',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-paper-subtle)',
                // Section 11.4: row delay + col offset, capped at 400ms total
                animation:    `skelPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) ${Math.min(STAGGER_DELAYS[rowIdx] ?? 320, 400)}ms infinite`,
              }}
            />
          ))}
        </div>
      ))}

      <style>{`
        @keyframes skelPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
