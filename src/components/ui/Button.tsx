'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SeedMandala } from './SeedMandala';
import { filterTriggerStyle } from './material-styles';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'control' | 'warning' | 'ghost-danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
/** Icon micro-interaction family (design-tokens.css) — hover gesture on the child svg. */
export type ButtonIconMotion = 'rotate' | 'lift' | 'drop' | 'ring';
/** Save-morph grammar (polish handoff §03): idle → pending (mandala +
 *  progressive verb) → success (sage re-tint + check draw + "Saved"). */
export type ButtonStatus = 'idle' | 'pending' | 'success';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Applied toolbar/filter state; callers supply aria-pressed when appropriate. */
  active?: boolean;
  /** Square control; provide an accessible label when no text is visible. */
  iconOnly?: boolean;
  size?: ButtonSize;
  loading?: boolean;
  /** Progressive-verb label shown while loading ("Placing request…",
   *  "Saving…") — falls back to children when omitted. */
  loadingLabel?: string;
  /**
   * The save-morph state machine (polish handoff §03). 'pending' is the
   * existing loading treatment (17px currentColor SeedMandala at 3.5s/rev +
   * loadingLabel); 'success' re-tints to the SEMANTIC sage gradient
   * (--neu-success-gradient — never the theme accent), draws the check in
   * (400ms) and shows successLabel. The button is controlled — pair with
   * useButtonStatus() below, which runs pending → success → idle for you.
   * Takes precedence over `loading` when both are set.
   */
  status?: ButtonStatus;
  /** Label for the success phase — defaults to "Saved". */
  successLabel?: string;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  children?: React.ReactNode;
  /** When true, focus does not add --shadow-focus (filter bar actions). */
  suppressFocusRing?: boolean;
  /** Opt-in icon hover gesture — maps to the .serene-icon-*-hover utilities.
   *  rotate: Plus CTAs / close ×. lift: send. drop: download. ring: phone. */
  iconMotion?: ButtonIconMotion;
}

/** How long the sage success phase holds before returning to idle (ms). */
const SUCCESS_HOLD_MS = 1800;

/**
 * useButtonStatus — the one-liner driver for the save morph.
 *
 *   const save = useButtonStatus();
 *   <Button status={save.status} loadingLabel="Saving…"
 *     onClick={() => save.run(async () => { await saveAction(); })}>
 *     Save changes
 *   </Button>
 *
 * run() flips pending → success → (1.8s) → idle; a thrown/rejected promise
 * returns straight to idle (the caller keeps its own error surface). Pass
 * success: false from the callback (ActionResult flows) to skip the sage
 * phase without throwing.
 */
export function useButtonStatus() {
  const [status, setStatus] = useState<ButtonStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setStatus('pending');
      try {
        const result = await fn();
        const succeeded =
          result === undefined ||
          result === null ||
          typeof result !== 'object' ||
          !('success' in result) ||
          (result as { success?: boolean }).success !== false;
        if (succeeded) {
          setStatus('success');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setStatus('idle'), SUCCESS_HOLD_MS);
        } else {
          setStatus('idle');
        }
        return result;
      } catch (err) {
        setStatus('idle');
        throw err;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setStatus('idle');
  }, []);

  return { status, run, reset };
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
    active = false,
    iconOnly = false,
    size = 'md',
    loading = false,
    loadingLabel,
    status,
    successLabel = 'Saved',
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
  // status is the richer grammar; `loading` alone maps onto its pending phase.
  const resolvedStatus: ButtonStatus = status ?? (loading ? 'pending' : 'idle');
  const isPending = resolvedStatus === 'pending';
  const isSuccess = resolvedStatus === 'success';
  const isDisabled = disabled || isPending || isSuccess;
  const classes = [
    'serene-pressable',
    'serene-action',
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
      aria-busy={isPending || undefined}
      className={classes}
      {...rest}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'var(--font-sans)',
        fontWeight:     variant === 'control' ? 'var(--weight-medium)' : 'var(--weight-semibold)',
        borderRadius:   'var(--neu-radius-control)',
        // Loading is a live wait, not a dead control (logo-motion handoff):
        // cursor wait (pointer events stay on so it shows — the disabled
        // attribute already swallows clicks), primary softens to 0.85.
        cursor:         isPending ? 'wait' : isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents:  isDisabled && !isPending && !isSuccess ? 'none' : 'auto', // ✓ spec — disabled state
        transition:     'var(--transition-interactive), background 300ms var(--ease-in-out)',
        opacity:        isPending ? (variant === 'primary' ? 0.85 : 1) : isSuccess ? 1 : isDisabled ? 0.5 : 1,
        whiteSpace:     'nowrap',
        lineHeight:     'var(--leading-none)',
        outline:        'none',
        ...SIZE_STYLES[size],
        flexShrink: 0,
        ...(iconOnly ? { width: SIZE_STYLES[size].height, padding: 0 } : {}),
        ...(variant === 'control' ? filterTriggerStyle(active, rest['aria-expanded'] === true) : {}),
        // Success re-tint — SEMANTIC sage, never the theme accent (§03).
        ...(isSuccess
          ? { background: 'var(--neu-success-gradient)', color: 'var(--neu-success-ink)' }
          : {}),
        ...style,
      }}
    >
      {isPending ? (
        // 18px currentColor mark, 3.5s/rev — the button quotation of the boot
        // sequence; replaces the iconLeft slot, inherits the variant's text ink.
        <SeedMandala size={18} variant="currentColor" spin={3.5} />
      ) : isSuccess ? (
        // Check draws in once (400ms spring-out) in the icon slot.
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ width: iconPx, height: iconPx, overflow: 'visible', flexShrink: 0 }}
        >
          <path
            className="serene-check-draw"
            d="M5 12.5 L10 17.5 L19 6.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={0}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        IconLeft && (
          <IconLeft
            style={{ width: iconPx, height: iconPx, strokeWidth: 1.5, flexShrink: 0 }}
          />
        )
      )}
      {isPending && loadingLabel ? loadingLabel : isSuccess ? successLabel : children}
      {!isPending && !isSuccess && IconRight && (
        <IconRight
          style={{ width: iconPx, height: iconPx, strokeWidth: 1.5, flexShrink: 0 }}
        />
      )}
    </button>
  );
});
