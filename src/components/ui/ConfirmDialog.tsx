'use client';

import { useEffect, useId, useRef } from 'react';
import { ModalScopeContext, useModalFocus } from '@/hooks/useModalFocus';
import { lockBodyScroll } from '@/lib/utils/scroll';
import { Button } from '@/components/ui/Button';
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const scopeId = useModalFocus(open, panelRef, onCancel, !pending);
  useEffect(() => { if (open) return lockBodyScroll(); }, [open]);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <ModalScopeContext.Provider value={scopeId}>
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
              background: 'var(--neu-scrim)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              zIndex:     'var(--z-overlay)' as React.CSSProperties['zIndex'],
            }}
          />
          <motion.div
            key={`${dialogKey}-dialog`}
            ref={panelRef}
            tabIndex={-1}
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            role="alertdialog"
            aria-modal="true"
            aria-busy={pending || undefined}
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
              background:   'var(--neu-surface-high)',
              border:       '1px solid var(--neu-edge)',
              borderRadius: 'var(--radius-xl)',
              boxShadow:    'var(--neu-shadow-modal)',
              width:        'min(420px, calc(100vw - var(--space-8)))',
              padding:      'var(--space-6)',
            }}
          >
            <h3 id={titleId}
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
            <div id={bodyId}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                color:      'var(--theme-text-secondary)',
                margin:     '0 0 var(--space-5)',
                lineHeight: 1.5,
              }}
            >
              {body}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                disabled={pending}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={danger ? "danger" : "primary"}
                loading={pending}
                loadingLabel={pendingLabel ?? `${confirmLabel}…`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirm();
                }}
                disabled={pending}
              >
                {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </ModalScopeContext.Provider>,
    document.body,
  );
}
