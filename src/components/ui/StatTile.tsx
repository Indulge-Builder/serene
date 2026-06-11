// StatTile — THE labelled stat tile (dry-audit L-8). Server-component-safe.
//
// Two variants cover the two existing anatomies:
//   'card' — paper card chrome, micro label on top, 2xl semibold sans value,
//            optional coloured sub-line (campaign metrics strip).
//   'cell' — bare centred cell for composition inside one shared strip card:
//            2xl mono accent value on top, micro label below (deals summary).
//
// MetricCard (performance/CoreFourGrid) deliberately stays bespoke — its
// delta/sparkline/motion decoration is its own thing (per the audit: "do not
// force-merge MetricCard's delta logic"). Any NEW plain stat tile composes
// this component instead of forking a fourth expression.

export type StatTileSub = {
  text:  string;
  color: string;
};

export function StatTile({
  label,
  value,
  sub,
  variant = 'card',
}: {
  label:    string;
  value:    string;
  sub?:     StatTileSub;
  variant?: 'card' | 'cell';
}) {
  if (variant === 'cell') {
    return (
      <div
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          flex:           1,
          padding:        'var(--space-4) var(--space-5)',
          minWidth:       '120px',
        }}
      >
        <span
          style={{
            fontFamily:         'var(--font-mono)',
            fontSize:           'var(--text-2xl)',
            fontWeight:         'var(--weight-normal)',
            fontVariantNumeric: 'tabular-nums',
            color:              'var(--theme-accent)',
            lineHeight:         1.1,
            marginBottom:       'var(--space-1)',
            whiteSpace:         'nowrap',
          }}
        >
          {value}
        </span>
        <span
          className="label-micro"
          style={{
            color:     'var(--theme-text-tertiary)',
            textAlign: 'center',
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-4)',
      }}
    >
      <p
        className="label-micro"
        style={{ marginBottom: 'var(--space-3)' }}
      >
        {label}
      </p>

      <p
        style={{
          fontFamily:  'var(--font-sans)',
          fontSize:    'var(--text-2xl)',
          fontWeight:  'var(--weight-semibold)',
          color:       'var(--theme-text-primary)',
          margin:      sub ? '0 0 var(--space-1)' : '0',
          lineHeight:  'var(--leading-none)',
        }}
      >
        {value}
      </p>

      {sub && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            fontWeight: 'var(--weight-medium)',
            color:      sub.color,
            margin:     0,
            lineHeight: 'var(--leading-none)',
          }}
        >
          {sub.text}
        </p>
      )}
    </div>
  );
}
