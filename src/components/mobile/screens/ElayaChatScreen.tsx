'use client';

import { Fab } from '@/components/mobile/buttons';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { scrollToBottom } from '@/lib/utils/scroll';
import { formErrors } from '@/lib/validations/form-errors';
import { ELAYA_STARTER_PROMPTS } from '@/lib/constants/elaya';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import {
  streamElayaChat,
  toolStatusLabel,
} from '@/components/elaya/elaya-stream';
import type { ElayaUiMessage } from '@/components/elaya/ElayaMessageBubble';
import { ElayaStatusText } from '@/components/elaya/ElayaStatusText';
import { IconKnob } from '../buttons';

/**
 * Elaya (§06) — the house, in conversation, on the REAL brain
 * (mobile-ops §10). Streams POST /api/elaya/chat through the shared
 * elaya-stream transport (the same loop ElayaChatShell pumps — never a
 * second transport). The neu chrome is unchanged: halo'd ✦ header, inset
 * date chip, raised Elaya bubbles (r 20/20/20/6), accent-grad user
 * bubbles (r 20/20/6/20, ink fg), typing dots, floating composer + send
 * knob. Her glyph always breathes while she is present.
 *
 * Starter chips prefill the composer and focus it — never auto-send
 * (the Elaya starter-prompt rule). Cap + session expiry are
 * server-enforced; everything here is presentation.
 */

const ELAYA_RADIUS = '20px 20px 20px 6px';
const USER_RADIUS = '20px 20px 6px 20px';

