'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export interface TaskCompletionCircleProps {
  checked: boolean;
  disabled?: boolean;
  /** Row-level hover — single accent border on the circle. */
  highlighted?: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Radio-style completion control — hollow circle when open, accent check when done.
 * Caller must stopPropagation on the row click handler; this button does not.
 *
 * Polish §03: completing emits ONE 700ms accent ring pulse
 * (`.serene-ring-pulse` — user toggles only, never on mount; skipped under
 * reduced motion). Square checklist tiles compose `ui/CheckTile` instead.
 */
export function TaskCompletionCircle({
  checked,
  disabled = false,
  highlighted = false,
  onToggle,
}: TaskCompletionCircleProps) {
  const [hovered, setHovered] = useState(false);
  const canInteract = !disabled;
  const showHollow = canInteract && !checked;
  const showRing = showHollow && (highlighted || hovered);

  // One-shot ring pulse when the user flips it to done after mount.
  const mountedRef = useRef(false);
  const prevChecked = useRef(checked);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevChecked.current = checked;
      return;
    }
    if (checked && !prevChecked.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 900); // 700ms + 150ms delay
      prevChecked.current = checked;
      return () => clearTimeout(t);
    }
    prevChecked.current = checked;
  }, [checked]);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={checked ? 'Reopen task' : 'Mark complete'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // serene-touch-hit: the 24px circle keeps its size and grows an
      // invisible 44px hit area on a coarse pointer (mobile audit 2026-09-26).
      className={pulse ? 'serene-touch-hit serene-ring-pulse' : 'serene-touch-hit'}
      style={{
        width:        'var(--space-6)',
        height:       'var(--space-6)',
        borderRadius: 'var(--radius-full)',
        border: showRing
          ? '1.5px solid var(--theme-accent)'
          : showHollow
            ? '1.5px solid var(--theme-paper-border)'
            : checked
              ? 'none'
              : '1.5px dashed var(--theme-paper-border)',
        background: 'transparent',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         canInteract ? 'pointer' : 'default',
        flexShrink:     0,
        padding:        0,
        transition: 'border-color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {checked ? (
        <CheckCircle2
          style={{
            width:       16,
            height:      16,
            strokeWidth: 1.5,
            color:       "var(--neu-accent-deep)",
          }}
        />
      ) : !canInteract ? (
        <Circle
          style={{
            width:       10,
            height:      10,
            strokeWidth: 1.5,
            color:       'var(--theme-paper-border)',
          }}
        />
      ) : null}
    </button>
  );
}
