// Skeleton — campaigns page chrome.
// Mirrors campaigns/page.tsx: p-8, header row, filter bar, then CampaignListSkeleton shape.
// 5 campaign card rows with stagger per §11.4.

export default function CampaignsLoading() {
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
          style={{ width: '120px', height: '36px', borderRadius: 'var(--radius-sm)' }}
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
          style={{ width: '200px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        {[88, 100, 80].map((w, i) => (
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

      {/* Row 3 — Campaign card list (5 rows, §11.4 stagger) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[0, 80, 160, 240, 320].map((delay, i) => (
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
            {/* Left: name + domain pill */}
            <div style={{ flex: '0 0 auto', minWidth: '200px' }}>
              <div
                className="skeleton"
                style={{ width: '160px', height: '14px', borderRadius: 'var(--radius-xs)', marginBottom: 'var(--space-2)', animationDelay: `${delay}ms` }}
              />
              <div
                className="skeleton"
                style={{ width: '80px', height: '18px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
              />
            </div>

            {/* Right: metric pill skeletons */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
              {[52, 44, 60, 48, 44, 44, 40].map((w, j) => (
                <div
                  key={j}
                  className="skeleton"
                  style={{ width: `${w}px`, height: '22px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
