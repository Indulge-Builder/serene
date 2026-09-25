import type { CSSProperties } from 'react';

/** One raised material for date, range, and option filter triggers. `active` = a
 * value is applied: a pastel wash and accent ink, never an accent ring. The open
 * state needs no argument: CSS presses any trigger whose `aria-expanded` is true. */
export function filterTriggerStyle(active: boolean): CSSProperties {
  return {
    '--control-fill': active
      ? 'color-mix(in srgb, var(--theme-accent) 12%, var(--neu-surface))'
      : 'var(--neu-surface)',
    '--control-ink': active ? 'var(--neu-accent-deep)' : 'var(--theme-text-secondary)',
  } as CSSProperties;
}

/** Softly rounded pastel material for data tiles, independent of badge chrome. */
export function clayTileStyle(fill = 'var(--theme-accent-surface)'): CSSProperties {
  return {
    background: `linear-gradient(155deg, color-mix(in srgb, ${fill} 72%, var(--neu-surface-high)), ${fill})`,
    border: '1px solid var(--neu-edge)',
    borderRadius: 'var(--neu-radius-tile)',
    boxShadow: 'var(--neu-shadow-tile)',
  };
}

/** Selectable chips and compact choices share state, not arbitrary accent ink. */
export function choiceStyle(selected: boolean, tone?: { fill: string; ink: string }): CSSProperties {
  return {
    background: selected
      ? (tone?.fill ?? 'color-mix(in srgb, var(--theme-accent) 12%, var(--neu-surface))')
      : 'var(--neu-surface)',
    color: selected ? (tone?.ink ?? 'var(--neu-accent-deep)') : 'var(--theme-text-secondary)',
    border: '1px solid var(--neu-edge)',
    borderRadius: 'var(--neu-radius-control)',
    boxShadow: selected ? 'var(--neu-shadow-raised-sm)' : 'var(--neu-shadow-chip)',
    fontFamily: 'var(--font-sans)',
    fontWeight: selected ? 'var(--weight-semibold)' : 'var(--weight-medium)',
    transition: 'var(--transition-hover)',
  };
}

/** Options sit within a panel; only the selected row carries a pastel wash. */
export function optionStyle(selected: boolean): CSSProperties {
  return {
    background: selected ? 'color-mix(in srgb, var(--theme-accent) 12%, var(--neu-surface))' : 'transparent',
    color: selected ? 'var(--neu-accent-deep)' : 'var(--theme-text-primary)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'none',
    fontFamily: 'var(--font-sans)',
    fontWeight: selected ? 'var(--weight-medium)' : 'var(--weight-normal)',
    transition: 'var(--transition-hover)',
  };
}
