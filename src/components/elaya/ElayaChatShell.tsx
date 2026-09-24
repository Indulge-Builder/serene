'use client';

// Elaya chat surface — owns transcript state, the SSE consumption loop, and the
// composer. Streams from POST /api/elaya/chat (the sanctioned Elaya route).
// Cap + session expiry are server-enforced; everything here is presentation.
// Also composes the right 340px identity rail (ElayaIdentityCard) so the
// starter-prompt prefill shares the composer state. The grid flex-fills the
// page main (no fixed dvh math) so the chat takes the full remaining height.

import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ElayaGlyphDisc } from '@/components/ui/elaya-glyph';
import { MessageBar } from '@/components/ui/MessageBar';
import { DictationButton } from '@/components/ui/DictationButton';
import { useToast } from '@/hooks/useToast';
import { scrollToBottom } from '@/lib/utils/scroll';
import { formErrors } from '@/lib/validations/form-errors';
import { ElayaIdentityCard } from '@/components/elaya/ElayaIdentityCard';
import type { ElayaViewer } from '@/lib/constants/elaya';
import { ElayaFeedbackCard } from '@/components/elaya/ElayaFeedbackCard';
import { ElayaMessageBubble, type ElayaUiMessage } from '@/components/elaya/ElayaMessageBubble';
import { streamElayaChat, toolStatusLabel } from '@/components/elaya/elaya-stream';
import { ElayaStatusText } from '@/components/elaya/ElayaStatusText';

type Props = {
  conversationId: string;
  initialMessages: ElayaUiMessage[];
  /** Server-computed deterministic greeting shown when the transcript is empty. */
  greeting: string;
  remainingToday: number;
  /** Who is looking (role + domain): the identity card's starters and reach follow it. Optional for embedded surfaces. */
  viewer?: ElayaViewer | null;
  /**
   * Chat-only mode — omits the ElayaIdentityCard sidebar and the dossier grid,
   * so the chat card fills its container. Used by the floating Elaya widget
   * (the modal is tight; the page keeps the identity rail). Default false →
   * byte-identical to the /elaya page. The chat surface itself never diverges.
   */
  hideIdentity?: boolean;
  /**
   * Embedded mode — the chat is the modal surface itself, not a card inside one.
   * Strips the card's own border/shadow/radius/min-height so it sits flush
   * against the host chrome (the floating widget's Dialog panel) — no
   * card-in-a-card. Implies the chat-only layout. Default false (the /elaya
   * page is a free-standing card).
   */
  embedded?: boolean;
  /**
   * When provided, the presence header shows a close affordance (DESIGN-DNA
   * §15.3 Surface A anatomy). The /elaya page omits it (no close there); the
   * widget passes its modal close.
   */
  onClose?: () => void;
};

