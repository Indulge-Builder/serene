'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  children?: React.ReactNode;
}

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  xs: {
    padding:    'var(--space-1) var(--space-3)',
    fontSize:   'var(--text-xs)',
    gap:        'var(--space-1)',
    height:     '1.75rem',
  },
  sm: {
    padding:    'var(--space-1) var(--space-3)',
    fontSize:   'var(--text-sm)',
    gap:        'var(--space-2)',
    height:     '2rem',
  },
  md: {
    padding:    'var(--space-2) var(--space-4)',
    fontSize:   'var(--text-sm)',
    gap:        'var(--space-2)',
    height:     '2.25rem',
  },
  lg: {
    padding:    'var(--space-3) var(--space-6)',
    fontSize:   'var(--text-base)',
    gap:        'var(--space-2)',
    height:     '2.75rem',
  },
};

const ICON_SIZE: Record<ButtonSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
};

function getVariantStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background:  'var(--theme-accent)',
        color:       'var(--theme-accent-fg)',
        border:      '1px solid transparent',
      };
    case 'secondary':
      return {
        background:  'var(--theme-paper-subtle)',
        color:       'var(--theme-text-primary)',
        border:      '1px solid var(--theme-paper-border)',
      };
    case 'ghost':
      return {
        background:  'transparent',
        color:       'var(--theme-text-secondary)',
        border:      '1px solid transparent',
      };
    case 'danger':
      return {
        background:  'var(--color-danger-light)',
        color:       'var(--color-danger-text)',
        border:      '1px solid transparent',
      };
    case 'success':
      return {
        background:  'var(--color-success-light)',
        color:       'var(--color-success-text)',
        border:      '1px solid transparent',
      };
  }
}

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
    ...rest
  },
  ref,
) {
  const iconPx = ICON_SIZE[size];
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      {...rest}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'var(--font-sans)',
        fontWeight:     'var(--weight-semibold)',
        borderRadius:   'var(--radius-md)',
        cursor:         isDisabled ? 'not-allowed' : 'pointer',
        transition:     'var(--transition-interactive)',
        opacity:        isDisabled ? 0.5 : 1,
        whiteSpace:     'nowrap',
        lineHeight:     'var(--leading-none)',
        outline:        'none',
        ...SIZE_STYLES[size],
        ...getVariantStyle(variant),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled && variant === 'primary') {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-accent-hover)';
        }
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!isDisabled && variant === 'primary') {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-accent)';
        }
        rest.onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-focus)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        rest.onBlur?.(e);
      }}
    >
      {loading ? (
        <Spinner size="sm" canvas={variant === 'primary'} />
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
