// Skeleton — tasks page chrome: header row + tab selector + content body.
// Defaults to the "personal" tab shape (calendar left + date-grouped list right)
// since that is the most common landing state for non-Gia users.
// Mirrors tasks/page.tsx: p-8, flex header, then TasksSkeleton-equivalent content.

export default function TasksLoading() {
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
          style={{ width: '72px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '100px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Tab selector + filters row */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   'var(--space-5)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {[80, 96].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: `${w}px`, height: '32px', borderRadius: 'var(--radius-full)' }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {[160, 80, 80].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: `${w}px`, height: '32px', borderRadius: 'var(--radius-md)' }}
            />
          ))}
        </div>
      </div>

      {/* Two-column body: calendar left + task list right */}
      <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        {/* Left: calendar */}
        <div
          style={{
            flexShrink: 0,
            width:      280,
            display:    'flex',
            flexDirection: 'column',
            gap:        'var(--space-3)',
          }}
        >
          {/* Calendar card */}
          <div
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    'var(--shadow-1)',
              padding:      'var(--space-4)',
              display:      'flex',
              flexDirection: 'column',
              gap:          'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: 'var(--radius-xs)' }} />
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)' }} />
                <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--space-1)' }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${i * 20}ms` }} />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, row) => (
              <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--space-1)' }}>
                {Array.from({ length: 7 }).map((_, col) => (
                  <div key={col} className="skeleton" style={{ height: '32px', borderRadius: 'var(--radius-xs)', animationDelay: `${(row * 7 + col) * 15}ms` }} />
                ))}
              </div>
            ))}
          </div>
          {/* Stats strip */}
          <div
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-1)',
              padding:      'var(--space-3) var(--space-4)',
              display:      'flex',
              flexDirection: 'column',
              gap:          'var(--space-2)',
            }}
          >
            {[0, 80, 160].map((delay, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div className="skeleton" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }} />
                <div className="skeleton" style={{ flex: 1, height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }} />
                <div className="skeleton" style={{ width: '20px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }} />
              </div>
            ))}
          </div>
          <div className="skeleton" style={{ height: '34px', borderRadius: 'var(--radius-md)' }} />
        </div>

        {/* Right: date-grouped task list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              overflow:     'hidden',
              boxShadow:    'var(--shadow-1)',
            }}
          >
            {[
              { delay: 0,   rows: 3 },
              { delay: 80,  rows: 2 },
              { delay: 160, rows: 2 },
            ].map((section, si) => (
              <div key={si} style={si > 0 ? { borderTop: '1px solid var(--theme-paper-border)' } : undefined}>
                {/* Section header */}
                <div
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          'var(--space-2)',
                    padding:      'var(--space-2) var(--space-4)',
                    background:   'var(--theme-paper-subtle)',
                    borderBottom: '1px solid var(--theme-paper-border)',
                  }}
                >
                  <div className="skeleton" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${section.delay}ms` }} />
                  <div className="skeleton" style={{ width: '80px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${section.delay}ms` }} />
                  <div className="skeleton" style={{ width: '20px', height: '16px', borderRadius: 'var(--radius-full)', marginLeft: 'auto', animationDelay: `${section.delay}ms` }} />
                </div>
                {/* Task rows */}
                {Array.from({ length: section.rows }).map((_, ri) => (
                  <div
                    key={ri}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          'var(--space-3)',
                      padding:      'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--theme-paper-border)',
                      background:   'var(--theme-paper)',
                    }}
                  >
                    <div className="skeleton" style={{ width: 'var(--space-6)', height: 'var(--space-6)', borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${section.delay + ri * 80}ms` }} />
                    <div className="skeleton" style={{ flex: 1, height: '14px', borderRadius: 'var(--radius-xs)', animationDelay: `${section.delay + ri * 80}ms` }} />
                    <div className="skeleton" style={{ width: '60px', height: '12px', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${section.delay + ri * 80}ms` }} />
                    <div className="skeleton" style={{ width: 'var(--space-6)', height: 'var(--space-6)', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${section.delay + ri * 80}ms` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
