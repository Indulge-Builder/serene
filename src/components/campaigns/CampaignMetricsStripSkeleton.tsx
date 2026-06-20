// CampaignMetricsStripSkeleton — 8 stat card skeletons per §11.3
// (6 pipeline + Amount Spent + Cost/Lead — mirrors CampaignMetricsStrip)
// Staggered pulse 0→320ms per §11.4

export function CampaignMetricsStripSkeleton() {
  const staggerDelays = [0, 80, 160, 240, 320, 320, 320, 320];

  return (
    <div>
      {/* Column count lives in classes only — inline grid-template-columns
          would override the responsive variants (mirrors CampaignMetricsStrip:
          single column below sm, 2×4 from sm up — it sits in the right column). */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 'var(--space-3)' }}
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
