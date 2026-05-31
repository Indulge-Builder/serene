// Skeleton for the Deals page — 4 stat chips + 5 card rows
// Stagger: 0 / 80 / 160 / 240 / 320ms (§11.4)

export function DealsSkeleton() {
  return (
    <>
      {/* Summary strip skeleton */}
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
              style={{ width: '80px', height: '28px', borderRadius: 'var(--radius-sm)' }}
            />
            <div
              className="skeleton"
              style={{ width: '60px', height: '10px', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
        ))}
      </div>

      {/* Deal card skeletons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height:       '80px',
              borderRadius: 'var(--radius-md)',
              animationDelay: `${Math.min(i * 80, 320)}ms`,
            }}
          />
        ))}
      </div>
    </>
  );
}
