'use client';

import { useState } from 'react';
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

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={checked ? 'Reopen task' : 'Mark complete'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
            color:       'var(--theme-accent)',
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
