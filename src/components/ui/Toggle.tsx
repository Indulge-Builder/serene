'use client';

import React from 'react';
import { m as motion } from 'framer-motion';
import { SPRING_CONFIG } from '@/lib/constants/motion';

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  size?: ToggleSize;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

const TRACK: Record<ToggleSize, { width: number; height: number }> = {
  sm: { width: 32, height: 18 },
  md: { width: 40, height: 22 },
};

const THUMB: Record<ToggleSize, { size: number }> = {
  sm: { size: 12 },
  md: { size: 16 },
};

export function Toggle({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  disabled = false,
  id,
  className,
  style,
}: ToggleProps) {
  const track = TRACK[size];
  const thumb = THUMB[size];
  const pad = (track.height - thumb.size) / 2;
  const travelX = track.width - thumb.size - pad * 2;

  const generatedId = React.useId();
  const toggleId = id ?? generatedId;

  return (
    <div
      className={className}
      style={{
        display:    'flex',
        alignItems: 'flex-start',
        gap:        'var(--space-3)',
        opacity:    disabled ? 0.5 : 1,
        cursor:     disabled ? 'not-allowed' : 'default',
        ...style,
      }}
    >
      {/* Track */}
      <button
        id={toggleId}
        role="switch"
        aria-checked={checked}
        type="button"
        className={size === 'sm' ? 'serene-touch-hit' : undefined}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          position:   'relative',
          flexShrink: 0,
          width:      track.width,
          height:     track.height,
          borderRadius: 'var(--radius-full)',
          // Neumorphic Rule 4: the track is a satin inset well in BOTH states —
          // the knob carries the on-state (accent gradient), never the track.
          background: checked
            ? 'color-mix(in srgb, var(--theme-accent) 14%, var(--neu-well))'
            : 'var(--neu-well)',
          border:     'none',
          boxShadow:  'var(--neu-shadow-inset)',
          cursor:     disabled ? 'not-allowed' : 'pointer',
          padding:    0,
          transition: `background var(--duration-base) var(--ease-spring)`,
          outline:    'none',
        }}
        // Keyboard focus is the shared outline; a click leaves the inset track alone.
      >
        {/* Thumb */}
        <motion.span
          animate={{ x: checked ? travelX : 0 }}
          transition={SPRING_CONFIG}
          style={{
            position:     'absolute',
            top:          pad,
            left:         pad,
            width:        thumb.size,
            height:       thumb.size,
            borderRadius: 'var(--radius-full)',
            // Rose-gradient knob when on; raised cream knob when off (specimen).
            background:   checked ? 'var(--neu-accent-gradient)' : 'var(--neu-surface)',
            boxShadow:    'var(--neu-shadow-knob)',
            display:      'block',
          }}
        />
      </button>

      {/* Labels */}
      {(label || description) && (
        <div
          style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           '0.125rem',
          }}
        >
          {label && (
            <label
              htmlFor={toggleId}
              style={{
                fontSize:   'var(--text-sm)',
                fontWeight: 'var(--weight-medium)',
                color:      'var(--theme-text-primary)',
                cursor:     disabled ? 'not-allowed' : 'pointer',
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {label}
            </label>
          )}
          {description && (
            <span
              style={{
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-secondary)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
