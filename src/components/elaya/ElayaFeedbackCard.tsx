'use client';

// Feedback card on /elaya — sits on top of the ElayaIdentityCard in the right
// rail (desktop) and between the chat and the identity card when the dossier
// grid stacks to one column (mobile: chat → feedback → identity).
//
// Display-only (A-06). It owns NO submit logic: the button opens the shared
// suggestion composer via useSuggestionFeedback() — the SAME modal/action/
// workflow the Sidebar "Send feedback" item and the mobile Elaya-card overlay
// already use (R-01, never a second feedback mechanism). The dashboard layout
// already wraps /elaya in SuggestionFeedbackProvider, so the hook is in scope.

import { m as motion } from 'framer-motion';
import { MessageSquarePlus } from 'lucide-react';
import { useSuggestionFeedback } from '@/components/suggestions/SuggestionFeedbackProvider';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export function ElayaFeedbackCard() {
  const { openComposer } = useSuggestionFeedback();

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      className="flex flex-col rounded-lg border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
      style={{ padding: 'var(--space-6)', gap: 'var(--space-4)' }}
    >
      <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
        <span
          className="flex items-center justify-center"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--theme-accent-surface)',
            color: 'var(--theme-accent)',
            flexShrink: 0,
          }}
        >
          <MessageSquarePlus style={{ width: 20, height: 20, strokeWidth: 1.5 }} aria-hidden="true" />
        </span>
        <div className="flex flex-col" style={{ gap: 'var(--space-1)' }}>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-normal)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--theme-text-primary)',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            Share your thoughts
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--theme-text-secondary)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            Spotted a bug or have an idea? Tell us — add a screenshot if it helps.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openComposer()}
        className="serene-pressable serene-icon-lift-hover w-full flex items-center justify-center border border-(--theme-paper-border) text-(--theme-text-secondary) hover:border-(--theme-accent-muted) hover:text-(--theme-text-primary)"
        style={{
          gap: 'var(--space-2)',
          background: 'transparent',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          transition: 'var(--transition-hover)',
        }}
      >
        <MessageSquarePlus style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
        Send feedback
      </button>
    </motion.section>
  );
}
