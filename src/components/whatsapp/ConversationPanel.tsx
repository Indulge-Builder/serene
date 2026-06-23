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
import { ArrowLeft, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MessageBar } from "@/components/ui/MessageBar";
import { DictationButton } from "@/components/ui/DictationButton";
import { MessageBubble } from "@/components/whatsapp/MessageBubble";
import { createClient } from "@/lib/supabase/client";
import {
  sendWhatsAppMessage,
  sendWhatsAppMediaMessage,
  markConversationAsRead,
  signWhatsAppMediaAction,
} from "@/lib/actions/whatsapp";
import { sanitizeText } from "@/lib/utils/sanitize";
import {
  resolveOutboundMediaType,
  WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES,
} from "@/lib/constants/whatsapp";
import { toast } from "@/lib/toast";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types/whatsapp";
import type { UserRole } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationPanelProps {
  conversation:      WhatsAppConversation;
  initialMessages:   WhatsAppMessage[];
  callerProfile:     { id: string; full_name: string; avatar_url?: string | null; role: UserRole };
  /** Single-pane mode (<md): renders a back-to-list button in the header. */
  onBack?: () => void;
}

const MAX_CHARS = 4096;
const WARN_CHARS = 3000;

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationPanel({
  conversation,
  initialMessages,
  callerProfile,
  onBack,
}: ConversationPanelProps) {
  const mountId       = useId();
  const listRef       = useRef<HTMLDivElement>(null);
  const composerRef   = useRef<HTMLTextAreaElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const seenIds       = useRef<Set<string>>(new Set());
  const optimisticIds = useRef<Set<string>>(new Set());

  // Initial thread renders static; only messages appended after mount animate
  // in (the panel remounts per conversation via key={activeConversation.id}).
  const arrivedAfterMount = useRef(false);
  useEffect(() => {
    arrivedAfterMount.current = true;
  }, []);
  // Tracks scrollTop before "load earlier" prepend so we can restore it
  const savedScrollTop = useRef<number>(0);

  const [messages,       setMessages]       = useState<WhatsAppMessage[]>(initialMessages);
  const [draft,          setDraft]          = useState("");
  const [isSending,      startSendTransition]     = useTransition();
  const [isUploading,    setIsUploading]          = useState(false);

  // ── Seed / reset on conversation change ─────────────────────────────────────

  useEffect(() => {
    setMessages(initialMessages);
    setDraft("");
    seenIds.current       = new Set(initialMessages.map((m) => m.id));
    optimisticIds.current = new Set();
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

            // The realtime payload carries the raw storage PATH in media_url (the
            // DB row), not a signed url. Sign it before the bubble tries to load
            // it; on failure the path stays and the bubble degrades gracefully.
            const isMediaMsg = ["image", "video", "document", "audio"].includes(
              incoming.message_type,
            );
            if (isMediaMsg && incoming.media_url) {
              signWhatsAppMediaAction(incoming.media_url)
                .then(({ url }) => {
                  if (!url) return;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === incoming.id ? { ...m, media_url: url } : m,
                    ),
                  );
                })
                .catch(() => {});
            }

            // The conversation is on screen — advance the read position so
            // this message never counts as unread (it bumped last_message_at
            // past the mark-read written on mount).
            markConversationAsRead({ conversationId: conversation.id }).catch(
              () => {},
            );

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

  // ── Send message ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const content = draft.trim();
    if (!content || isSending) return;

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
  }, [draft, isSending, conversation.id, conversation.lead_id, callerProfile]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Attach / send media ──────────────────────────────────────────────────────
  // Validate client-side for instant feedback (the action re-validates), show an
  // optimistic media bubble, upload+send via the action, then swap in the
  // confirmed row (with a signed url). On error the optimistic bubble is removed.

  function handleAttachClick() {
    if (isUploading) return;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires change again.
    e.target.value = "";
    if (!file) return;

    const mediaType = resolveOutboundMediaType(file.type);
    if (!mediaType) {
      toast.danger("Unsupported file type", { message: "Send an image, video, PDF, or audio file." });
      return;
    }
    if (file.size === 0) {
      toast.danger("That file is empty");
      return;
    }
    if (file.size > WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES) {
      toast.danger("File too large", { message: "Files must be 16MB or smaller." });
      return;
    }

    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    optimisticIds.current.add(optimisticId);

    // A local object url so the bubble can preview the media while it uploads.
    const localUrl = URL.createObjectURL(file);

    const optimistic: WhatsAppMessage = {
      id:              optimisticId,
      conversation_id: conversation.id,
      lead_id:         conversation.lead_id,
      direction:       "outbound",
      sender_type:     "agent",
      sender_id:       callerProfile.id,
      wa_message_id:   null,
      message_type:    mediaType,
      content:         null,
      media_url:       localUrl,
      media_mime_type: file.type,
      status:          "sent",
      status_at:       new Date().toISOString(),
      is_bot:          false,
      created_at:      new Date().toISOString(),
      sender_name:     callerProfile.full_name,
      sender_avatar_url: callerProfile.avatar_url ?? undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("conversationId", conversation.id);
      formData.append("file", file);

      const result = await sendWhatsAppMediaMessage(formData);

      if (result.error || !result.data) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        optimisticIds.current.delete(optimisticId);
        toast.danger("Couldn't send file", { message: result.error ?? undefined });
        return;
      }

      const confirmed: WhatsAppMessage = result.data;
      seenIds.current.add(confirmed.id);
      optimisticIds.current.delete(optimisticId);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === optimisticId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), confirmed, ...prev.slice(idx + 1)];
      });
    } finally {
      URL.revokeObjectURL(localUrl);
      setIsUploading(false);
    }
  }

  // Voice dictation — the transcript lands in the composer as an editable draft
  // (never auto-sent), then focus. Saving always goes through the same
  // handleSend path as a typed message.
  const handleTranscript = useCallback((text: string) => {
    setDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")} ${text}` : text));
    composerRef.current?.focus();
  }, []);

  const showCharCount = draft.length > WARN_CHARS;

  // Group messages by date
  const grouped = groupByDate(messages);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        flex:          1,
        minHeight:     0,
        overflow:      "hidden",
      }}
    >
      {/* ZONE A — Header. In single-pane mobile mode (onBack present) the
          floating nav hamburger overlays the top-left, so the header takes the
          same mobile top offset the rail does (.serene-wa-pane-header) to clear
          the notch + sit on the trigger's line. */}
      <div
        className={`px-4 py-4 md:px-8 md:pt-8 md:pb-5${onBack ? " serene-wa-pane-header" : ""}`}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "var(--space-3)",
          flexShrink:     0,
          borderBottom:   "1px solid var(--theme-paper-border)",
          background:     "var(--theme-paper)",
        }}
      >
        {/* Back to list — single-pane mode only (<md) */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="serene-pressable"
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          "40px",
              height:         "40px",
              marginLeft:     "calc(-1 * var(--space-2))",
              flexShrink:     0,
              background:     "transparent",
              border:         "none",
              borderRadius:   "var(--radius-md)",
              color:          "var(--theme-text-secondary)",
              cursor:         "pointer",
              padding:        0,
            }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px", strokeWidth: 1.5 }} />
          </button>
        )}

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
                    entrance={arrivedAfterMount.current}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ZONE C — Composer. safe-area inset (DNA R-02): this is the
          viewport-bottom surface in single-pane mode on notched devices. */}
      <div
        style={{
          padding:       "var(--space-3) var(--space-4)",
          paddingBottom: "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))",
          flexShrink:    0,
        }}
      >
        {/* Hidden file input — driven by the attach button. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,audio/amr,application/pdf"
          onChange={handleFileSelected}
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />

        <MessageBar
          ref={composerRef}
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          loading={isSending}
          maxLength={MAX_CHARS}
          maxHeight={96}
          leadingSlot={
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={isUploading}
                aria-label="Attach a file"
                title="Attach a file"
                className="serene-pressable"
                style={{
                  width:          "32px",
                  height:         "32px",
                  borderRadius:   "var(--radius-sm)",
                  border:         "none",
                  background:     "transparent",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  cursor:         isUploading ? "not-allowed" : "pointer",
                  color:          "var(--theme-text-tertiary)",
                  opacity:        isUploading ? 0.5 : 1,
                }}
              >
                <Paperclip style={{ width: "18px", height: "18px", strokeWidth: 1.5 }} />
              </button>
              <DictationButton
                onTranscript={handleTranscript}
                onError={(message) => toast.danger(message)}
                disabled={isSending}
                what="a message"
              />
            </div>
          }
        />

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
