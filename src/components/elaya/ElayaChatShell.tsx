'use client';

// Elaya chat surface — owns transcript state, the SSE consumption loop, and the
// composer. Streams from POST /api/elaya/chat (the sanctioned Elaya route).
// Cap + session expiry are server-enforced; everything here is presentation.

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { LiaGlyph } from '@/components/ui/lia-glyph';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { scrollToBottom } from '@/lib/utils/scroll';
import { formErrors } from '@/lib/validations/form-errors';
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

export function ElayaChatShell({ conversationId, initialMessages, greeting, remainingToday }: Props) {
  const toast = useToast;
  const [messages, setMessages] = useState<ElayaUiMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);
  const [activeConversationId, setActiveConversationId] = useState(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    if (scrollRef.current) scrollToBottom(scrollRef.current);
  }, [messages, toolStatus]);

  const capReached = remaining <= 0;

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
            setToolStatus(TOOL_STATUS_LABELS[event.name] ?? 'Checking Eia…');
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
    <div
      className="flex flex-col rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
      style={{ height: 'calc(100dvh - 190px)', minHeight: '420px' }}
    >
      {/* Presence header — the glyph always breathes while Elaya is present */}
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: '1px solid var(--theme-paper-border)' }}
      >
        <span style={{ color: 'var(--theme-accent)' }}>
          <LiaGlyph size={22} breathing />
        </span>
        <div className="flex flex-col">
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--theme-text-primary)',
            }}
          >
            Elaya
          </span>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
            {toolStatus ?? (isStreaming ? 'Thinking…' : 'With you')}
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          {messages.length === 0 && (
            <ElayaMessageBubble message={{ id: 'greeting', role: 'assistant', content: greeting }} />
          )}
          {messages.map((msg) =>
            msg.content.length === 0 && msg.pending ? null : (
              <ElayaMessageBubble key={msg.id} message={msg} />
            ),
          )}
          {toolStatus && (
            <span
              className="italic"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-xs)',
                color: 'var(--theme-text-tertiary)',
              }}
            >
              {toolStatus}
            </span>
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
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={Math.min(3, Math.max(1, input.split('\n').length))}
              placeholder="Ask Elaya"
              maxLength={4000}
              className="eia-input flex-1 resize-none"
              style={{
                background: 'var(--theme-paper-subtle)',
                border: '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: 'var(--text-sm)',
                color: 'var(--theme-text-primary)',
                outline: 'none',
                caretColor: 'var(--theme-accent)',
              }}
            />
            <Button
              variant="primary"
              size="md"
              iconLeft={Send}
              loading={isStreaming}
              disabled={input.trim().length === 0}
              iconMotion="lift"
              onClick={() => void send()}
            >
              Send
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
