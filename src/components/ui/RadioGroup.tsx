'use client';

import React, { useId } from 'react';

export interface RadioOption {
  id: string;
  label: string;
  description?: string;
}

export type RadioGroupVariant = 'default' | 'card';

export interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  variant?: RadioGroupVariant;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function RadioGroup({
  options,
  value,
  onChange,
  name,
  variant = 'default',
  disabled = false,
  className,
  style,
}: RadioGroupProps) {
  const generatedId = useId();
  const groupName = name ?? generatedId;

  return (
    <div
      role="radiogroup"
      className={className}
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           variant === 'card' ? 'var(--space-2)' : 'var(--space-3)',
        ...style,
      }}
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        const itemId = `${groupName}-${opt.id}`;

        return (
          <label
            key={opt.id}
            htmlFor={itemId}
            style={{
              display:        variant === 'card' ? 'flex' : 'flex',
              alignItems:     'flex-start',
              gap:            'var(--space-3)',
              cursor:         disabled ? 'not-allowed' : 'pointer',
              opacity:        disabled ? 0.5 : 1,
              padding:        variant === 'card' ? 'var(--space-3) var(--space-4)' : 0,
              background:     variant === 'card' && selected ? 'var(--theme-accent-surface)' : 'transparent',
              border:         variant === 'card'
                ? `1px solid ${selected ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`
                : 'none',
              borderRadius:   variant === 'card' ? 'var(--radius-md)' : 'none',
              transition:     'var(--transition-hover)',
            }}
          >
            <input
              id={itemId}
              type="radio"
              name={groupName}
              value={opt.id}
              checked={selected}
              onChange={() => !disabled && onChange(opt.id)}
              disabled={disabled}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />

            {/* Custom radio indicator */}
            <span
              aria-hidden="true"
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
                width:          18,
                height:         18,
                borderRadius:   'var(--radius-full)',
                border:         `1.5px solid ${selected ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
                background:     'transparent',
                marginTop:      '1px',
                transition:     'border-color var(--duration-base) var(--ease-in-out)',
              }}
            >
              {selected && (
                <span
                  style={{
                    width:        8,
                    height:       8,
                    borderRadius: 'var(--radius-full)',
                    background:   'var(--theme-accent)',
                    display:      'block',
                  }}
                />
              )}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display:    'block',
                  fontSize:   'var(--text-sm)',
                  fontWeight: 'var(--weight-medium)',
                  color:      'var(--theme-text-primary)',
                  lineHeight: 'var(--leading-snug)',
                }}
              >
                {opt.label}
              </span>
              {opt.description && (
                <span
                  style={{
                    display:    'block',
                    fontSize:   'var(--text-xs)',
                    color:      'var(--theme-text-secondary)',
                    marginTop:  '0.125rem',
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {opt.description}
                </span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
