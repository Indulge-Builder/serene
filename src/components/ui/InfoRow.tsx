'use client';

import React from 'react';
import { Copy, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

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
            <motion.button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : `Copy ${label}`}
              whileTap={{ scale: 0.8 }}
              transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
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
                transition:     'color var(--transition-hover)',
                padding:        0,
                willChange:     'transform',
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                    style={{ display: 'flex' }}
                  >
                    <Check style={{ width: 12, height: 12, strokeWidth: 2 }} aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                    style={{ display: 'flex' }}
                  >
                    <Copy style={{ width: 12, height: 12, strokeWidth: 1.5 }} aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
