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

interface VariantStyle {
  rest: React.CSSProperties;
  hover: React.CSSProperties;
}

// ✓ spec — design-dna.md §5.01 variant table
function getVariantStyle(variant: ButtonVariant): VariantStyle {
  switch (variant) {
    case 'primary':
      return {
        rest: {
          background: 'var(--theme-accent)',
          color:      'var(--theme-accent-fg)',
          border:     '1px solid transparent',
          boxShadow:  'var(--shadow-accent-glow)',
        },
        hover: {
          background: 'var(--theme-accent-hover)',
          boxShadow:  'var(--shadow-accent-lift)',
          transform:  'translateY(-1px)',
        },
      };
    case 'secondary':
      return {
        rest: {
          background: 'var(--theme-paper-subtle)',
          color:      'var(--theme-text-primary)',
          border:     '1px solid var(--theme-paper-border)',
          boxShadow:  'var(--shadow-1)',
        },
        hover: {
          background:  'var(--theme-paper-subtle)',
          borderColor: 'var(--theme-accent-muted)',
        },
      };
    case 'ghost':
      return {
        rest: {
          background: 'transparent',
          color:      'var(--theme-text-primary)',
          border:     '1px solid transparent',
        },
        hover: {
          background: 'var(--theme-paper-subtle)',
          color:      'var(--theme-text-primary)',
        },
      };
    case 'danger':
      // Soft-default variant — matches current codebase behaviour. design-dna.md §5.01
      // shows the saturated alternative; switching would visually break 5+ existing consumers
      // (task pre-mortem: "Must not break any existing consumer"). Reported in changelog.
      return {
        rest: {
          background: 'var(--color-danger-light)',
          color:      'var(--color-danger-text)',
          border:     '1px solid var(--color-danger-light)',
        },
        hover: {
          background: 'var(--color-danger)',
          color:      'var(--theme-text-inverse)',
          borderColor:'var(--color-danger)',
        },
      };
    case 'success':
      // Soft-default variant — see danger note above.
      return {
        rest: {
          background: 'var(--color-success-light)',
          color:      'var(--color-success-text)',
          border:     '1px solid var(--color-success-light)',
        },
        hover: {
          background: 'var(--color-success)',
          color:      'var(--theme-text-inverse)',
          borderColor:'var(--color-success)',
        },
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
  const variantStyle = getVariantStyle(variant);

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
        borderRadius:   'var(--radius-sm)', // ✓ spec — §5.01 never --radius-md
        cursor:         isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents:  isDisabled ? 'none' : 'auto', // ✓ spec — disabled state
        transition:     'var(--transition-interactive)',
        opacity:        isDisabled ? 0.5 : 1,
        whiteSpace:     'nowrap',
        lineHeight:     'var(--leading-none)',
        outline:        'none',
        ...SIZE_STYLES[size],
        ...variantStyle.rest,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          const el = e.currentTarget as HTMLButtonElement;
          Object.entries(variantStyle.hover).forEach(([k, v]) => {
            el.style.setProperty(
              k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
              String(v),
            );
          });
        }
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          const el = e.currentTarget as HTMLButtonElement;
          // Restore rest values for every property the hover touched.
          Object.keys(variantStyle.hover).forEach((k) => {
            const cssKey = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            const restValue = (variantStyle.rest as Record<string, string | undefined>)[k];
            if (restValue !== undefined) {
              el.style.setProperty(cssKey, restValue);
            } else {
              el.style.removeProperty(cssKey);
            }
          });
        }
        rest.onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-focus)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        const restShadow = (variantStyle.rest as Record<string, string | undefined>).boxShadow;
        if (restShadow) {
          el.style.boxShadow = restShadow;
        } else {
          el.style.removeProperty('box-shadow');
        }
        rest.onBlur?.(e);
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
