'use client';

// Display-only chat bubble (A-06). User bubbles sit right on --theme-accent-surface;
// Elaya bubbles sit left on --theme-paper-subtle (mirrors the WhatsApp bubble
// surface contract). Radius scale is --radius-lg with the sender-side corner
// tightened to --radius-xs — the DESIGN-DNA §15.4 "tail detail" (one scale, V-07);
// a hairline shadow (--shadow-1) gives the gentle lift the DNA spec calls for.
// `showGlyph` renders Elaya's breathing mark in a soft accent disc beside her
// bubbles (her presence, not an avatar; a static glyph = absent).

import { m as motion } from 'framer-motion';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { ElayaGlyph } from '@/components/ui/elaya-glyph';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export type ElayaUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
};

export function ElayaMessageBubble({
  message,
  showGlyph = false,
}: {
  message: ElayaUiMessage;
  showGlyph?: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 'var(--space-3)' }}
    >
      {!isUser && showGlyph && (
        <span
          aria-hidden="true"
          className="flex items-center justify-center"
          style={{
            color: 'var(--theme-accent)',
            flexShrink: 0,
            width: '28px',
            height: '28px',
            marginTop: '0.1rem',
            borderRadius: 'var(--radius-full)',
            background: 'var(--theme-accent-surface)',
            border: '1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent)',
          }}
        >
          <ElayaGlyph size={16} />
        </span>
      )}
      <div
        className="max-w-[82%] md:max-w-[72%]"
        style={{
          background: isUser ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
          border: isUser
            ? '1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)'
            : '1px solid var(--theme-paper-border)',
          // Refined asymmetric radius — the corner nearest the sender's edge is
          // tighter, the chat-bubble convention (one radius value, V-07).
          borderRadius: isUser
            ? 'var(--radius-lg) var(--radius-lg) var(--radius-xs) var(--radius-lg)'
            : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-xs)',
          boxShadow: 'var(--shadow-1)',
          padding: 'var(--space-3) var(--space-4)',
          color: 'var(--theme-text-primary)',
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-relaxed)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          opacity: message.pending ? 0.75 : 1,
        }}
      >
        {isUser ? message.content : <ChatMarkdown content={message.content} />}
      </div>
    </motion.div>
  );
}