function TypingBubble({ statusLine }: { statusLine: string | null }) {
  return (
    <div className="self-start flex flex-col gap-1.5">
      <div
        className="flex gap-[5px] px-4 py-3 bg-(--neu-surface) border border-(--neu-edge-strong) w-fit"
        style={{ borderRadius: ELAYA_RADIUS, boxShadow: 'var(--neu-shadow-raised)' }}
      >
        {[0, 0.18, 0.36].map((delay) => (
          <span
            key={delay}
            className="neu-m-dot w-1.5 h-1.5 rounded-full bg-(--neu-text-tertiary)"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      {statusLine && (
        <span
          className="text-[11px] text-(--neu-text-tertiary) pl-1"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
        >
          <ElayaStatusText text={statusLine} />
        </span>
      )}
    </div>
  );
}

export type ElayaChatScreenProps = {
  conversationId: string;
  initialMessages: ElayaUiMessage[];
  /** Server-computed greeting shown as Elaya's opening line when the transcript is empty. */
  greeting: string;
  remainingToday: number;
};

export function ElayaChatScreen({
  conversationId,
  initialMessages,
  greeting,
  remainingToday,
}: ElayaChatScreenProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ElayaUiMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef(0);

  const capReached = remaining <= 0;
  const awaitingReply =
    isStreaming && messages.some((msg) => msg.pending && msg.content.length === 0);
  const statusLine = toolStatus ?? (awaitingReply ? 'Thinking…' : null);

  useEffect(() => {
    if (listRef.current) scrollToBottom(listRef.current);
  }, [messages, statusLine]);

  function prefill(prompt: string) {
    setDraft(prompt);
    inputRef.current?.focus();
  }

  async function send() {
    const content = draft.trim();
    if (content.length === 0 || isStreaming || capReached) return;

    counterRef.current += 1;
    const localId = `local-${counterRef.current}`;
    const assistantId = `${localId}-assistant`;

    setMessages((prev) => [
      ...prev,
      { id: localId, role: 'user', content },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setDraft('');
    setErrorLine(null);
    setIsStreaming(true);
    setToolStatus(null);

    const appendDelta = (text: string) =>
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + text } : msg,
        ),
      );

    const dropEmptyAssistant = () =>
      setMessages((prev) =>
        prev.filter((msg) => !(msg.id === assistantId && msg.content.trim().length === 0)),
      );

    try {
      await streamElayaChat(
        { message: content, conversationId: activeConversationId },
        {
          onRejected: ({ error, capReached: hitCap }) => {
            if (hitCap) setRemaining(0);
            // Never clear the user's text on a rejected send — restore it.
            setMessages((prev) =>
              prev.filter((msg) => msg.id !== localId && msg.id !== assistantId),
            );
            setDraft(content);
            setErrorLine(error ?? formErrors.elayaUnavailable);
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
            setMessages((prev) =>
              prev.flatMap((msg) => {
                if (msg.id !== assistantId) return [msg];
                if (msg.content.trim().length === 0) return [];
                return [{ ...msg, pending: false }];
              }),
            );
          },
          onStreamError: (message) => {
            setErrorLine(message);
            dropEmptyAssistant();
          },
        },
      );
    } catch {
      setErrorLine(formErrors.elayaUnavailable);
      dropEmptyAssistant();
    } finally {
      setToolStatus(null);
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantId ? { ...msg, pending: false } : msg)),
      );
    }
  }

  const showStarters = messages.length === 0 && !isStreaming && !capReached;

  return (
    <div
      className="h-dvh flex flex-col gap-3 px-5 min-h-0"
      style={{
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Header — back · halo'd ✦ + ELAYA · spacer. The halo always breathes:
          Elaya is present on this screen. */}
      <div className="flex items-center justify-between">
        <IconKnob size={44} aria-label="Back" onClick={() => router.back()}>
          <ArrowLeft size={16} strokeWidth={1.7} />
        </IconKnob>
        <span className="flex flex-col items-center gap-[3px]">
          <span className="neu-m-halo-slow w-[38px] h-[38px] rounded-full bg-(--neu-surface) border border-(--neu-edge-strong) flex items-center justify-center text-sm text-(--neu-accent)">
            ✦
          </span>
          <span
            className="text-[9.5px] font-semibold text-(--neu-text-secondary)"
            style={{ letterSpacing: '0.22em', paddingLeft: '0.22em' }}
          >
            ELAYA
          </span>
        </span>
        <span className="w-11 h-11 shrink-0" aria-hidden />
      </div>

      {/* Date chip — inset pill */}
      <span
        className="self-center h-6 px-3.5 rounded-full bg-(--neu-well) flex items-center text-[9.5px] font-semibold text-(--neu-text-tertiary)"
        style={{
          letterSpacing: '0.12em',
          boxShadow:
            'inset 1px 1px 3px rgb(var(--neu-dark) / 0.25), inset -1px -1px 3px rgb(var(--neu-light) / 0.7)',
        }}
      >
        TODAY
      </span>

      {/* Messages — the one scroll axis */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5">
        {messages.length === 0 && (
          <div
            className="self-start max-w-[82%] px-[15px] py-[13px] bg-(--neu-surface) border border-(--neu-edge-strong) text-[12.5px] leading-[1.55] text-(--neu-text-primary)"
            style={{ borderRadius: ELAYA_RADIUS, boxShadow: 'var(--neu-shadow-raised)' }}
          >
            {greeting}
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === 'assistant') {
            // The pending empty bubble is the TypingBubble below — skip it here.
            if (msg.pending && msg.content.length === 0) return null;
            return (
              <div
                key={msg.id}
                className="self-start max-w-[82%] px-[15px] py-[13px] bg-(--neu-surface) border border-(--neu-edge-strong) text-[12.5px] leading-[1.55] text-(--neu-text-primary)"
                style={{ borderRadius: ELAYA_RADIUS, boxShadow: 'var(--neu-shadow-raised)' }}
              >
                <ChatMarkdown content={msg.content} />
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className="self-end max-w-[78%] px-[15px] py-[13px] border border-(--neu-accent-btn-edge) text-[12.5px] leading-[1.55] text-(--neu-accent-fg)"
              style={{
                borderRadius: USER_RADIUS,
                background: 'var(--neu-accent-gradient)',
                boxShadow: 'var(--neu-shadow-raised)',
              }}
            >
              {msg.content}
            </div>
          );
        })}
        {(awaitingReply || toolStatus) && <TypingBubble statusLine={statusLine} />}
      </div>

      {/* Error line — quiet clay, clears on the next send */}
      {errorLine && (
        <span className="text-[11.5px] font-medium text-(--neu-danger-deep) px-1" role="alert">
          {errorLine}
        </span>
      )}

      {/* Starter chips — prefill + focus only, NEVER auto-send */}
      {showStarters && (
        <div className="flex gap-2 overflow-x-auto">
          {ELAYA_STARTER_PROMPTS.map((s) => (
            <SelectionButton
              appearance="choice"
              key={s}
              onClick={() => prefill(s)}
              className="neu-m-touch h-9 px-3.5 shrink-0 rounded-full bg-(--neu-surface) border border-(--neu-edge) text-[11px] font-medium text-(--neu-accent-deep)"
            >
              {s}
            </SelectionButton>
          ))}
        </div>
      )}

      {/* Composer — floating pill + send knob; cap swaps it for the quiet note */}
      {capReached ? (
        <div
          className="flex items-center justify-center h-[50px] px-4 rounded-full"
          style={{
            background: 'var(--neu-input-bg)',
            border: '1px solid var(--neu-input-edge)',
            boxShadow: 'var(--neu-shadow-input)',
          }}
        >
          <span
            className="text-[12.5px] text-(--neu-text-secondary)"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
          >
            Daily limit reached — tomorrow, then.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <div
            className="flex-1 flex items-center gap-2.5 h-[50px] px-4 rounded-full"
            style={{
              background: 'var(--neu-input-bg)',
              border: '1px solid var(--neu-input-edge)',
              boxShadow: 'var(--neu-shadow-input)',
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
              placeholder="Write to Elaya…"
              disabled={isStreaming}
              className="flex-1 bg-transparent outline-none border-none text-[12.5px] text-(--neu-text-primary) placeholder:text-(--neu-text-tertiary)"
            />
          </div>
          <Fab

            onClick={() => void send()}
            aria-label="Send"
            disabled={isStreaming || draft.trim().length === 0}
            className="neu-m-touch-knob w-[50px] h-[50px] shrink-0 rounded-full border border-(--neu-accent-btn-edge) flex items-center justify-center text-(--neu-accent-fg) disabled:opacity-60"
          >
            <Send size={17} strokeWidth={1.7} />
          </Fab>
        </div>
      )}
    </div>
  );
}
