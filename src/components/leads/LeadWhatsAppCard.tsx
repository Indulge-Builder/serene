"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  sendWhatsAppMessage,
  markConversationAsRead,
  initiateWhatsAppConversationAction,
} from "@/lib/actions/whatsapp";
import { MessageBubble } from "@/components/whatsapp/MessageBubble";
import { MessageBar } from "@/components/ui/MessageBar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils/dates";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types/whatsapp";

interface LeadWhatsAppCardProps {
  leadId:              string;
  leadPhone:           string | null;
  leadName:            string;
  callerProfile:       { id: string; role: string };
  initialConversation: WhatsAppConversation | null;
  initialMessages:     WhatsAppMessage[];
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

function dateSeparatorLabel(iso: string): string {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const day       = iso.slice(0, 10);
  if (day === today)     return "Today";
  if (day === yesterday) return "Yesterday";
  return formatDate(iso, "dd MMM yyyy");
}

export function LeadWhatsAppCard({
  leadId,
  leadPhone,
  callerProfile,
  initialConversation,
  initialMessages,
}: LeadWhatsAppCardProps) {
  const mountId                                        = useId();
  const [conversation, setConversation]                = useState<WhatsAppConversation | null>(initialConversation);
  const [messages, setMessages]                        = useState<WhatsAppMessage[]>(initialMessages);
  const [draft, setDraft]                              = useState("");
  const [isSendPending, startSendTransition]           = useTransition();
  const [isInitiatePending, startInitiateTransition]   = useTransition();
  const bodyRef                                        = useRef<HTMLDivElement>(null);
  const seenIds                                        = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const optimisticIds                                  = useRef<Set<string>>(new Set());

  // Initial thread renders static; only messages appended after mount animate in.
  const arrivedAfterMount = useRef(false);
  useEffect(() => {
    arrivedAfterMount.current = true;
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Mark read on mount when conversation exists
  useEffect(() => {
    if (!conversation) return;
    markConversationAsRead({ conversationId: conversation.id });
  }, [conversation]);

  // Realtime — gates on conversation?.id so it fires when initiation sets conversation state
  useEffect(() => {
    if (!conversation?.id) return;

    const conversationId = conversation.id;
    const supabase       = createClient();
    const channel        = supabase
      .channel(`wa-messages-${conversationId}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as WhatsAppMessage;
            if (seenIds.current.has(row.id)) return;
            seenIds.current.add(row.id);

            // Echo detection: replace oldest optimistic row
            if (row.direction === "outbound" && optimisticIds.current.size > 0) {
              const firstOptimistic = [...optimisticIds.current][0];
              optimisticIds.current.delete(firstOptimistic);
              setMessages((prev) =>
                prev.map((m) => (m.id === firstOptimistic ? row : m)),
              );
              return;
            }

            setMessages((prev) => [...prev, row]);
          }

          if (payload.eventType === "UPDATE") {
            const updated = payload.new as WhatsAppMessage;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updated.id
                  ? { ...m, status: updated.status, status_at: updated.status_at }
                  : m,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, mountId]);

  function handleSend() {
    if (!draft.trim() || !conversation) return;

    const content      = draft.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: WhatsAppMessage = {
      id:              optimisticId,
      conversation_id: conversation.id,
      lead_id:         leadId,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       callerProfile.id,
      wa_message_id:   null,
      message_type:    "text",
      content,
      media_url:       null,
      media_mime_type: null,
      status:          "sent",
      status_at:       new Date().toISOString(),
      is_bot:          false,
      created_at:      new Date().toISOString(),
    };

    optimisticIds.current.add(optimisticId);
    seenIds.current.add(optimisticId);
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");

    startSendTransition(async () => {
      const result = await sendWhatsAppMessage({ conversationId: conversation.id, content });
      if (result.error) {
        optimisticIds.current.delete(optimisticId);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.danger(result.error);
      }
    });
  }

  function handleInitiate() {
    startInitiateTransition(async () => {
      const result = await initiateWhatsAppConversationAction(leadId);
      if (result.error) {
        toast.danger(result.error);
        return;
      }
      if (result.data) {
        seenIds.current.add(result.data.message.id);
        setConversation(result.data.conversation);
        setMessages([result.data.message]);
      }
    });
  }

  // ── No phone guard ──────────────────────────────────────────────────────────
  if (!leadPhone) {
    return (
      <div
        style={{
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow:    "var(--shadow-1)",
          overflow:     "hidden",
        }}
      >
        <CardHeader conversation={null} />
        <div
          style={{
            background: "var(--theme-paper-subtle)",
            padding:    "var(--space-12) var(--space-6)",
            textAlign:  "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
            }}
          >
            No phone number on file.
          </p>
        </div>
      </div>
    );
  }

  // ── No conversation — initiation surface ───────────────────────────────────
  if (!conversation) {
    return (
      <div
        style={{
          background:   "var(--theme-paper)",
          border:       "1px solid var(--theme-paper-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow:    "var(--shadow-1)",
          overflow:     "hidden",
        }}
      >
        <CardHeader conversation={null} />
        <div
          style={{
            background:    "var(--theme-paper-subtle)",
            padding:       "var(--space-12) var(--space-6)",
            textAlign:     "center",
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           "var(--space-2)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-secondary)",
              margin:     0,
            }}
          >
            No messages yet.
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
            }}
          >
            Send the first message to start this conversation on WhatsApp.
          </p>
          <div style={{ marginTop: "var(--space-4)" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleInitiate}
              disabled={isInitiatePending}
              loading={isInitiatePending}
              iconLeft={MessageCircle as LucideIcon}
            >
              {isInitiatePending ? "Starting…" : "Start Conversation"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isResolved = conversation.status === "resolved";

  // ── Full card ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow:    "var(--shadow-1)",
        overflow:     "hidden",
      }}
    >
      <CardHeader conversation={conversation} />

      {/* Message list */}
      <div
        ref={bodyRef}
        style={{
          background:    "var(--theme-paper-subtle)",
          borderRadius:  "var(--radius-sm)",
          maxHeight:     "300px",
          overflowY:     "auto",
          padding:       "var(--space-4) var(--space-4)",
          display:       "flex",
          flexDirection: "column",
          gap:           "var(--space-3)",
        }}
      >
        {messages.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              textAlign:  "center",
              margin:     "var(--space-8) 0",
            }}
          >
            No messages yet.
          </p>
        ) : (
          messages.map((msg, idx) => {
            const showSeparator =
              idx === 0 || !isSameDay(messages[idx - 1].created_at, msg.created_at);
            return (
              <div key={msg.id}>
                {showSeparator && (
                  <div style={{ textAlign: "center", margin: "var(--space-2) 0" }}>
                    <span
                      style={{
                        fontFamily:    "var(--font-sans)",
                        fontSize:      "var(--text-2xs)",
                        fontWeight:    "var(--weight-semibold)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color:         "var(--theme-text-tertiary)",
                      }}
                    >
                      {dateSeparatorLabel(msg.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOptimistic={optimisticIds.current.has(msg.id)}
                  entrance={arrivedAfterMount.current}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Composer / resolved banner */}
      <div
        style={{
          borderTop:  "1px solid var(--theme-paper-border)",
          padding:    "var(--space-3) var(--space-4)",
          background: "var(--theme-paper)",
        }}
      >
        {isResolved ? (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              textAlign:  "center",
              margin:     0,
            }}
          >
            This conversation is resolved.
          </p>
        ) : (
          <MessageBar
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            loading={isSendPending}
            variant="nested"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Internal sub-components ─────────────────────────────────────────────────

function StatusPill({ status }: { status: "open" | "resolved" }) {
  const isOpen = status === "open";
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       "2px var(--space-2)",
        borderRadius:  "var(--radius-full)",
        fontSize:      "var(--text-2xs)",
        fontFamily:    "var(--font-sans)",
        fontWeight:    "var(--weight-semibold)",
        letterSpacing: "0.04em",
        background:    isOpen
          ? "var(--color-success-light)"
          : "var(--theme-paper-border)",
        color:         isOpen
          ? "var(--color-success-dark-text)"
          : "var(--theme-text-secondary)",
        border:        isOpen
          ? "1px solid var(--color-success)"
          : "1px solid var(--theme-paper-border)",
      }}
    >
      {isOpen ? "Open" : "Resolved"}
    </span>
  );
}

function CardHeader({ conversation }: { conversation: WhatsAppConversation | null }) {
  return (
    <div
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "var(--space-3) var(--space-5)",
        background:     "var(--theme-paper-subtle)",
        borderBottom:   "1px solid var(--theme-paper-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <MessageCircle
          style={{
            width:       "16px",
            height:      "16px",
            strokeWidth: 1.5,
            color:       "var(--theme-text-tertiary)",
          }}
        />
        <span
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
          }}
        >
          WhatsApp
        </span>
      </div>
      {conversation && <StatusPill status={conversation.status} />}
    </div>
  );
}

LeadWhatsAppCard.displayName = "LeadWhatsAppCard";
