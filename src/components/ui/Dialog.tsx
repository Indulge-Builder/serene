'use client';

import React, { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  ENTER_DURATION,
  EXIT_DURATION,
  EASE_OUT_EXPO,
  EASE_IN_EXPO,
  EASE_IN_OUT,
} from '@/lib/constants/motion';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  /** Hides the header close button */
  hideCloseButton?: boolean;
  /**
   * Tailwind max-width class override — takes precedence over size.
   * Exists for backward compat with callers that pass maxWidth="max-w-lg".
   */
  maxWidth?: string;
}

const MAX_WIDTH: Record<Exclude<DialogSize, 'full'>, string> = {
  sm: '480px',
  md: '600px',
  lg: '760px',
  xl: '960px',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
  maxWidth,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const isFull = size === 'full';

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: ENTER_DURATION, ease: EASE_IN_OUT }}
            onClick={onClose}
            style={{
              position:   'fixed',
              inset:      0,
              background: 'rgba(var(--theme-canvas, 10 10 10) / 0.72)',
              backgroundColor: 'color-mix(in srgb, var(--theme-canvas) 72%, transparent)',
              zIndex:     isFull
                ? ('var(--z-overlay)' as React.CSSProperties['zIndex'])
                : ('var(--z-overlay)' as React.CSSProperties['zIndex']),
              display:    'flex',
              alignItems: isFull ? 'stretch' : 'center',
              justifyContent: 'center',
              padding:    isFull ? 0 : 'var(--space-4)',
            }}
          >
            {/* Panel */}
            <motion.div
              key="dialog-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descId : undefined}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: ENTER_DURATION, ease: EASE_OUT_EXPO } }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: EXIT_DURATION, ease: EASE_IN_EXPO } }}
              onClick={(e) => e.stopPropagation()}
              className={maxWidth}
              style={{
                background:   'var(--theme-paper)',
                boxShadow:    'var(--shadow-4)',
                borderRadius: isFull ? 0 : 'var(--radius-xl)',
                overflow:     'hidden',
                display:      'flex',
                flexDirection:'column',
                zIndex:       ('var(--z-modal)' as React.CSSProperties['zIndex']),
                ...(isFull
                  ? { width: '100%', height: '100%' }
                  : { width: '100%', maxWidth: maxWidth ? undefined : MAX_WIDTH[size as keyof typeof MAX_WIDTH] }),
              }}
            >
              {/* Header */}
              {(title || !hideCloseButton) && (
                <div
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    padding:        'var(--space-4) var(--space-6)',
                    background:     'var(--theme-paper-subtle)',
                    borderBottom:   '1px solid var(--theme-paper-border)',
                    flexShrink:     0,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {title && (
                      <h2
                        id={titleId}
                        style={{
                          fontFamily:  'var(--font-sans)',
                          fontSize:    'var(--text-base)',
                          fontWeight:  'var(--weight-semibold)',
                          color:       'var(--theme-text-primary)',
                          margin:      0,
                          lineHeight:  'var(--leading-snug)',
                        }}
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p
                        id={descId}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize:   'var(--text-sm)',
                          color:      'var(--theme-text-secondary)',
                          margin:     '0.25rem 0 0',
                        }}
                      >
                        {description}
                      </p>
                    )}
                  </div>

                  {!hideCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close dialog"
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          '1.75rem',
                        height:         '1.75rem',
                        border:         '1px solid var(--theme-paper-border)',
                        borderRadius:   'var(--radius-sm)',
                        background:     'transparent',
                        color:          'var(--theme-text-tertiary)',
                        cursor:         'pointer',
                        transition:     'var(--transition-hover)',
                        flexShrink:     0,
                        marginLeft:     'var(--space-4)',
                      }}
                    >
                      <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/* Body */}
              <div
                style={{
                  flex:       1,
                  overflow:   'auto',
                  padding:    'var(--space-5) var(--space-6)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-primary)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div
                  style={{
                    display:        'flex',
                    justifyContent: 'flex-end',
                    gap:            'var(--space-3)',
                    padding:        'var(--space-4) var(--space-6)',
                    borderTop:      '1px solid var(--theme-paper-border)',
                    flexShrink:     0,
                  }}
                >
                  {footer}
                </div>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
