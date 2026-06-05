// Skeleton — deals page chrome: header + filter bar + summary strip + deal card rows.
// Mirrors deals/page.tsx: p-8, header row, filter bar, then DealsSkeleton shape.

export default function DealsLoading() {
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
          style={{ width: '72px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '110px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Row 2 — Filter bar */}
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
        <div
          className="skeleton"
          style={{ width: '220px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        {[88, 96, 80].map((w, i) => (
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

      {/* Row 3 — Summary strip (4 stat chips) */}
      <div
        style={{
          display:      'flex',
          alignItems:   'stretch',
          marginBottom: 'var(--space-4)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
          height:       '80px',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            'var(--space-2)',
              padding:        'var(--space-4)',
              borderRight:    i < 3 ? '1px solid var(--theme-paper-border)' : 'none',
            }}
          >
            <div
              className="skeleton"
              style={{ width: '80px', height: '28px', borderRadius: 'var(--radius-sm)', animationDelay: `${i * 40}ms` }}
            />
            <div
              className="skeleton"
              style={{ width: '60px', height: '10px', borderRadius: 'var(--radius-sm)', animationDelay: `${i * 40}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Row 4 — Deal card rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height:         '80px',
              borderRadius:   'var(--radius-md)',
              animationDelay: `${Math.min(i * 80, 320)}ms`,
            }}
          />
        ))}
      </div>
    </main>
  );
}
