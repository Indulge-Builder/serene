'use client';

import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** On-canvas (dark bg) variant — uses --theme-canvas-text */
  canvas?: boolean;
  className?: string;
}

const SIZE_PX: Record<NonNullable<SpinnerProps['size']>, number> = {
  sm: 16,
  md: 24,
  lg: 40,
};

export function Spinner({ size = 'md', canvas = false, className }: SpinnerProps) {
  const px = SIZE_PX[size];
  const stroke = size === 'lg' ? 2.5 : 2;

  return (
    <svg
      className={`animate-spin${className ? ` ${className}` : ''}`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        color: canvas ? 'var(--theme-canvas-text)' : 'var(--theme-accent)',
        flexShrink: 0,
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeOpacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
