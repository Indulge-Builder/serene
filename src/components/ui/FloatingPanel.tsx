'use client';

import { useModalScope } from '@/hooks/useModalFocus';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  DROPDOWN_VARIANTS,
  DROPDOWN_VARIANTS_UP,
  FLIP_UP_TRANSFORM_TEMPLATE,
} from '@/lib/constants/motion';
import type { PortalAnchorPosition } from '@/hooks/usePortalAnchor';

type FloatingPanelProps = {
  open: boolean;
  mounted: boolean;
  position: PortalAnchorPosition;
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Stable AnimatePresence key — pass when multiple panels can coexist. */
  panelKey?: string;
  /** Merged over the default paper chrome (layout extras, width overrides…). */
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * THE canonical anchored floating panel. Owns the document.body portal
 * (escapes Framer Motion transform containing blocks — see CLAUDE.md
 * Pattern Notes), the DROPDOWN_VARIANTS entrance, the flip-up transform,
 * and the paper dropdown chrome (--z-dropdown, --shadow-3).
 *
 * Always drive it with usePortalAnchor:
 *
 *   const anchor = usePortalAnchor();
 *   <button ref={anchor.triggerRef} onClick={anchor.toggle}>…</button>
 *   <FloatingPanel {...anchor.panelProps}>…</FloatingPanel>
 */
export function FloatingPanel({
  open,
  mounted,
  position,
  panelRef,
  panelKey = 'floating-panel',
  style,
  children,
}: FloatingPanelProps) {
  const modalScope = useModalScope();
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          data-modal-owner={modalScope}
          key={panelKey}
          variants={position.flipUp ? DROPDOWN_VARIANTS_UP : DROPDOWN_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          // flip-up shift via transformTemplate — a style.transform string
          // would be clobbered by the animated y (see motion.ts)
          transformTemplate={position.flipUp ? FLIP_UP_TRANSFORM_TEMPLATE : undefined}
          style={{
            position:     'fixed',
            top:          position.top,
            left:         position.left,
            zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
            // Floating panels ride the raised-lg pair on the high surface
            // with the 1px white hairline (neumorphic Rule 2).
            background:   'var(--neu-surface-high)',
            border:       '1px solid var(--neu-edge)',
            borderRadius: 'var(--neu-radius-panel)',
            boxShadow:    'var(--neu-shadow-raised-lg)',
            padding:      'var(--space-4)',
            ...style,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
