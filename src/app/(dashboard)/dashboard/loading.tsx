// Skeleton — bento grid outline matching the dashboard canvas layout.
// Two col-span-1 widgets (half-width) + one col-span-2 widget (full-width).
// Mirrors GRID_CSS in DashboardCanvas: 12-column grid, gap --space-4.

export default function DashboardLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Header row: greeting skeleton + date filter skeleton */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   'var(--space-6)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            className="skeleton"
            style={{ width: '200px', height: '28px', borderRadius: 'var(--radius-sm)' }}
          />
          <div
            className="skeleton"
            style={{ width: '140px', height: '14px', borderRadius: 'var(--radius-xs)' }}
          />
        </div>
        <div
          className="skeleton"
          style={{ width: '240px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Bento grid — matches DashboardCanvas GRID_CSS */}
      <style>{`
        .eia-loading-bento {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: var(--space-4);
          width: 100%;
          align-items: start;
        }
        .eia-loading-cell-1 { grid-column: span 6; }
        .eia-loading-cell-2 { grid-column: span 12; }
        @media (max-width: 820px) {
          .eia-loading-cell-1,
          .eia-loading-cell-2 { grid-column: span 12; }
        }
      `}</style>

      <div className="eia-loading-bento">
        {/* Widget 1 — half-width (md size) */}
        <div
          className="skeleton eia-loading-cell-1"
          style={{
            height:       '220px',
            borderRadius: 'var(--radius-lg)',
          }}
        />

        {/* Widget 2 — half-width (md size) */}
        <div
          className="skeleton eia-loading-cell-1"
          style={{
            height:         '220px',
            borderRadius:   'var(--radius-lg)',
            animationDelay: '80ms',
          }}
        />

        {/* Widget 3 — full-width (lg size) */}
        <div
          className="skeleton eia-loading-cell-2"
          style={{
            height:         '280px',
            borderRadius:   'var(--radius-lg)',
            animationDelay: '160ms',
          }}
        />

        {/* Widget 4 — full-width (xl size — campaign chart) */}
        <div
          className="skeleton eia-loading-cell-2"
          style={{
            height:         '320px',
            borderRadius:   'var(--radius-lg)',
            animationDelay: '240ms',
          }}
        />
      </div>
    </main>
  );
}
