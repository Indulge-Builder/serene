'use client';

// Display-only chat bubble (A-06). User bubbles sit right on the accent wash;
// Elaya bubbles sit left on --neu-surface-high (mirrors the WhatsApp bubble
// surface contract). 20px radius with the sender-side corner tightened to a
// 6px tail — the DESIGN-DNA §15.4 "tail detail" (one scale, V-07); the paired
// chip shadow (--neu-shadow-chip) gives the gentle lift the soft-UI spec calls for.
// `showGlyph` mounts Elaya's breathing mark on her charcoal disc beside her
// bubbles (her presence, not an avatar; a static glyph = absent).
// `below` (2026-09-29, the admin chats page) is a line under the bubble on the
// sender's side: the time, the channel, what she called, a Correct button.

import type { ReactNode } from 'react';
import { m as motion } from 'framer-motion';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { ElayaGlyphDisc } from '@/components/ui/elaya-glyph';
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
  below,
}: {
  message: ElayaUiMessage;
  showGlyph?: boolean;
  below?: ReactNode;
}) {
  const isUser = message.role === 'user';
  const width = 'max-w-[82%] md:max-w-[72%]';
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 'var(--space-3)' }}
    >
      {!isUser && showGlyph && (
        <span aria-hidden="true" style={{ display: 'inline-flex', marginTop: '0.1rem' }}>
          <ElayaGlyphDisc size={28} glyphSize={16} />
        </span>
      )}
      {wrapBelow(isUser, width, below, <div
        className={below ? undefined : width}
        style={{
          // User floats on the accent wash (--neu-chat-user-bg — lifted-accent
          // wash under [data-neu="dark"]); Elaya on the raised high surface
          // (chip shadow only — the hairline came off all chat bubbles in the
          // 2026-08-29 design pass, never inset).
          background: isUser
            ? 'var(--neu-chat-user-bg)'
            : 'var(--neu-surface-high)',
          // Refined asymmetric radius — the corner nearest the sender's edge is
          // tighter, the chat-bubble convention (one scale, V-07).
          borderRadius: isUser
            ? '20px 20px 6px 20px'
            : '20px 20px 20px 6px',
          boxShadow: 'var(--neu-shadow-chip)',
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
      </div>)}
    </motion.div>
  );
}

/** With a `below` line, the bubble and the line share one column on the sender's side. */
function wrapBelow(isUser: boolean, width: string, below: ReactNode, bubble: ReactNode) {
  if (below == null) return bubble;
  return (
    <div
      className={`${width} flex flex-col`}
      style={{ gap: 'var(--space-1)', alignItems: isUser ? 'flex-end' : 'flex-start', minWidth: 0 }}
    >
      {bubble}
      {below}
    </div>
  );
}
