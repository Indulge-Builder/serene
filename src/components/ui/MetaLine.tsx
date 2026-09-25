// MetaLine — THE quiet provenance line (2026-09-25): where the numbers came from and
// how fresh they are ("Synced just now · History complete · …"). One optional health
// dot first, then short items joined by a middle dot, in tertiary text that wraps as
// whole items. Freshdesk's sync health and the Books "Read from Zoho" line compose
// it; a StatStrip footer is its usual home. Empty items are skipped.
//
// Server-component-safe: no hooks.

import { Fragment, type ReactNode } from 'react';

export type MetaLineTone = 'live' | 'warning' | 'danger';

const DOT: Record<MetaLineTone, string> = {
  live:    'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
};

export function MetaLine({ items, tone }: { items: (ReactNode | null | false | undefined)[]; tone?: MetaLineTone }) {
  const shown = items.filter((item) => item !== null && item !== false && item !== undefined && item !== '');
  return (
    <p
      style={{
        margin:     0,
        display:    'flex',
        flexWrap:   'wrap',
        alignItems: 'center',
        gap:        'var(--space-1) var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontSize:   'var(--text-xs)',
        lineHeight: 'var(--leading-normal)',
        color:      'var(--theme-text-tertiary)',
      }}
    >
      {tone && (
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: DOT[tone], flexShrink: 0 }}
        />
      )}
      {shown.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>{item}</span>
        </Fragment>
      ))}
    </p>
  );
}
