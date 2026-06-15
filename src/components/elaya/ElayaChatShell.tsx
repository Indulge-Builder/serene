'use client';

// Elaya chat surface — owns transcript state, the SSE consumption loop, and the
// composer. Streams from POST /api/elaya/chat (the sanctioned Elaya route).
// Cap + session expiry are server-enforced; everything here is presentation.
// Also composes the right 340px identity rail (ElayaIdentityCard) so the
// starter-prompt prefill shares the composer state. The grid flex-fills the
// page main (no fixed dvh math) so the chat takes the full remaining height.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ElayaGlyph } from '@/components/ui/elaya-glyph';
import { MessageBar } from '@/components/ui/MessageBar';
import { DictationButton } from '@/components/ui/DictationButton';
import { useToast } from '@/hooks/useToast';
import { scrollToBottom } from '@/lib/utils/scroll';
import { formErrors } from '@/lib/validations/form-errors';
import { ElayaIdentityCard } from '@/components/elaya/ElayaIdentityCard';
import { ElayaMessageBubble, type ElayaUiMessage } from '@/components/elaya/ElayaMessageBubble';

type SseEvent =
  | { type: 'meta'; conversationId: string; remainingToday: number }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; message: string };

const TOOL_STATUS_LABELS: Record<string, string> = {
  search_leads: 'Looking through your leads…',
  get_lead_details: 'Opening the lead…',
  get_my_tasks: 'Checking your tasks…',
  search_deals: 'Going through deals…',
  get_performance_snapshot: 'Pulling your numbers…',
  get_helpdesk_content: 'Browsing the case library…',
};

type Props = {
  conversationId: string;
  initialMessages: ElayaUiMessage[];
  /** Server-computed deterministic greeting shown when the transcript is empty. */
  greeting: string;
  remainingToday: number;
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
      const res = await fetch('/api/elaya/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, conversationId: activeConversationId }),
      });

      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; capReached?: boolean }
          | null;
        if (payload?.capReached) setRemaining(0);
        // Never clear the user's text on a rejected send — restore it.
        setMessages((prev) => prev.filter((msg) => msg.id !== localId && msg.id !== assistantId));
        setInput(content);
        toast.danger(payload?.error ?? formErrors.elayaUnavailable);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');

          if (!frame.startsWith('data: ')) continue;
          let event: SseEvent;
          try {
            event = JSON.parse(frame.slice(6)) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === 'meta') {
            setActiveConversationId(event.conversationId);
            setRemaining(event.remainingToday);
          } else if (event.type === 'delta') {
            setToolStatus(null);
            appendDelta(event.text);
          } else if (event.type === 'tool') {
            setToolStatus(TOOL_STATUS_LABELS[event.name] ?? 'Checking Serene…');
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantId ? { ...msg, pending: false } : msg)),
            );
          } else if (event.type === 'error') {
            toast.danger(event.message);
            setMessages((prev) =>
              prev.filter((msg) => !(msg.id === assistantId && msg.content.length === 0)),
            );
          }
        }
      }
    } catch {
      toast.danger(formErrors.elayaUnavailable);
      setMessages((prev) =>
        prev.filter((msg) => !(msg.id === assistantId && msg.content.length === 0)),
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
          <span
            className="flex items-center justify-center"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--theme-accent-surface)',
              border: '1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent)',
              boxShadow: 'var(--shadow-accent-glow)',
              color: 'var(--theme-accent)',
              flexShrink: 0,
            }}
          >
            <ElayaGlyph size={22} />
          </span>
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
              {statusLine ?? 'With you'}
            </span>
          </div>
          {capReached && (
            <span
              className={onClose ? '' : 'ml-auto'}
              style={{
                marginLeft: onClose ? undefined : 'auto',
                fontSize: 'var(--text-2xs)',
                whiteSpace: 'nowrap',
                color: 'var(--color-warning)',
              }}
            >
              Daily limit reached
            </span>
          )}
          {onClose && (
            <button
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
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--theme-paper-border)',
                background: 'transparent',
                color: 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                flexShrink: 0,
                transition:
                  'var(--transition-hover), transform var(--duration-instant) var(--ease-spring)',
              }}
            >
              <X style={{ width: 16, height: 16, strokeWidth: 1.5 }} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Transcript — centered reading column so messages never sprawl. */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
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
              msg.content.length === 0 && msg.pending ? null : (
                <ElayaMessageBubble key={msg.id} message={msg} showGlyph />
              ),
            )}
            {statusLine && (
              <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--theme-accent)', display: 'flex', flexShrink: 0 }}>
                  <ElayaGlyph size={14} />
                </span>
                <span
                  className="italic"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--theme-text-tertiary)',
                  }}
                >
                  {statusLine}
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

      {/* Identity sidebar — right 340px column on lg (the canonical dossier
          placement), stacked below the chat on smaller viewports. Omitted in
          the floating widget (chat-only) — there the chat fills the modal. */}
      {!chatOnly && (
        <ElayaIdentityCard busy={isStreaming || capReached} onPromptSelect={handlePromptSelect} />
      )}
    </div>
  );
}
