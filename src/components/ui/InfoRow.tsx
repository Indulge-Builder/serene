'use client';

import React from 'react';
import { Copy, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface InfoRowProps {
  label: string;
  value?: React.ReactNode;
  icon?: LucideIcon;
  copyable?: boolean;
  copyValue?: string;
  /** Horizontal (default) or stacked layout */
  stacked?: boolean;
  /** Show border-bottom divider */
  divider?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function InfoRow({
  label,
  value,
  icon: Icon,
  copyable,
  copyValue,
  stacked = false,
  divider = false,
  className,
  style,
}: InfoRowProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    const text = copyValue ?? (typeof value === 'string' ? value : '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed silently
    }
  }

  return (
    <div
      className={className}
      style={{
        display:       stacked ? 'block' : 'flex',
        alignItems:    stacked ? undefined : 'flex-start',
        gap:           stacked ? undefined : 'var(--space-3)',
        paddingBottom: divider ? 'var(--space-4)' : undefined,
        borderBottom:  divider ? '1px solid var(--theme-paper-border)' : undefined,
        ...style,
      }}
    >
      {Icon && (
        <Icon
          style={{
            width:      16,
            height:     16,
            strokeWidth: 1.5,
            flexShrink: 0,
            marginTop:  '2px',
            color:      'var(--theme-text-tertiary)',
          }}
          aria-hidden="true"
        />
      )}

      <div
        style={{
          display:       'flex',
          flexDirection: 'column',
          gap:           '0.125rem',
          flex:          1,
          minWidth:      0,
        }}
      >
        <span className="label-micro">{label}</span>

        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-2)',
          }}
        >
          <span
            style={{
              fontSize:     'var(--text-sm)',
              color:        value ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
              wordBreak:    'break-word',
              lineHeight:   'var(--leading-snug)',
              flex:         1,
              minWidth:     0,
            }}
          >
            {value ?? '—'}
          </span>

          {copyable && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : `Copy ${label}`}
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
                width:          24,
                height:         24,
                background:     'transparent',
                border:         'none',
                borderRadius:   'var(--radius-xs)',
                cursor:         'pointer',
                color:          copied ? 'var(--color-success-text)' : 'var(--theme-text-tertiary)',
                transition:     'var(--transition-hover)',
                padding:        0,
              }}
            >
              {copied ? (
                <Check style={{ width: 12, height: 12, strokeWidth: 2 }} aria-hidden="true" />
              ) : (
                <Copy style={{ width: 12, height: 12, strokeWidth: 1.5 }} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
