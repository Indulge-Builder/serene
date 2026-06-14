'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MODAL_VARIANTS } from '@/lib/constants/motion';

// ─────────────────────────────────────────────
// DrillModalShell — a centered modal that stacks ABOVE the founder deck.
//
// The deck is a full Dialog at --z-modal (60). A drill-down opened on top of it
// must use the nested-modal z contract (root CLAUDE.md "Confirm dialog
// stacking"): backdrop --z-modal-overlay (61), panel --z-modal-nested (62).
// A vanilla <Dialog> hardcodes --z-overlay/--z-modal and would render co-planar
// with the deck, so the three drill modals share this thin shell instead.
//
// Portaled to document.body (Framer transform-escape, like ConfirmDialog).
// Display-only chrome — the caller owns the body content + its own fetch.
// ─────────────────────────────────────────────

export interface DrillModalShellProps {
  open: boolean;
  title: string;
  /** Optional sub-line under the title (e.g. "showing N most recent"). */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function DrillModalShell({ open, title, subtitle, onClose, children }: DrillModalShellProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drill-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--overlay-bg-light)',
              zIndex: ('var(--z-modal-overlay)' as React.CSSProperties['zIndex']),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4)',
            }}
          >
            <motion.div
              key="drill-panel"
              role="dialog"
              aria-modal="true"
              variants={MODAL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '560px',
                maxHeight: 'min(80dvh, 720px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--theme-paper)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-4)',
                overflow: 'hidden',
                zIndex: ('var(--z-modal-nested)' as React.CSSProperties['zIndex']),
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-4) var(--space-6)',
                  background: 'var(--theme-paper-subtle)',
                  borderBottom: '1px solid var(--theme-paper-border)',
                  flexShrink: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--text-base)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--theme-text-primary)',
                      margin: 0,
                      lineHeight: 'var(--leading-snug)',
                    }}
                  >
                    {title}
                  </h2>
                  {subtitle && (
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--theme-text-tertiary)',
                        margin: '0.2rem 0 0',
                      }}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="serene-pressable serene-icon-rotate-hover serene-touch"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.75rem',
                    height: '1.75rem',
                    border: '1px solid var(--theme-paper-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--theme-text-tertiary)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: 'var(--space-4)',
                  }}
                >
                  <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)' }}>
                {children}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
