// Skeleton — admin/ad-creatives page chrome.
// Mirrors the AdCreativesManager: p-8, manager-internal header (title + "Upload Video" button
// + search bar), then a grid of ad creative cards.
// 6 card skeletons in a responsive 3-column grid.

export default function AdCreativesLoading() {
  return (
    <main className="flex-1 p-8">
      {/* AdCreativesManager owns its own header inside the client component.
          Match: title skeleton + upload button skeleton + search bar skeleton. */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
          marginBottom:   'var(--space-5)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            className="skeleton"
            style={{ width: '160px', height: '28px', borderRadius: 'var(--radius-sm)' }}
          />
          <div
            className="skeleton"
            style={{ width: '100px', height: '12px', borderRadius: 'var(--radius-xs)' }}
          />
        </div>
        <div
          className="skeleton"
          style={{ width: '130px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
      </div>

      {/* Filter / search strip */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          className="skeleton"
          style={{ width: '240px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '60px', height: '12px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto' }}
        />
      </div>

      {/* Ad creative card grid — 3 columns */}
      <style>{`
        .eia-ac-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-4);
        }
        @media (max-width: 900px) {
          .eia-ac-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .eia-ac-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="eia-ac-grid">
        {[0, 80, 160, 160, 240, 320].map((delay, i) => (
          <div
            key={i}
            style={{
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    'var(--shadow-1)',
              overflow:     'hidden',
            }}
          >
            {/* Video thumbnail placeholder — 9:16 aspect */}
            <div
              className="skeleton"
              style={{
                width:          '100%',
                aspectRatio:    '16 / 9',
                borderRadius:   0,
                animationDelay: `${delay}ms`,
              }}
            />
            {/* Card body */}
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div
                className="skeleton"
                style={{ width: '140px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
              />
              <div
                className="skeleton"
                style={{ width: '88px', height: '20px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
              />
              {/* Action buttons row */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                <div
                  className="skeleton"
                  style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', animationDelay: `${delay}ms` }}
                />
                <div
                  className="skeleton"
                  style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', animationDelay: `${delay}ms` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
