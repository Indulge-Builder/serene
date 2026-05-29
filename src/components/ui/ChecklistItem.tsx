'use client';

import React from 'react';
import { CheckSquare2, Square } from 'lucide-react';

export interface ChecklistItemProps {
  id: string;
  label: string;
  checked: boolean;
  onToggle: (id: string) => void;
  secondaryText?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ChecklistItem({
  id,
  label,
  checked,
  onToggle,
  secondaryText,
  disabled = false,
  className,
  style,
}: ChecklistItemProps) {
  return (
    <div
      className={className}
      style={{
        display:    'flex',
        alignItems: secondaryText ? 'flex-start' : 'center',
        gap:        'var(--space-3)',
        padding:    'var(--space-2) 0',
        opacity:    disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => !disabled && onToggle(id)}
        aria-label={checked ? `Uncheck: ${label}` : `Check: ${label}`}
        disabled={disabled}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          background:     'transparent',
          border:         'none',
          padding:        0,
          cursor:         disabled ? 'not-allowed' : 'pointer',
          color:          checked ? 'var(--color-success)' : 'var(--theme-paper-border)',
          transition:     'color var(--duration-base) var(--ease-in-out)',
          marginTop:      secondaryText ? '1px' : 0,
        }}
      >
        {checked ? (
          <CheckSquare2 style={{ width: 18, height: 18, strokeWidth: 1.5 }} aria-hidden="true" />
        ) : (
          <Square style={{ width: 18, height: 18, strokeWidth: 1.5 }} aria-hidden="true" />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-sans)',
            color:           checked ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
            textDecoration:  checked ? 'line-through' : 'none',
            transition:      'color var(--duration-base) var(--ease-in-out), text-decoration-color var(--duration-base) var(--ease-in-out)',
            lineHeight:      'var(--leading-snug)',
            wordBreak:       'break-word',
          }}
        >
          {label}
        </span>
        {secondaryText && (
          <span
            style={{
              display:    'block',
              fontSize:   'var(--text-xs)',
              color:      'var(--theme-text-tertiary)',
              marginTop:  '0.125rem',
            }}
          >
            {secondaryText}
          </span>
        )}
      </div>
    </div>
  );
}
