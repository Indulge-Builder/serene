// CampaignMetricsStripSkeleton — 6 stat card skeletons per §11.3
// Staggered pulse 0→320ms per §11.4

export function CampaignMetricsStripSkeleton() {
  const staggerDelays = [0, 80, 160, 240, 320, 320];

  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap:                 'var(--space-3)',
        }}
        className="md:grid-cols-3 lg:grid-cols-6"
      >
        {staggerDelays.map((delay, i) => (
          <div
            key={i}
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-1)',
              padding:      'var(--space-4)',
            }}
          >
            {/* Label skeleton */}
            <div
              className="skeleton"
              style={{
                width:          '6rem',
                height:         '10px',
                borderRadius:   'var(--radius-xs)',
                marginBottom:   'var(--space-3)',
                animationDelay: `${delay}ms`,
              }}
            />
            {/* Value skeleton */}
            <div
              className="skeleton"
              style={{
                width:          '4rem',
                height:         '28px',
                borderRadius:   'var(--radius-xs)',
                marginBottom:   'var(--space-2)',
                animationDelay: `${delay}ms`,
              }}
            />
            {/* Sub-label skeleton */}
            <div
              className="skeleton"
              style={{
                width:          '8rem',
                height:         '8px',
                borderRadius:   'var(--radius-xs)',
                animationDelay: `${delay}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
