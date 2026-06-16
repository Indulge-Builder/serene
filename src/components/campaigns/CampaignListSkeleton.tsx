// CampaignListSkeleton — 5 rows, staggered pulse per §11.4
// Rendered by <Suspense> fallback while CampaignListAsync streams.
// Mirrors the three-row CampaignCard shape (identity · hero stats · status breakdown)
// so the swap from skeleton to card is a settle, not a relayout jolt.

export function CampaignListSkeleton() {
  const staggerDelays = [0, 80, 160, 240, 320];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {staggerDelays.map((delay, i) => (
        <div
          key={i}
          style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-4)',
            padding:       'var(--space-5)',
            background:    'var(--theme-paper)',
            border:        '1px solid var(--theme-paper-border)',
            borderRadius:  'var(--radius-lg)',
            boxShadow:     'var(--shadow-1)',
          }}
        >
          {/* Row 1 — name + domain pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              className="skeleton"
              style={{
                flex:           '1 1 auto',
                maxWidth:       '220px',
                height:         '16px',
                borderRadius:   'var(--radius-xs)',
                animationDelay: `${delay}ms`,
              }}
            />
            <div
              className="skeleton"
              style={{
                width:          '64px',
                height:         '18px',
                borderRadius:   'var(--radius-full)',
                animationDelay: `${delay}ms`,
              }}
            />
          </div>

          {/* Row 2 — hero stat columns (label over value) */}
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            {[64, 56, 60, 68].map((w, j) => (
              <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div
                  className="skeleton"
                  style={{
                    width:          `${Math.round(w * 0.7)}px`,
                    height:         '9px',
                    borderRadius:   'var(--radius-xs)',
                    animationDelay: `${delay}ms`,
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width:          `${w}px`,
                    height:         '18px',
                    borderRadius:   'var(--radius-xs)',
                    animationDelay: `${delay}ms`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--theme-paper-border)' }} />

          {/* Row 3 — status breakdown chips */}
          <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
            {[78, 96, 80, 70, 66, 62].map((w, j) => (
              <div
                key={j}
                className="skeleton"
                style={{
                  width:          `${w}px`,
                  height:         '14px',
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
