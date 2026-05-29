'use client';

import React from 'react';
import { Dialog, DialogSize } from './Dialog';
import { Button } from './Button';
import { LiaGlyph } from './lia-glyph';

export type ModalType = 'standard' | 'lia';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Footer slot — for standard type. Lia type enforces Approve / Dismiss only. */
  footer?: React.ReactNode;
  size?: DialogSize;
  /**
   * Tailwind max-width class for backward compatibility with existing callers
   * that pass maxWidth="max-w-lg" etc. Overrides the size prop when provided.
   */
  maxWidth?: string;
  type?: ModalType;
  /** Lia-type only: called when user approves */
  onApprove?: () => void;
  /** Lia-type only: called when user dismisses */
  onDismiss?: () => void;
  approveLabel?: string;
  dismissLabel?: string;
}

/**
 * Semantic wrapper around Dialog.
 * - Standard: exposes title, description, footer slots.
 * - Lia (type="lia"): enforces exactly two actions — Approve and Dismiss.
 *   The Lia constraint comes from the design spec: "Proposal cards always have
 *   exactly two actions: Approve and Dismiss."
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  maxWidth,
  type = 'standard',
  onApprove,
  onDismiss,
  approveLabel = 'Approve',
  dismissLabel = 'Dismiss',
}: ModalProps) {
  const resolvedFooter =
    type === 'lia' ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
        <LiaGlyph size={20} breathing />
        <div style={{ flex: 1 }} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { onDismiss?.(); onClose(); }}
        >
          {dismissLabel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { onApprove?.(); onClose(); }}
        >
          {approveLabel}
        </Button>
      </div>
    ) : (
      footer
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      maxWidth={maxWidth}
      footer={resolvedFooter}
    >
      {children}
    </Dialog>
  );
}
