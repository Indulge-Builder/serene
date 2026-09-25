import { clayTileStyle } from './material-styles';

// StatTile — THE labelled stat tile (dry-audit L-8). Server-component-safe; the value
// renders as plain text (the count-up animation was removed 2026-09-15: on money tiles
// the digits rolling in read as noise, and a number should be readable the instant it
// paints). Big money goes through formatCurrencyCompact (₹28.1L, ₹1.2Cr), never the
// long form — the long form belongs in tables.
//
// Two variants cover the two existing anatomies:
//   'card' — paper card chrome, micro label on top, 2xl semibold mono value,
//            optional coloured sub-line (campaign metrics strip).
//   'cell' — bare centred cell for composition inside one shared strip card
//            (ui/StatStrip): 2xl mono accent value on top, micro label below
//            (budget + deals totals). size="sm" is the breakdown cell (2026-09-25:
//            Freshdesk status mix, Books aging): lg mono value in primary ink, an
//            optional status dot before the label, an optional sub line.
// Both values render in --font-mono + tabular-nums (number-font rule).
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
  size = 'lg',
  dot,
}: {
  label:    string;
  value:    string;
  sub?:     StatTileSub;
  variant?: 'card' | 'cell';
  /** Cell only: 'lg' = the headline total (default); 'sm' = a breakdown cell. */
  size?:    'lg' | 'sm';
  /** Cell only: a status colour (a CSS var) for a small dot before the label. */
  dot?:     string;
}) {
  if (variant === 'cell') {
    const compact = size === 'sm';
    return (
      <div
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          flex:           1,
          padding:        compact ? 'var(--space-3) var(--space-4)' : 'var(--space-4) var(--space-5)',
          minWidth:       compact ? '112px' : '120px',
        }}
      >
        <span
          style={{
            // Mono for numbers (number-font rule); accent-deep is the text-safe accent.
            fontFamily:         'var(--font-mono)',
            fontSize:           compact ? 'var(--text-lg)' : 'var(--text-2xl)',
            fontWeight:         compact ? 'var(--weight-medium)' : 'var(--weight-semibold)',
            fontVariantNumeric: 'tabular-nums',
            color:              compact ? 'var(--theme-text-primary)' : 'var(--neu-accent-deep)',
            lineHeight:         1.1,
            marginBottom:       'var(--space-1)',
            whiteSpace:         'nowrap',
          }}
        >
          {value}
        </span>
        <span
          // Headline cells keep the micro label; a breakdown cell's label is a
          // sentence-case legend that stays on one line (a status or a bucket name
          // in widest-tracked capitals wrapped and cut its dot loose).
          className={compact ? undefined : 'label-micro'}
          style={{
            color:      compact ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)',
            textAlign:  'center',
            display:    'inline-flex',
            alignItems: 'center',
            gap:        'var(--space-1)',
            ...(compact
              ? { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', whiteSpace: 'nowrap' as const }
              : {}),
          }}
        >
          {dot && (
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: dot, flexShrink: 0 }}
            />
          )}
          {label}
        </span>
        {sub && (
          <span
            style={{
              marginTop:  'var(--space-1)',
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color:      sub.color,
              lineHeight: 'var(--leading-none)',
            }}
          >
            {sub.text}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        ...clayTileStyle(),
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
          // Mono for numbers (number-font rule).
          fontFamily:  'var(--font-mono)',
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
