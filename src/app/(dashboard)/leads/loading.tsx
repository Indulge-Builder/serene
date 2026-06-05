// Skeleton — filter bar strip + table rows.
// Mirrors leads/page.tsx: p-8, header row, filter bar, then table.
// 8 table row skeletons at table row height (stagger §11.4).

export default function LeadsLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Row 1 — Page header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
          marginBottom:   'var(--space-6)',
        }}
      >
        <div
          className="skeleton"
          style={{ width: '80px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '110px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Row 2 — Filter bar strip */}
      <div
        style={{
          padding:      'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          border:       '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper)',
          boxShadow:    'var(--shadow-1)',
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
        }}
      >
        {/* Search bar */}
        <div
          className="skeleton"
          style={{ width: '220px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        {/* Filter chips */}
        {[80, 96, 88, 100].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              width:          `${w}px`,
              height:         '36px',
              borderRadius:   'var(--radius-md)',
              flexShrink:     0,
              animationDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>

      {/* Row 3 — Table */}
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           'var(--space-4)',
            padding:       'var(--space-3) var(--space-5)',
            borderBottom:  '1px solid var(--theme-paper-border)',
            background:    'var(--theme-paper-subtle)',
          }}
        >
          {[120, 80, 100, 80, 96, 80].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                width:  `${w}px`,
                height: '10px',
                borderRadius: 'var(--radius-xs)',
                flex:   i === 0 ? '1' : undefined,
              }}
            />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-4)',
              padding:      'var(--space-4) var(--space-5)',
              borderBottom: i < 7 ? '1px solid var(--theme-paper-border)' : 'none',
            }}
          >
            {/* Status pill */}
            <div
              className="skeleton"
              style={{
                width:          '72px',
                height:         '22px',
                borderRadius:   'var(--radius-full)',
                flexShrink:     0,
                animationDelay: `${Math.min(i * 80, 320)}ms`,
              }}
            />
            {/* Name */}
            <div
              className="skeleton"
              style={{
                flex:           1,
                height:         '14px',
                borderRadius:   'var(--radius-xs)',
                animationDelay: `${Math.min(i * 80, 320)}ms`,
              }}
            />
            {/* Phone */}
            <div
              className="skeleton"
              style={{
                width:          '110px',
                height:         '14px',
                borderRadius:   'var(--radius-xs)',
                flexShrink:     0,
                animationDelay: `${Math.min(i * 80, 320)}ms`,
              }}
            />
            {/* Campaign */}
            <div
              className="skeleton"
              style={{
                width:          '90px',
                height:         '14px',
                borderRadius:   'var(--radius-xs)',
                flexShrink:     0,
                animationDelay: `${Math.min(i * 80, 320)}ms`,
              }}
            />
            {/* Date */}
            <div
              className="skeleton"
              style={{
                width:          '70px',
                height:         '12px',
                borderRadius:   'var(--radius-xs)',
                flexShrink:     0,
                animationDelay: `${Math.min(i * 80, 320)}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
