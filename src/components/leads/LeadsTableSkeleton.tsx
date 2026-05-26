export function LeadsTableSkeleton() {
  // Skeleton never shows for less than 150ms (Rule V-08) — enforced by
  // the parent Suspense boundary which only mounts this after the waterfall.
  const rows = Array.from({ length: 8 });
  const colWidths = ['4rem', '7rem', '7rem', '8rem', '5rem', '7rem', '2rem'];

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
        <div
          style={{
            width:        '14rem',
            height:       '2.25rem',
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper-border)',
            animation:    'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
        <div
          style={{
            width:        '8rem',
            height:       '2.25rem',
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper-border)',
            animation:    'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
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
            `${40 + (rowIdx % 3) * 10}%`,
            `${55 + (rowIdx % 4) * 8}%`,
            `${45 + (rowIdx % 5) * 7}%`,
            `${60 + (rowIdx % 3) * 9}%`,
            `${50 + (rowIdx % 4) * 6}%`,
            `${65 + (rowIdx % 3) * 5}%`,
            '1rem',
          ].map((w, colIdx) => (
            <div
              key={colIdx}
              style={{
                width:        colWidths[colIdx],
                maxWidth:     w,
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
