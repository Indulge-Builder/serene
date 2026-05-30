'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

export type SearchBarSize = 'sm' | 'md' | 'lg';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: SearchBarSize;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  'aria-label'?: string;
}

const SIZE_STYLES: Record<SearchBarSize, { height: string; fontSize: string; iconSize: number; pl: string }> = {
  sm: { height: '2rem',    fontSize: 'var(--text-xs)',   iconSize: 14, pl: 'calc(var(--space-2) + 14px + var(--space-2))' },
  md: { height: '2.25rem', fontSize: 'var(--text-sm)',   iconSize: 16, pl: 'calc(var(--space-2) + 16px + var(--space-2))' },
  lg: { height: '2.75rem', fontSize: 'var(--text-base)', iconSize: 18, pl: 'calc(var(--space-3) + 18px + var(--space-3))' },
};

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
  size = 'md',
  disabled = false,
  className,
  style,
  autoFocus,
  'aria-label': ariaLabel,
}: SearchBarProps) {
  const { height, fontSize, iconSize, pl } = SIZE_STYLES[size];
  const [focused, setFocused] = React.useState(false);
  const [clearHovered, setClearHovered] = React.useState(false);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display:  'inline-flex',
        width:    '100%',
        ...style,
      }}
    >
      {/* Leading icon */}
      <Search
        style={{
          position:   'absolute',
          left:       'var(--space-2)',
          top:        '50%',
          transform:  'translateY(-50%)',
          width:      iconSize,
          height:     iconSize,
          strokeWidth: 1.5,
          pointerEvents: 'none',
          color:      'var(--theme-text-tertiary)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />

      <input
        type="text"
        className="eia-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width:           '100%',
          height,
          paddingLeft:     pl,
          paddingRight:    value ? 'calc(var(--space-2) + 16px + var(--space-2))' : 'var(--space-3)',
          background:      'var(--theme-paper-subtle)',
          border:          `1px solid ${focused ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
          borderRadius:    'var(--radius-md)',
          fontSize,
          color:           'var(--theme-text-primary)',
          fontFamily:      'var(--font-sans)',
          outline:         'none',
          transition:      'var(--transition-hover)',
          boxShadow:       focused ? 'var(--shadow-focus)' : 'none',
          caretColor:      'var(--theme-accent)',
          opacity:         disabled ? 0.5 : 1,
          cursor:          disabled ? 'not-allowed' : 'text',
        }}
      />

      {/* Clear button */}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange('')}
          onMouseEnter={() => setClearHovered(true)}
          onMouseLeave={() => setClearHovered(false)}
          aria-label="Clear search"
          style={{
            position:       'absolute',
            right:          'var(--space-2)',
            top:            '50%',
            transform:      'translateY(-50%)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          20,
            height:         20,
            background:     'transparent',
            border:         'none',
            borderRadius:   'var(--radius-full)',
            cursor:         'pointer',
            color:          clearHovered ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
            transition:     'var(--transition-hover)',
            padding:        0,
          }}
        >
          <X style={{ width: 14, height: 14, strokeWidth: 1.5 }} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
