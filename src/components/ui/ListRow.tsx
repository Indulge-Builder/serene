'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

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
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={className}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            'var(--space-3)',
        padding:        'var(--space-3) var(--space-4)',
        background:     'var(--theme-paper)',
        borderRadius:   'var(--radius-md)',
        cursor:         onClick ? 'pointer' : 'default',
        transition:     'background var(--duration-fast) var(--ease-in-out)',
        outline:        'none',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-paper-subtle)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-paper)';
        }
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-focus)';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {leftSlot && (
        <div style={{ flexShrink: 0 }}>
          {leftSlot}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize:   'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color:      'var(--theme-text-primary)',
            lineHeight: 'var(--leading-snug)',
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
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

      {rightSlot && (
        <div style={{ flexShrink: 0 }}>
          {rightSlot}
        </div>
      )}

      {showChevron && (
        <ChevronRight
          style={{
            width:       16,
            height:      16,
            strokeWidth: 1.5,
            flexShrink:  0,
            color:       'var(--theme-text-tertiary)',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
