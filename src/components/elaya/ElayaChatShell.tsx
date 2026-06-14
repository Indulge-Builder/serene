'use client';

// Elaya chat surface — owns transcript state, the SSE consumption loop, and the
// composer. Streams from POST /api/elaya/chat (the sanctioned Elaya route).
// Cap + session expiry are server-enforced; everything here is presentation.
// Also composes the right 340px identity rail (ElayaIdentityCard) so the
// starter-prompt prefill shares the composer state. The grid flex-fills the
// page main (no fixed dvh math) so the chat takes the full remaining height.

import { useEffect, useRef, useState } from 'react';
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
};

export function ElayaChatShell({
  conversationId,
  initialMessages,
  greeting,
  remainingToday,
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

  return (
    <div className="serene-dossier-grid serene-dossier-grid--340 flex-1" style={{ minHeight: 0 }}>
      <div
        className="flex flex-col rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
        style={{ minHeight: '420px' }}
      >
        {/* Presence header — the glyph always breathes while Elaya is present */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: '1px solid var(--theme-paper-border)' }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--theme-accent-surface)',
              color: 'var(--theme-accent)',
              flexShrink: 0,
            }}
          >
            <ElayaGlyph size={20} />
          </span>
          <div className="flex flex-col min-w-0">
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-medium)',
                color: 'var(--theme-text-primary)',
              }}
            >
              Elaya
            </span>
            <span
              className="truncate"
              style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}
            >
              {statusLine ?? 'With you'}
            </span>
          </div>
          {capReached && (
            <span
              className="ml-auto"
              style={{
                fontSize: 'var(--text-2xs)',
                whiteSpace: 'nowrap',
                color: 'var(--color-warning)',
              }}
            >
              Daily limit reached
            </span>
          )}
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
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

        {/* Composer */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--theme-paper-border)' }}>
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

      {/* Identity sidebar — right 340px column on lg (the canonical dossier
          placement), stacked below the chat on smaller viewports */}
      <ElayaIdentityCard busy={isStreaming || capReached} onPromptSelect={handlePromptSelect} />
    </div>
  );
}
