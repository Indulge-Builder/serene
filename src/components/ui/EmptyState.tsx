'use client';

import React from 'react';
import { m as motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

/**
 * THE canonical empty state. Makes the design rule structural:
 * "Empty states: Always Playfair italic heading. Never 'No data available.'"
 *
 * Two variants:
 * - `hero` (default when `icon` is provided): 64px icon tile + xl italic serif
 *   title + sans tertiary description. Centred, Framer entrance.
 *   Used for full-panel empties (WhatsApp right pane, performance roster).
 * - `inline`: a single centred serif-italic tertiary sentence (+ optional
 *   description line). Used inside cards, panels, and lists.
 *
 * `framed` adds the paper-subtle bordered surface; `ambient` adds the accent
 * radial wash (decorative, aria-hidden). Both are hero-variant options.
 */

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Lucide icon — renders the 64px hero tile and implies variant="hero". */
  icon?: LucideIcon;
  variant?: 'hero' | 'inline';
  /** Hero only: wrap in a paper-subtle bordered card surface. */
  framed?: boolean;
  /** Hero only: accent radial wash behind the content (requires framed). */
  ambient?: boolean;
  /** Inline only: title scale — 'sm' (default, --text-sm) or 'lg' (--text-lg, light). */
  size?: 'sm' | 'lg';
  /** Optional action slot rendered below the text. */
  action?: React.ReactNode;
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  variant,
  framed = false,
  ambient = false,
  size = 'sm',
  action,
  minHeight,
  className,
  style,
}: EmptyStateProps) {
  const resolved = variant ?? (Icon ? 'hero' : 'inline');

  if (resolved === 'inline') {
    return (
      <div className={className} style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)', ...style }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   size === 'lg' ? 'var(--text-lg)' : 'var(--text-sm)',
            fontWeight: size === 'lg' ? 'var(--weight-light)' : undefined,
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-xs)',
              color:      'var(--theme-text-tertiary)',
              margin:     'var(--space-1) 0 0',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {description}
          </p>
        )}
        {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      style={{
        position:       'relative',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            'var(--space-5)',
        padding:        'var(--space-8)',
        ...(minHeight ? { minHeight } : {}),
        ...(framed
          ? {
              borderRadius: 'var(--radius-lg)',
              border:       '1px solid var(--theme-paper-border)',
              background:   'var(--theme-paper-subtle)',
              boxShadow:    'var(--shadow-1)',
              overflow:     'hidden',
            }
          : {}),
        ...style,
      }}
    >
      {ambient && (
        <div
          aria-hidden="true"
          style={{
            position:      'absolute',
            inset:         0,
            pointerEvents: 'none',
            background:    `
              radial-gradient(ellipse 55% 45% at 18% 22%, color-mix(in srgb, var(--theme-accent) 9%, transparent), transparent 70%),
              radial-gradient(ellipse 50% 40% at 82% 78%, color-mix(in srgb, var(--theme-accent) 6%, transparent), transparent 72%)
            `,
          }}
        />
      )}

      {Icon && (
        <div
          style={{
            position:       'relative',
            zIndex:         1,
            width:          '64px',
            height:         '64px',
            borderRadius:   'var(--radius-xl)',
            background:     'var(--theme-paper)',
            border:         '1px solid var(--theme-paper-border)',
            boxShadow:      'var(--shadow-1)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            style={{
              width:       '28px',
              height:      '28px',
              strokeWidth: 1.5,
              color:       'var(--theme-accent)',
            }}
          />
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '280px' }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle:  'italic',
            fontSize:   'var(--text-xl)',
            color:      'var(--theme-text-primary)',
            margin:     description ? '0 0 var(--space-2)' : 0,
            fontWeight: 'var(--weight-normal)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            {description}
          </p>
        )}
        {action && <div style={{ marginTop: 'var(--space-5)' }}>{action}</div>}
      </div>
    </motion.div>
  );
}
