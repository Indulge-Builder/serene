'use client';

import React from 'react';
import { Pencil } from 'lucide-react';

export interface EditButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  size?: 'sm' | 'md';
}

export function EditButton({ label = 'Edit', size = 'sm', style, ...rest }: EditButtonProps) {
  const px = size === 'sm' ? 16 : 20;
  const iconPx = size === 'sm' ? 14 : 16;
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      onMouseEnter={(e) => {
        setHovered(true);
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
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
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          px + 8,
        height:         px + 8,
        borderRadius:   'var(--radius-sm)',
        background:     hovered ? 'var(--theme-accent-surface)' : 'transparent',
        border:         'none',
        cursor:         'pointer',
        color:          hovered ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
        transition:     'var(--transition-hover)',
        padding:        0,
        outline:        'none',
        ...style,
      }}
    >
      <Pencil
        style={{ width: iconPx, height: iconPx, strokeWidth: 1.5 }}
        aria-hidden="true"
      />
    </button>
  );
}
