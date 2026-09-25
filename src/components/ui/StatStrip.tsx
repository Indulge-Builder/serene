// StatStrip — THE strip card of StatTile cells (2026-09-25): one paper card holding
// a row of `<StatTile variant="cell">` children that wraps on narrow widths. Budget's
// totals compose it plain; a breakdown (Freshdesk by status, Books aging) adds a
// `title`, `divided` hairlines between its compact cells, and a `footer` line for
// provenance (compose ui/MetaLine there). Never float a loose row of label: value
// pairs under the tiles again; put them in a strip.
//
// Server-component-safe: no hooks.

import type { ReactNode } from 'react';

export function StatStrip({
  title,
  aside,
  footer,
  divided = false,
  children,
}: {
  /** Micro label above the cells. */
  title?: string;
  /** Short context on the right of the title (a total, a unit). */
  aside?: ReactNode;
  /** A quiet line below the cells, on the section surface. */
  footer?: ReactNode;
  /** Hairlines between the cells (breakdowns). */
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="serene-stat-strip"
      data-divided={divided ? 'true' : undefined}
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      {(title || aside) && (
        <div
          style={{
            display:        'flex',
            alignItems:     'baseline',
            justifyContent: 'space-between',
            gap:            'var(--space-3)',
            padding:        'var(--space-4) var(--space-5) var(--space-1)',
          }}
        >
          {title && <span className="label-micro">{title}</span>}
          {aside && (
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
              {aside}
            </span>
          )}
        </div>
      )}
      <div className="serene-stat-strip-cells" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {children}
      </div>
      {footer && (
        <div
          style={{
            borderTop:  '1px solid var(--theme-paper-border)',
            background: 'var(--neu-section-bg)',
            padding:    'var(--space-3) var(--space-5)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
