// Skeleton — settings page chrome.
// Mirrors settings/page.tsx: p-8, header row, filter bar strip, then agent roster table.
// Table rows: avatar + name/domain + shift pickers + toggle columns.
// 6 agent row skeletons with stagger per §11.4.

export default function SettingsLoading() {
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
          style={{ width: '100px', height: '36px', borderRadius: 'var(--radius-sm)' }}
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
        {[96, 120].map((w, i) => (
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
        <div
          className="skeleton"
          style={{ width: '60px', height: '10px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto', flexShrink: 0 }}
        />
      </div>

      {/* Row 3 — Agent table */}
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
            display:      'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 60px 40px',
            gap:          'var(--space-4)',
            alignItems:   'center',
            padding:      'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--theme-paper-border)',
            background:   'var(--theme-paper-subtle)',
          }}
        >
          {['Agent', 'Shift Start', 'Shift End', 'Active Hrs', 'Work Days', 'In Pool', ''].map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: '10px', borderRadius: 'var(--radius-xs)', width: i === 6 ? '0' : undefined }}
            />
          ))}
        </div>

        {/* Agent rows */}
        {[0, 80, 160, 240, 320, 320].map((delay, i) => (
          <div
            key={i}
            style={{
              display:      'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 60px 40px',
              gap:          'var(--space-4)',
              alignItems:   'center',
              padding:      'var(--space-4) var(--space-5)',
              borderBottom: i < 5 ? '1px solid var(--theme-paper-border)' : 'none',
            }}
          >
            {/* Agent cell: avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                className="skeleton"
                style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', flexShrink: 0, animationDelay: `${delay}ms` }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <div
                  className="skeleton"
                  style={{ width: '110px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
                <div
                  className="skeleton"
                  style={{ width: '72px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              </div>
            </div>
            {/* Shift Start */}
            <div
              className="skeleton"
              style={{ height: '36px', borderRadius: 'var(--radius-sm)', animationDelay: `${delay}ms` }}
            />
            {/* Shift End */}
            <div
              className="skeleton"
              style={{ height: '36px', borderRadius: 'var(--radius-sm)', animationDelay: `${delay}ms` }}
            />
            {/* Active Hours */}
            <div
              className="skeleton"
              style={{ width: '48px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
            />
            {/* Work Days pills */}
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {Array.from({ length: 7 }).map((_, d) => (
                <div
                  key={d}
                  className="skeleton"
                  style={{ width: '26px', height: '26px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            {/* Toggle */}
            <div
              className="skeleton"
              style={{ width: '40px', height: '22px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
            />
            {/* Clear button */}
            <div
              className="skeleton"
              style={{ width: '24px', height: '24px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
