export function LeadTasksCardSkeleton() {
  return (
    <div
      style={{ flexShrink: 0 }}
    >
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      'var(--space-4) var(--space-6)',
          background:   'var(--theme-paper-subtle)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        <div className="skeleton" style={{ width: 120, height: 10, borderRadius: 'var(--radius-sm)' }} />
      </div>

      {/* Body — two task rows */}
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 'min(220px, 28vh)' }}>
        {/* Row 1 — 80% width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
          <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 'var(--radius-sm)' }} />
        </div>
        {/* Row 2 — 60% width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
          <div className="skeleton" style={{ width: '60%', height: 14, borderRadius: 'var(--radius-sm)' }} />
        </div>
      </div>
    </div>
    </div>
  );
}
