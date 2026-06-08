// Skeleton — settings page.
// AgentSettingsTable renders: filter bar (paper strip) + card list (one card per agent).
// Each agent card is a flex row: avatar + name/domain | shift pickers | work-day pills | toggle.
// Mirrors the motion.div card shape with gap --space-4, padding --space-4 --space-5.

export default function SettingsLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Page header */}
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
          style={{ width: '100px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Filter bar — matches AgentSettingsTable filter strip */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-4)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          flexWrap:     'wrap',
        }}
      >
        {/* Sliders icon placeholder */}
        <div
          className="skeleton"
          style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-xs)', flexShrink: 0 }}
        />
        {/* Search bar */}
        <div
          className="skeleton"
          style={{ flex: '1 1 200px', height: '34px', borderRadius: 'var(--radius-sm)', minWidth: '160px' }}
        />
        {/* Pool filter chip */}
        <div
          className="skeleton"
          style={{ width: '80px', height: '34px', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
        />
        {/* Agent count */}
        <div
          className="skeleton"
          style={{ width: '56px', height: '12px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto', flexShrink: 0 }}
        />
      </div>

      {/* Agent card list — 5 cards matching motion.div card shape */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {[0, 80, 160, 240, 320].map((delay, i) => (
          <div
            key={i}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-4)',
              flexWrap:     'wrap',
              padding:      'var(--space-4) var(--space-5)',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    'var(--shadow-1)',
            }}
          >
            {/* Avatar + name/domain */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '1 1 200px', minWidth: 0 }}>
              <div
                className="skeleton"
                style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', flexShrink: 0, animationDelay: `${delay}ms` }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                <div
                  className="skeleton"
                  style={{ width: '120px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
                <div
                  className="skeleton"
                  style={{ width: '72px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              </div>
            </div>

            {/* Shift Start time picker */}
            <div
              className="skeleton"
              style={{ width: '110px', height: '34px', borderRadius: 'var(--radius-sm)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />

            {/* Shift End time picker */}
            <div
              className="skeleton"
              style={{ width: '110px', height: '34px', borderRadius: 'var(--radius-sm)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />

            {/* Active hours label */}
            <div
              className="skeleton"
              style={{ width: '48px', height: '13px', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />

            {/* Work-day pills (7 × 26px squares) */}
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
              {Array.from({ length: 7 }).map((_, d) => (
                <div
                  key={d}
                  className="skeleton"
                  style={{ width: '26px', height: '26px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>

            {/* In-Pool toggle */}
            <div
              className="skeleton"
              style={{ width: '40px', height: '22px', borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
