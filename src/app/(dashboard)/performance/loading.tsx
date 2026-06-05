// Skeleton — performance page chrome.
// Renders the manager/founder variant (filter bar + two-column roster + detail panel)
// since that is the heaviest view and agents land on a client-driven shell anyway.
// Mirrors performance/page.tsx: flex-1 min-w-0 p-8, header, filter bar, then content.

export default function PerformanceLoading() {
  return (
    <main className="flex-1 min-w-0 p-8">
      {/* Page header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div
          className="skeleton"
          style={{ width: '180px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Filter bar strip */}
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
        {[88, 96, 100, 80].map((w, i) => (
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

      {/* Two-column: agent roster left + detail panel right */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
        {/* Left: agent roster */}
        <div
          style={{
            width:         '280px',
            flexShrink:    0,
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-2)',
            background:    'var(--theme-paper)',
            border:        '1px solid var(--theme-paper-border)',
            borderRadius:  'var(--radius-lg)',
            padding:       'var(--space-3)',
            boxShadow:     'var(--shadow-1)',
          }}
        >
          <div
            className="skeleton"
            style={{ width: '80px', height: '10px', borderRadius: 'var(--radius-xs)', marginBottom: 'var(--space-2)' }}
          />
          {[0, 80, 160, 240].map((delay, i) => (
            <div
              key={i}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          'var(--space-3)',
                padding:      'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background:   'var(--theme-paper)',
                border:       '1px solid var(--theme-paper-border)',
              }}
            >
              <div
                className="skeleton"
                style={{
                  width:          '44px',
                  height:         '44px',
                  borderRadius:   'var(--radius-md)',
                  flexShrink:     0,
                  animationDelay: `${delay}ms`,
                }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  className="skeleton"
                  style={{ width: '120px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
                <div
                  className="skeleton"
                  style={{ width: '64px', height: '11px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Right: detail panel placeholder */}
        <div
          style={{
            flex:           1,
            minWidth:       0,
            minHeight:      'min(320px, 40vh)',
            borderRadius:   'var(--radius-lg)',
            border:         '1px solid var(--theme-paper-border)',
            background:     'var(--theme-paper-subtle)',
            boxShadow:      'var(--shadow-1)',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            'var(--space-4)',
            padding:        'var(--space-8)',
          }}
        >
          <div
            className="skeleton"
            style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xl)' }}
          />
          <div
            className="skeleton"
            style={{ width: '160px', height: '22px', borderRadius: 'var(--radius-xs)' }}
          />
          <div
            className="skeleton"
            style={{ width: '220px', height: '14px', borderRadius: 'var(--radius-xs)' }}
          />
        </div>
      </div>
    </main>
  );
}
