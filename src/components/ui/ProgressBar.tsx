'use client';

import React from 'react';
import { m as motion } from 'framer-motion';
import { EASE_SPRING, SLOW_DURATION } from '@/lib/constants/motion';

export type ProgressBarIntent = 'success' | 'warning' | 'danger' | 'accent' | 'neutral';

export interface ProgressBarProps {
  value: number;
  /** 0–100 */
  max?: number;
  intent?: ProgressBarIntent;
  /** Custom label, defaults to percentage display */
  label?: React.ReactNode;
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function resolveIntent(intent: ProgressBarIntent | undefined, value: number): ProgressBarIntent {
  if (intent) return intent;
  if (value < 33) return 'danger';
  if (value <= 66) return 'warning';
  return 'success';
}

const INTENT_COLOURS: Record<ProgressBarIntent, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
  accent:  'var(--theme-accent)',
  neutral: 'var(--color-neutral)',
};

export function ProgressBar({
  value,
  max = 100,
  intent,
  label,
  showLabel = false,
  className,
  style,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const resolvedIntent = resolveIntent(intent, pct);
  const fillColor = INTENT_COLOURS[resolvedIntent];

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', ...style }}>
      {showLabel && (
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
          }}
        >
          {label !== undefined ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
              {label}
            </span>
          ) : (
            <span
              style={{
                fontSize:   'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        style={{
          width:        '100%',
          height:       6,
          background:   'var(--theme-paper-border)',
          borderRadius: 'var(--radius-full)',
          overflow:     'hidden',
        }}
      >
        {/* Full-width fill scaled by transform — never animate width (DNA M-06) */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: SLOW_DURATION, ease: EASE_SPRING }}
          style={{
            width:           '100%',
            height:          '100%',
            background:      fillColor,
            borderRadius:    'var(--radius-full)',
            transformOrigin: 'left center',
          }}
        />
      </div>
    </div>
  );
}