export function ElayaChatShell({
  conversationId,
  initialMessages,
  greeting,
  remainingToday,
  hideIdentity = false,
  embedded = false,
  onClose,
  viewer,
}: Props) {
  const toast = useToast;
  const [messages, setMessages] = useState<ElayaUiMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);
  const [activeConversationId, setActiveConversationId] = useState(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const counterRef = useRef(0);

  // Voice dictation — the transcript lands in the composer as an editable draft
  // (never auto-sent), then focus. NEVER auto-sends — the user reviews and
  // presses send, so a garbled transcript can never reach the brain unreviewed.
  // The mic/stop/cancel cluster + record→transcribe flow live in DictationButton.
  function handleTranscript(text: string) {
    setInput((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')} ${text}` : text));
    composerRef.current?.focus();
  }

  useEffect(() => {
    if (scrollRef.current) scrollToBottom(scrollRef.current);
  }, [messages, toolStatus]);

  const capReached = remaining <= 0;
  // First-token wait — the assistant bubble exists but has nothing to say yet.
  const awaitingFirstToken =
    isStreaming && messages.some((msg) => msg.pending && msg.content.length === 0);
  const statusLine = toolStatus ?? (awaitingFirstToken ? 'Thinking…' : null);

  function handlePromptSelect(prompt: string) {
    setInput(prompt);
    composerRef.current?.focus();
  }

  async function send() {
    const content = input.trim();
    if (content.length === 0 || isStreaming || capReached) return;

    counterRef.current += 1;
    const localId = `local-${counterRef.current}`;
    const assistantId = `${localId}-assistant`;

    setMessages((prev) => [
      ...prev,
      { id: localId, role: 'user', content },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setInput('');
    setIsStreaming(true);
    setToolStatus(null);

    const appendDelta = (text: string) =>
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + text } : msg,
        ),
      );

    try {
      // THE shared SSE transport (elaya-stream.ts) — the mobile ElayaChatScreen
      // pumps the identical loop; this shell owns only the state handlers.
      await streamElayaChat(
        { message: content, conversationId: activeConversationId },
        {
          onRejected: ({ error, capReached }) => {
            if (capReached) setRemaining(0);
            // Never clear the user's text on a rejected send — restore it.
            setMessages((prev) =>
              prev.filter((msg) => msg.id !== localId && msg.id !== assistantId),
            );
            setInput(content);
            toast.danger(error ?? formErrors.elayaUnavailable);
          },
          onMeta: ({ conversationId: id, remainingToday: left }) => {
            setActiveConversationId(id);
            setRemaining(left);
          },
          onDelta: (text) => {
            setToolStatus(null);
            appendDelta(text);
          },
          onTool: (name) => setToolStatus(toolStatusLabel(name)),
          onDone: () => {
            // Unflag pending — but DROP the bubble entirely if the final reply is
            // empty/whitespace-only (a blank bubble would otherwise render once
            // pending clears; the render guard only hides empty WHILE pending).
            setMessages((prev) =>
              prev.flatMap((msg) => {
                if (msg.id !== assistantId) return [msg];
                if (msg.content.trim().length === 0) return [];
                return [{ ...msg, pending: false }];
              }),
            );
          },
          onStreamError: (message) => {
            toast.danger(message);
            setMessages((prev) =>
              prev.filter((msg) => !(msg.id === assistantId && msg.content.trim().length === 0)),
            );
          },
        },
      );
    } catch {
      toast.danger(formErrors.elayaUnavailable);
      setMessages((prev) =>
        prev.filter((msg) => !(msg.id === assistantId && msg.content.trim().length === 0)),
      );
    } finally {
      setToolStatus(null);
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantId ? { ...msg, pending: false } : msg)),
      );
    }
  }

  // Embedded mode is chat-only by definition.
  const chatOnly = hideIdentity || embedded;

  return (
    <div
      className={
        chatOnly
          ? 'flex-1 flex flex-col'
          : 'serene-dossier-grid serene-dossier-grid--340 flex-1'
      }
      style={{ minHeight: 0 }}
    >
      <div
        className={
          embedded
            ? 'flex flex-col flex-1 bg-(--theme-paper)'
            : 'flex flex-col flex-1 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)'
        }
        style={embedded ? { minHeight: 0 } : { minHeight: '420px' }}
      >
        {/* Presence header (DESIGN-DNA §15.3 Surface A) — the glyph always
            breathes with her signature accent glow while Elaya is present. */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--theme-paper-border)' }}
        >
          <ElayaGlyphDisc size={40} glyphSize={22} />
          <div className="flex flex-col min-w-0">
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
              Elaya
            </span>
            <span
              className="truncate italic"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--theme-text-tertiary)',
              }}
            >
              <ElayaStatusText text={statusLine ?? 'With you'} />
            </span>
          </div>
          {capReached && (
            <span
              className={onClose ? '' : 'ml-auto'}
              style={{
                marginLeft: onClose ? undefined : 'auto',
                fontSize: 'var(--text-2xs)',
                whiteSpace: 'nowrap',
                color: "var(--color-warning-text)",
              }}
            >
              Daily limit reached
            </span>
          )}
          {onClose && (
            <Button
              variant="ghost"
              iconOnly size="sm"
              type="button"
              onClick={onClose}
              aria-label="Close Elaya"
              className="serene-pressable serene-icon-rotate-hover serene-touch"
              style={{
                marginLeft: capReached ? 'var(--space-3)' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.75rem',
                height: '1.75rem',
                flexShrink: 0,
              }}
            >
              <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Transcript — centered reading column so messages never sprawl. */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-6"
          role="log"
          aria-live="polite"
          aria-label="Conversation with Elaya"
        >
          <div
            className="flex flex-col mx-auto w-full"
            style={{ gap: 'var(--space-4)', maxWidth: '46rem' }}
          >
            {messages.length === 0 && (
              <ElayaMessageBubble
                message={{ id: 'greeting', role: 'assistant', content: greeting }}
                showGlyph
              />
            )}
            {messages.map((msg) =>
              msg.content.trim().length === 0 && msg.pending ? null : (
                <ElayaMessageBubble key={msg.id} message={msg} showGlyph />
              ),
            )}
            {statusLine && (
              <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                {/* While she thinks the charcoal disc's mark TURNS (8s/rev,
                    logo-motion handoff) — 28px to sit on the same rail as the
                    message-bubble glyphs. */}
                <ElayaGlyphDisc size={28} thinking />
                <span
                  className="italic"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--theme-text-tertiary)',
                  }}
                >
                  <ElayaStatusText text={statusLine} />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Composer — same centered reading column as the transcript. */}
        <div
          className="px-5 py-4 sm:px-6"
          style={{
            borderTop: '1px solid var(--theme-paper-border)',
            background: 'var(--theme-paper)',
          }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: '46rem' }}>
            {capReached ? (
              <p
                className="italic m-0"
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--theme-text-tertiary)',
                }}
              >
                {formErrors.elayaCapReached}
              </p>
            ) : (
              <MessageBar
                ref={composerRef}
                value={input}
                onChange={setInput}
                onSend={() => void send()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                loading={isStreaming}
                maxLength={4000}
                placeholder="Ask Elaya"
                leadingSlot={
                  <DictationButton
                    onTranscript={handleTranscript}
                    onError={(message) => toast.danger(message)}
                    disabled={isStreaming || capReached}
                    what="a message"
                  />
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Right 340px column on lg (the canonical dossier placement), stacked
          below the chat on smaller viewports. The feedback card sits on top of
          the identity card — so the stack reads chat → feedback → identity once
          the grid collapses to one column on mobile. Omitted in the floating
          widget (chat-only) — there the chat fills the modal. */}
      {!chatOnly && (
        <div className="flex flex-col" style={{ gap: 'var(--space-6)', minHeight: 0 }}>
          <ElayaFeedbackCard />
          <ElayaIdentityCard busy={isStreaming || capReached} onPromptSelect={handlePromptSelect} viewer={viewer ?? null} />
        </div>
      )}
    </div>
  );
}
