// CampaignListSkeleton — 5 rows, staggered pulse per §11.4
// Rendered by <Suspense> fallback while CampaignListAsync streams.

export function CampaignListSkeleton() {
  const staggerDelays = [0, 80, 160, 240, 320];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {staggerDelays.map((delay, i) => (
        <div
          key={i}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-4)',
            padding:      'var(--space-4) var(--space-5)',
            background:   'var(--theme-paper)',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow:    'var(--shadow-1)',
          }}
        >
          {/* Left: name skeleton + domain pill skeleton */}
          <div style={{ flex: '0 0 auto', minWidth: '200px' }}>
            <div
              className="skeleton"
              style={{
                width:              '160px',
                height:             '14px',
                borderRadius:       'var(--radius-xs)',
                marginBottom:       'var(--space-2)',
                animationDelay:     `${delay}ms`,
              }}
            />
            <div
              className="skeleton"
              style={{
                width:          '80px',
                height:         '18px',
                borderRadius:   'var(--radius-full)',
                animationDelay: `${delay}ms`,
              }}
            />
          </div>

          {/* Right: metric pill skeletons */}
          <div
            style={{
              display:        'flex',
              gap:            'var(--space-2)',
              flex:           1,
              justifyContent: 'flex-end',
              alignItems:     'center',
            }}
          >
            {[52, 44, 60, 48, 44, 44, 40].map((w, j) => (
              <div
                key={j}
                className="skeleton"
                style={{
                  width:          `${w}px`,
                  height:         '22px',
                  borderRadius:   'var(--radius-full)',
                  animationDelay: `${delay}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
