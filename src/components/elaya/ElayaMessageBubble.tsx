'use client';

// Display-only chat bubble (A-06). User bubbles sit right on --theme-accent-surface;
// Elaya bubbles sit left on --theme-paper-subtle (mirrors the WhatsApp bubble
// surface contract). One radius per component (V-07): --radius-lg.

import { m as motion } from 'framer-motion';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export type ElayaUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
};

export function ElayaMessageBubble({ message }: { message: ElayaUiMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className="max-w-[82%] md:max-w-[68%]"
        style={{
          background: isUser ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          border: '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3) var(--space-4)',
          color: 'var(--theme-text-primary)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          opacity: message.pending ? 0.75 : 1,
        }}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
