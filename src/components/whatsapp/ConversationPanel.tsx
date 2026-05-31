"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { MessageBubble } from "@/components/whatsapp/MessageBubble";
import { createClient } from "@/lib/supabase/client";
import {
  sendWhatsAppMessage,
  resolveConversation,
  reopenConversation,
  markConversationAsRead,
} from "@/lib/actions/whatsapp";
import { sanitizeText } from "@/lib/utils/sanitize";
import { toast } from "@/lib/toast";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types/whatsapp";
import type { UserRole } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationPanelProps {
  conversation:      WhatsAppConversation;
  initialMessages:   WhatsAppMessage[];
  callerProfile:     { id: string; full_name: string; avatar_url?: string | null; role: UserRole };
  onConversationUpdate: (updated: Partial<WhatsAppConversation>) => void;
}

const MANAGER_ROLES: UserRole[] = ["manager", "admin", "founder"];
const MAX_CHARS = 4096;
const WARN_CHARS = 3000;

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationPanel({
  conversation,
  initialMessages,
  callerProfile,
  onConversationUpdate,
}: ConversationPanelProps) {
  const mountId       = useId();
  const listRef       = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const seenIds       = useRef<Set<string>>(new Set());
  const optimisticIds = useRef<Set<string>>(new Set());
  // Tracks scrollTop before "load earlier" prepend so we can restore it
  const savedScrollTop = useRef<number>(0);

  const [messages,       setMessages]       = useState<WhatsAppMessage[]>(initialMessages);
  const [draft,          setDraft]          = useState("");
  const [convStatus,     setConvStatus]     = useState(conversation.status);
  const [isResolving,    startResolveTransition]  = useTransition();
  const [isSending,      startSendTransition]     = useTransition();

  // ── Seed / reset on conversation change ─────────────────────────────────────

  useEffect(() => {
    setMessages(initialMessages);
    setDraft("");
    seenIds.current       = new Set(initialMessages.map((m) => m.id));
    optimisticIds.current = new Set();
    setConvStatus(conversation.status);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // ── Auto-scroll to bottom on mount and new messages ─────────────────────────

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Mark conversation read on open (fires once per conversation.id change) ──

  useEffect(() => {
    markConversationAsRead({ conversationId: conversation.id }).catch(() => {});
  }, [conversation.id]);

  // ── Realtime subscription — messages ────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`wa-messages-${conversation.id}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "whatsapp_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as WhatsAppMessage;

            if (seenIds.current.has(incoming.id)) return;
            seenIds.current.add(incoming.id);

            setMessages((prev) => {
              // Echo from our own outbound send — replace oldest optimistic row
              if (
                incoming.direction === "outbound" &&
                incoming.sender_id === callerProfile.id &&
                optimisticIds.current.size > 0
              ) {
                const idx = prev.findIndex((m) => optimisticIds.current.has(m.id));
                if (idx !== -1) {
                  optimisticIds.current.delete(prev[idx].id);
                  const enriched: WhatsAppMessage = {
                    ...incoming,
                    sender_name:       callerProfile.full_name,
                    sender_avatar_url: callerProfile.avatar_url ?? undefined,
                  };
                  return [...prev.slice(0, idx), enriched, ...prev.slice(idx + 1)];
                }
              }

              // Inbound from lead — just append
              return [...prev, incoming];
            });
          } else if (payload.eventType === "UPDATE") {
            // Delivery status update
            const updated = payload.new as WhatsAppMessage;
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, status: updated.status, status_at: updated.status_at } : m)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    if (value.length > MAX_CHARS) return;
    setDraft(value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`; // max 4 lines ≈ 96px
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const content = draft.trim();
    if (!content || isSending || convStatus === "resolved") return;

    const sanitized     = sanitizeText(content);
    const optimisticId  = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    optimisticIds.current.add(optimisticId);

    const optimistic: WhatsAppMessage = {
      id:              optimisticId,
      conversation_id: conversation.id,
      lead_id:         conversation.lead_id,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       callerProfile.id,
      wa_message_id:   null,
      message_type:    "text",
      content:         sanitized,
      media_url:       null,
      media_mime_type: null,
      status:          "sent",
      status_at:       new Date().toISOString(),
      is_bot:          false,
      created_at:      new Date().toISOString(),
      sender_name:     callerProfile.full_name,
      sender_avatar_url: callerProfile.avatar_url ?? undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    startSendTransition(async () => {
      const result = await sendWhatsAppMessage({
        conversationId: conversation.id,
        content:        sanitized,
      });

      if (result.error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        optimisticIds.current.delete(optimisticId);
        toast.danger("Couldn't send message", { message: result.error });
        return;
      }

      if (result.data) {
        const confirmed: WhatsAppMessage = result.data;
        seenIds.current.add(confirmed.id);
        optimisticIds.current.delete(optimisticId);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === optimisticId);
          if (idx === -1) return prev;
          return [...prev.slice(0, idx), confirmed, ...prev.slice(idx + 1)];
        });
      }
    });
  }, [draft, isSending, convStatus, conversation.id, conversation.lead_id, callerProfile]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Resolve / Reopen ─────────────────────────────────────────────────────────

  function handleResolve() {
    startResolveTransition(async () => {
      const result = await resolveConversation({ conversationId: conversation.id });
      if (result.error) {
        toast.danger("Couldn't resolve conversation", { message: result.error });
        return;
      }
      setConvStatus("resolved");
      onConversationUpdate({ status: "resolved" });
    });
  }

  function handleReopen() {
    startResolveTransition(async () => {
      const result = await reopenConversation({ conversationId: conversation.id });
      if (result.error) {
        toast.danger("Couldn't reopen conversation", { message: result.error });
        return;
      }
      setConvStatus("open");
      onConversationUpdate({ status: "open" });
    });
  }

  const canManage  = MANAGER_ROLES.includes(callerProfile.role);
  const canSend    = draft.trim().length > 0 && !isSending && convStatus === "open";
  const showCharCount = draft.length > WARN_CHARS;

  // Group messages by date
  const grouped = groupByDate(messages);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        overflow:      "hidden",
      }}
    >
      {/* ZONE A — Header */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "var(--space-3)",
          padding:        "var(--space-8) var(--space-8) var(--space-5)",
          flexShrink:     0,
          borderBottom:   "1px solid var(--theme-paper-border)",
          background:     "var(--theme-paper)",
        }}
      >
        {/* Contact avatar */}
        <Avatar
          name={conversation.lead_name ?? conversation.phone}
          size="sm"
          style={{ flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily:   "var(--font-serif)",
              fontStyle:    "italic",
              fontSize:     "var(--text-base)",
              fontWeight:   "var(--weight-normal)",
              color:        "var(--theme-text-primary)",
              margin:       "0 0 1px",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              lineHeight:   1.2,
            }}
          >
            {conversation.lead_name ?? conversation.phone}
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   "var(--text-xs)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
            }}
          >
            {conversation.lead_phone ?? conversation.phone}
          </p>
        </div>

        {/* Status badge */}
        {convStatus === "resolved" && (
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              flexShrink:   0,
              padding:      "2px var(--space-2)",
              borderRadius: "var(--radius-full)",
              background:   "var(--color-success)",
              color:        "var(--color-success-text)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-xs)",
              fontWeight:   "var(--weight-semibold)",
            }}
          >
            Resolved
          </span>
        )}

        {/* Resolve / Reopen button — manager+ only */}
        {canManage && (
          convStatus === "open" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResolve}
              disabled={isResolving}
            >
              {isResolving ? <Spinner size="sm" /> : "Resolve"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReopen}
              disabled={isResolving}
            >
              {isResolving ? <Spinner size="sm" /> : "Reopen"}
            </Button>
          )
        )}
      </div>

      {/* ZONE B — Message list */}
      <div
        ref={listRef}
        className="message-list"
        style={{
          flex:                    1,
          overflowY:               "auto",
          padding:                 "var(--space-5) var(--space-5)",
          display:                 "flex",
          flexDirection:           "column",
          gap:                     "var(--space-3)",
          background:              "var(--theme-paper-subtle)",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          overscrollBehavior:      "contain",
        }}
      >
        {grouped.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              textAlign:  "center",
              margin:     "auto",
            }}
          >
            No messages yet.
          </p>
        ) : (
          grouped.map(({ dateLabel, messages: dayMessages }) => (
            <div key={dateLabel}>
              {/* Date separator */}
              <div
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  gap:            "var(--space-3)",
                  margin:         "var(--space-3) 0",
                }}
              >
                <div style={{ flex: 1, height: "1px", background: "var(--theme-paper-border)" }} />
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-tertiary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {dateLabel}
                </span>
                <div style={{ flex: 1, height: "1px", background: "var(--theme-paper-border)" }} />
              </div>

              {/* Messages for this day */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {dayMessages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOptimistic={optimisticIds.current.has(msg.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ZONE C — Composer */}
      {convStatus === "resolved" ? (
        <div
          style={{
            padding:        "var(--space-4)",
            flexShrink:     0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "var(--space-3)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
              textAlign:  "center",
            }}
          >
            This conversation is resolved. Reopen to send messages.
          </p>
        </div>
      ) : (
        <div
          style={{
            padding:    "var(--space-3) var(--space-4)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display:      "flex",
              alignItems:   "flex-end",
              gap:          "var(--space-2)",
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              padding:      "var(--space-2) var(--space-3)",
              boxShadow:    "var(--shadow-2)",
              transition:   "border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--theme-accent)";
              (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-accent-ring)";
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                (e.currentTarget as HTMLDivElement).style.borderColor = "";
                (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-2)";
              }
            }}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              style={{
                flex:       1,
                border:     "none",
                outline:    "none",
                background: "transparent",
                resize:     "none",
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                color:      "var(--theme-text-primary)",
                lineHeight: "var(--leading-relaxed)",
                minHeight:  "24px",
                maxHeight:  "96px",
                overflowY:  "auto",
                caretColor: "var(--theme-accent)",
              }}
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              style={{
                width:          "32px",
                height:         "32px",
                borderRadius:   "var(--radius-sm)",
                border:         "none",
                cursor:         canSend ? "pointer" : "not-allowed",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                background:     canSend ? "var(--theme-accent)" : "var(--theme-paper-border)",
                transition:     "background var(--duration-fast) var(--ease-in-out)",
              }}
            >
              {isSending ? (
                <Spinner size="sm" />
              ) : (
                <Send
                  style={{
                    width:       "14px",
                    height:      "14px",
                    strokeWidth: 1.5,
                    color:       canSend ? "var(--theme-accent-fg)" : "var(--theme-text-tertiary)",
                  }}
                />
              )}
            </button>
          </div>

          {/* Character count warning */}
          {showCharCount && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-2xs)",
                color:      draft.length > MAX_CHARS - 100
                  ? "var(--color-danger-text)"
                  : "var(--theme-text-tertiary)",
                margin:     "var(--space-1) var(--space-1) 0",
                textAlign:  "right",
              }}
            >
              {draft.length} / {MAX_CHARS}
            </p>
          )}

        </div>
      )}
    </div>
  );
}

ConversationPanel.displayName = "ConversationPanel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDate(messages: WhatsAppMessage[]): { dateLabel: string; messages: WhatsAppMessage[] }[] {
  const groups: Map<string, WhatsAppMessage[]> = new Map();

  for (const msg of messages) {
    const d = new Date(msg.created_at);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (isSameDay(d, today)) {
      label = "Today";
    } else if (isSameDay(d, yesterday)) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(msg);
  }

  return Array.from(groups.entries()).map(([dateLabel, msgs]) => ({ dateLabel, messages: msgs }));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}
