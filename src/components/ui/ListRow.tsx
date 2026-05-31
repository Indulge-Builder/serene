'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export interface ListRowProps {
  leftSlot?: React.ReactNode;
  primaryText: React.ReactNode;
  secondaryText?: React.ReactNode;
  rightSlot?: React.ReactNode;
  showChevron?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function ListRow({
  leftSlot,
  primaryText,
  secondaryText,
  rightSlot,
  showChevron = false,
  onClick,
  className,
  style,
}: ListRowProps) {
  const [hovered, setHovered] = React.useState(false);
  const isClickable = !!onClick;

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={className}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => isClickable && setHovered(false)}
      onFocus={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-focus)'; }}
      onBlur={(e)  => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-3)',
        padding:        'var(--space-3) var(--space-4)',
        background:     hovered ? 'var(--theme-paper-subtle)' : 'var(--theme-paper)',
        borderRadius:   'var(--radius-md)',
        cursor:         isClickable ? 'pointer' : 'default',
        transition:     'background var(--duration-fast) var(--ease-in-out)',
        outline:        'none',
        ...style,
      }}
    >
      {leftSlot && <div style={{ flexShrink: 0 }}>{leftSlot}</div>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-medium)',
            color:        'var(--theme-text-primary)',
            lineHeight:   'var(--leading-snug)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >
          {primaryText}
        </div>
        {secondaryText && (
          <div
            style={{
              fontSize:     'var(--text-xs)',
              color:        'var(--theme-text-secondary)',
              marginTop:    '0.125rem',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {secondaryText}
          </div>
        )}
      </div>

      {rightSlot && <div style={{ flexShrink: 0 }}>{rightSlot}</div>}

      {showChevron && (
        <motion.span
          animate={{ x: hovered ? 2 : 0 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
          style={{ display: 'flex', flexShrink: 0, willChange: 'transform' }}
        >
          <ChevronRight
            style={{ width: 16, height: 16, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)' }}
            aria-hidden="true"
          />
        </motion.span>
      )}
    </div>
  );
}
