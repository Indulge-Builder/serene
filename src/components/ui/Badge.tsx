import type { ComponentPropsWithoutRef, CSSProperties } from 'react';

export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Shared fill/ink pairs: status colours do not change meaning with the theme. */
export const semanticTones: Record<SemanticTone, { fill: string; ink: string }> = {
  neutral: { fill: 'var(--neu-chip-neutral-bg)', ink: 'var(--neu-chip-neutral-fg)' },
  info: { fill: 'var(--neu-chip-powder-bg)', ink: 'var(--neu-chip-powder-fg)' },
  success: { fill: 'var(--neu-chip-sage-bg)', ink: 'var(--neu-chip-sage-fg)' },
  warning: { fill: 'var(--neu-chip-butter-bg)', ink: 'var(--neu-chip-butter-fg)' },
  danger: { fill: 'var(--neu-chip-rose-bg)', ink: 'var(--neu-chip-rose-fg)' },
};

export function Badge({ tone = 'neutral', size = 'sm', className, style, ...props }: ComponentPropsWithoutRef<'span'> & { tone?: SemanticTone; size?: 'sm' | 'xs' }) {
  const material = semanticTones[tone];
  return <span {...props} data-size={size} className={['serene-badge', className].filter(Boolean).join(' ')} style={{ '--badge-fill': material.fill, '--badge-ink': material.ink, ...style } as CSSProperties} />;
}
