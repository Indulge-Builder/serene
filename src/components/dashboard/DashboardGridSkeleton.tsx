// THE dashboard bento-grid skeleton — two half-width widgets + two full-width
// ones, mirroring GRID_CSS in DashboardCanvas (12-column grid, gap --space-4).
// Composed by BOTH dashboard/loading.tsx (the route skeleton, header included)
// and DashboardCanvas's own Suspense fallback (header already painted, only the
// grid pending) so the two loading moments are one implementation (R-01).
// Pulse = the canonical `.skeleton` class (design-tokens.css §11.1).

export function DashboardGridSkeleton() {
  return (
    <>
      <style>{`
        .serene-loading-bento {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: var(--space-4);
          width: 100%;
          align-items: start;
        }
        .serene-loading-cell-1 { grid-column: span 6; }
        .serene-loading-cell-2 { grid-column: span 12; }
        @media (max-width: 767.98px) { /* < --bp-md — mirrors DashboardCanvas GRID_CSS */
          .serene-loading-cell-1,
          .serene-loading-cell-2 { grid-column: span 12; }
        }
      `}</style>

      <div className="serene-loading-bento">
        {/* Widget 1 — half-width (md size) */}
        <div
          className="skeleton serene-loading-cell-1"
          style={{ height: '220px', borderRadius: 'var(--radius-lg)' }}
        />

        {/* Widget 2 — half-width (md size) */}
        <div
          className="skeleton serene-loading-cell-1"
          style={{ height: '220px', borderRadius: 'var(--radius-lg)', animationDelay: '80ms' }}
        />

        {/* Widget 3 — full-width (lg size) */}
        <div
          className="skeleton serene-loading-cell-2"
          style={{ height: '280px', borderRadius: 'var(--radius-lg)', animationDelay: '160ms' }}
        />

        {/* Widget 4 — full-width (xl size — campaign chart) */}
        <div
          className="skeleton serene-loading-cell-2"
          style={{ height: '320px', borderRadius: 'var(--radius-lg)', animationDelay: '240ms' }}
        />
      </div>
    </>
  );
}
