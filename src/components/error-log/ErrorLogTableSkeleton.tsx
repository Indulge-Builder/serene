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
        {[{ w: '14rem' }, { w: '8rem' }].map(({ w }, i) => (
          <div
            key={i}
            style={{
              width:        w,
              height:       '2.25rem',
              borderRadius: 'var(--radius-sm)',
              background:   'var(--theme-paper-border)',
              animation:    'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
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
          <div
            key={i}
            style={{
              width:        w,
              height:       '0.625rem',
              borderRadius: 'var(--radius-full)',
              background:   'var(--theme-paper-border)',
              animation:    'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
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
            <div
              key={colIdx}
              style={{
                width:        colWidths[colIdx],
                maxWidth:     pct,
                height:       '1rem',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-paper-subtle)',
                animation:    'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
          ))}
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
