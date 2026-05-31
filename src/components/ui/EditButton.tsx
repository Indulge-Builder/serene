'use client';

import React from 'react';
import { Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export interface EditButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  size?: 'sm' | 'md';
}

export function EditButton({
  label = 'Edit',
  size = 'sm',
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  disabled,
  className,
}: EditButtonProps) {
  const px = size === 'sm' ? 16 : 20;
  const iconPx = size === 'sm' ? 14 : 16;
  const [hovered, setHovered] = React.useState(false);

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={className}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-focus)';
        onFocus?.(e as unknown as React.FocusEvent<HTMLButtonElement>);
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        onBlur?.(e as unknown as React.FocusEvent<HTMLButtonElement>);
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
        cursor:         disabled ? 'not-allowed' : 'pointer',
        color:          hovered ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
        transition:     'var(--transition-hover)',
        padding:        0,
        outline:        'none',
        willChange:     'transform',
        opacity:        disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <motion.span
        animate={{ rotate: hovered ? -8 : 0 }}
        transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
        style={{ display: 'flex' }}
      >
        <Pencil
          style={{ width: iconPx, height: iconPx, strokeWidth: 1.5 }}
          aria-hidden="true"
        />
      </motion.span>
    </motion.button>
  );
}
