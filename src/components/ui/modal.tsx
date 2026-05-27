'use client';

import { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  maxWidth?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1],
            }}
            onClick={onClose}
            style={{
              position:        'fixed',
              inset:           0,
              background:      'rgba(0,0,0,0.5)',
              backdropFilter:  'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              zIndex:          'var(--z-overlay)' as React.CSSProperties['zIndex'],
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              padding:         'var(--space-4)',
            }}
          >
            {/* Container */}
            <motion.div
              key="modal-container"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              variants={{
                hidden: { opacity: 0, y: 10, scale: 0.98 },
                visible: {
                  opacity: 1, y: 0, scale: 1,
                  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                },
                exit: {
                  opacity: 0, scale: 0.97,
                  transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
                },
              }}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className={`w-full ${maxWidth}`}
              style={{
                background:   'var(--theme-paper)',
                borderRadius: 'var(--radius-lg)',
                boxShadow:    'var(--shadow-3)',
                zIndex:       'var(--z-modal)' as React.CSSProperties['zIndex'],
                overflow:     'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  padding:        'var(--space-4) var(--space-6)',
                  background:     'var(--theme-paper-subtle)',
                  borderBottom:   '1px solid var(--theme-paper-border)',
                }}
              >
                <h2
                  id={titleId}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize:   'var(--text-base)',
                    fontWeight: 'var(--weight-semibold)',
                    color:      'var(--theme-text-primary)',
                    margin:     0,
                  }}
                >
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
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
                  }}
                >
                  <X style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
                </button>
              </div>

              {/* Body */}
              <div
                style={{
                  padding:    'var(--space-5) var(--space-6)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-primary)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                {children}
              </div>

              {/* Footer */}
              <div
                style={{
                  display:        'flex',
                  justifyContent: 'flex-end',
                  gap:            'var(--space-3)',
                  padding:        'var(--space-4) var(--space-6)',
                  borderTop:      '1px solid var(--theme-paper-border)',
                }}
              >
                {footer}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
