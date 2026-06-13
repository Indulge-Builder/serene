'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
/** Icon micro-interaction family (design-tokens.css) — hover gesture on the child svg. */
export type ButtonIconMotion = 'rotate' | 'lift' | 'drop' | 'ring';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  children?: React.ReactNode;
  /** When true, focus does not add --shadow-focus (filter bar actions). */
  suppressFocusRing?: boolean;
  /** Opt-in icon hover gesture — maps to the .serene-icon-*-hover utilities.
   *  rotate: Plus CTAs / close ×. lift: send. drop: download. ring: phone. */
  iconMotion?: ButtonIconMotion;
}

// ✓ spec — design-dna.md §5.01 size table
const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  xs: {
    padding:    'var(--space-1) var(--space-3)',
    fontSize:   'var(--text-xs)',
    gap:        'var(--space-1)',
    height:     '1.75rem', // 28px
  },
  sm: {
    padding:    'var(--space-1) var(--space-3)',
    fontSize:   'var(--text-sm)',
    gap:        'var(--space-2)',
    height:     '2rem', // 32px
  },
  md: {
    padding:    'var(--space-2) var(--space-4)',
    fontSize:   'var(--text-sm)',
    gap:        'var(--space-2)',
    height:     '2.25rem', // 36px
  },
  lg: {
    padding:    'var(--space-3) var(--space-6)',
    fontSize:   'var(--text-base)',
    gap:        'var(--space-2)',
    height:     '2.75rem', // 44px
  },
};

const ICON_SIZE: Record<ButtonSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
};

// ✓ spec — design-dna.md §5.01 variant table. Rest + hover chrome lives in
// design-tokens.css (`.serene-btn-*`): :hover is gated to real pointers there
// (no sticky hover after a tap on touch), the focus ring is :focus-visible,
// and press feedback (.serene-pressable:active) beats hover by cascade order.
// danger/success stay soft-default at rest → saturated on hover (intentional
// drift from the §5.01 saturated default; switching would visually break
// 5+ existing consumers).

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft: IconLeft,
    iconRight: IconRight,
    disabled,
    children,
    style,
    className,
    suppressFocusRing = false,
    iconMotion,
    ...rest
  },
  ref,
) {
  const iconPx = ICON_SIZE[size];
  const isDisabled = disabled || loading;
  const classes = [
    'serene-pressable',
    `serene-btn-${variant}`,
    suppressFocusRing && 'serene-btn-no-ring',
    iconMotion && `serene-icon-${iconMotion}-hover`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={classes}
      {...rest}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'var(--font-sans)',
        fontWeight:     'var(--weight-semibold)',
        borderRadius:   'var(--radius-sm)', // ✓ spec — §5.01 never --radius-md
        cursor:         isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents:  isDisabled ? 'none' : 'auto', // ✓ spec — disabled state
        transition:     'var(--transition-interactive)',
        opacity:        isDisabled ? 0.5 : 1,
        whiteSpace:     'nowrap',
        lineHeight:     'var(--leading-none)',
        outline:        'none',
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {loading ? (
        <Spinner size="sm" canvas={variant === 'primary'} /> // ✓ spec — width preserved, replaces iconLeft slot
      ) : (
        IconLeft && (
          <IconLeft
            style={{ width: iconPx, height: iconPx, strokeWidth: 1.5, flexShrink: 0 }}
          />
        )
      )}
      {children}
      {!loading && IconRight && (
        <IconRight
          style={{ width: iconPx, height: iconPx, strokeWidth: 1.5, flexShrink: 0 }}
        />
      )}
    </button>
  );
});
