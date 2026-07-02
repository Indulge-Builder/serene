'use client';

import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { BASE_DURATION, EASE_OUT_EXPO, FAST_DURATION } from '@/lib/constants/motion';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: React.ReactNode;
  /** Default 'Confirm'. */
  confirmLabel?: string;
  /** Shown on the confirm button while `pending`. Default `${confirmLabel}…`. */
  pendingLabel?: string;
  /** Default 'Cancel'. */
  cancelLabel?: string;
  /** Destructive styling on the confirm button (danger tokens). */
  danger?: boolean;
  /** Disables both buttons and the backdrop dismiss while the action runs. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Stable AnimatePresence key — pass when multiple dialogs can coexist. */
  dialogKey?: string;
};

/**
 * THE canonical standalone confirm dialog. Owns the document.body portal
 * (escapes Framer Motion transform containing blocks) and the documented
 * z-index contract for standalone confirms: backdrop --z-overlay (50),
 * panel --z-modal (60). `--z-modal-overlay` (61) is reserved for nested
 * modals only — see CLAUDE.md Pattern Notes ("Confirm dialog stacking").
 *
 * Exactly two actions, always. Feature code keeps only the open state and
 * the confirm handler — never re-implement this chrome.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  pendingLabel,
  cancelLabel = 'Cancel',
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
  dialogKey = 'confirm',
}: ConfirmDialogProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key={`${dialogKey}-backdrop`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FAST_DURATION }}
            onClick={(e) => {
              e.stopPropagation();
              if (!pending) onCancel();
            }}
            style={{
              position:   'fixed',
              inset:      0,
              background: 'var(--overlay-bg-light)',
              zIndex:     'var(--z-overlay)' as React.CSSProperties['zIndex'],
            }}
          />
          <motion.div
            key={`${dialogKey}-dialog`}
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:     'fixed',
              top:          '50%',
              left:         '50%',
              transform:    'translate(-50%, -50%)',
              zIndex:       'var(--z-modal)' as React.CSSProperties['zIndex'],
              background:   'var(--theme-paper)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    'var(--shadow-4)',
              width:        'min(420px, calc(100vw - var(--space-8)))',
              padding:      'var(--space-6)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize:   'var(--text-lg)',
                fontWeight: 'var(--weight-semibold)',
                color:      'var(--theme-text-primary)',
                margin:     '0 0 var(--space-2)',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-secondary)',
                margin:     '0 0 var(--space-5)',
                lineHeight: 1.5,
              }}
            >
              {body}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                disabled={pending}
                style={{
                  padding:      'var(--space-2) var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border:       '1px solid var(--theme-paper-border)',
                  background:   'transparent',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-sm)',
                  color:        'var(--theme-text-secondary)',
                  cursor:       pending ? 'not-allowed' : 'pointer',
                  opacity:      pending ? 0.5 : 1,
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirm();
                }}
                disabled={pending}
                style={{
                  padding:      'var(--space-2) var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border:       'none',
                  background:   pending
                    ? (danger ? 'var(--color-danger-light)' : 'var(--theme-accent-surface)')
                    : (danger ? 'var(--color-danger)' : 'var(--theme-accent)'),
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-sm)',
                  fontWeight:   'var(--weight-semibold)',
                  color:        pending
                    ? (danger ? 'var(--color-danger-text)' : 'var(--theme-accent)')
                    : (danger ? 'var(--color-danger-fg)' : 'var(--theme-accent-fg)'),
                  cursor:       pending ? 'not-allowed' : 'pointer',
                  transition:   'var(--transition-interactive)',
                }}
              >
                {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
