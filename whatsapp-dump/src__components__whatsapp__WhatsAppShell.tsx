"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/whatsapp/ConversationList";
import { ConversationPanel } from "@/components/whatsapp/ConversationPanel";
import { EmptyConversationState } from "@/components/whatsapp/EmptyConversationState";
import { createClient } from "@/lib/supabase/client";
import {
  getConversationsAction,
  getMessagesAction,
} from "@/lib/actions/whatsapp";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types/whatsapp";
import type { UserRole } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatsAppShellProps {
  initialConversations: WhatsAppConversation[];
  unreadCount:          number;
  callerProfile:        { id: string; full_name: string; avatar_url?: string | null; role: UserRole };
}

const TOPBAR_HEIGHT = 56; // matches .eia-topbar height

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsAppShell({
  initialConversations,
  unreadCount: initialUnreadCount,
  callerProfile,
}: WhatsAppShellProps) {
  const mountId = useId();

  const [conversations,         setConversations]         = useState<WhatsAppConversation[]>(initialConversations);
  const [activeConversationId,  setActiveConversationId]  = useState<string | null>(null);
  const [activeMessages,        setActiveMessages]        = useState<WhatsAppMessage[]>([]);
  const [unreadCount,           setUnreadCount]           = useState(initialUnreadCount);
  const [cursor,                setCursor]                = useState<string | null>(
    initialConversations.length > 0
      ? (initialConversations[initialConversations.length - 1]?.last_message_at ?? null)
      : null,
  );
  const [hasMore,        setHasMore]        = useState(initialConversations.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE);
  const [isLoadingMore,  startLoadMoreTransition] = useTransition();
  const [isLoadingConv,  setIsLoadingConv]  = useState(false);

  // ── Realtime — conversation list updates ────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`wa-conversations-${callerProfile.id}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "whatsapp_conversations",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const newConv = payload.new as WhatsAppConversation;
            setConversations((prev) => [newConv, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as WhatsAppConversation;
            setConversations((prev) =>
              prev
                .map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                // Re-sort by last_message_at DESC
                .sort((a, b) => {
                  const ta = a.last_message_at ?? a.created_at;
                  const tb = b.last_message_at ?? b.created_at;
                  return tb.localeCompare(ta);
                }),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callerProfile.id]);

  // ── Load more conversations ──────────────────────────────────────────────────

  function handleLoadMore() {
    if (!cursor || isLoadingMore) return;
    startLoadMoreTransition(async () => {
      const { conversations: more, nextCursor } = await getConversationsAction({
        limit:  WHATSAPP_CONVERSATIONS_PAGE_SIZE,
        cursor,
      });
      setConversations((prev) => [...prev, ...more]);
      setCursor(nextCursor);
      setHasMore(more.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE);
    });
  }

  // ── Select a conversation ────────────────────────────────────────────────────

  async function handleSelectConversation(id: string) {
    if (id === activeConversationId) return;
    setActiveConversationId(id);
    setIsLoadingConv(true);
    try {
      const messages = await getMessagesAction(id);
      setActiveMessages(messages);
    } finally {
      setIsLoadingConv(false);
    }
  }

  // ── Conversation status update from panel ────────────────────────────────────

  function handleConversationUpdate(updated: Partial<WhatsAppConversation>) {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversationId ? { ...c, ...updated } : c)),
    );
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:   "flex",
        height:    `calc(100dvh - ${TOPBAR_HEIGHT}px)`,
        overflow:  "hidden",
      }}
    >
      {/* Left panel — conversation list */}
      <div
        style={{
          width:         "320px",
          flexShrink:    0,
          display:       "flex",
          flexDirection: "column",
          background:    "var(--theme-paper-subtle)",
          borderRight:   "1px solid var(--theme-paper-border)",
          overflow:      "hidden",
        }}
      >
        {/* Left header */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            "var(--space-2)",
            padding:        "0 var(--space-5)",
            height:         "64px",
            flexShrink:     0,
            borderBottom:   "1px solid var(--theme-paper-border)",
          }}
        >
          <span
            style={{
              fontFamily:  "var(--font-display, var(--font-sans))",
              fontSize:    "var(--text-lg)",
              fontWeight:  "var(--weight-semibold)",
              color:       "var(--theme-text-primary)",
            }}
          >
            WhatsApp
          </span>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                minWidth:       "20px",
                height:         "20px",
                padding:        "0 var(--space-1)",
                borderRadius:   "var(--radius-full)",
                background:     "var(--theme-accent)",
                color:          "var(--theme-accent-fg)",
                fontFamily:     "var(--font-sans)",
                fontSize:       "var(--text-xs)",
                fontWeight:     "var(--weight-semibold)",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </div>
      </div>

      {/* Right panel — conversation or empty state */}
      <div
        style={{
          flex:       1,
          minWidth:   0,
          background: "var(--theme-paper)",
          overflow:   "hidden",
        }}
      >
        {activeConversation ? (
          isLoadingConv ? (
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                height:         "100%",
              }}
            >
              <MessageCircle
                style={{
                  width:       "32px",
                  height:      "32px",
                  strokeWidth: 1.5,
                  color:       "var(--theme-text-tertiary)",
                  animation:   "eia-spin 1s linear infinite",
                }}
              />
            </div>
          ) : (
            <ConversationPanel
              key={activeConversation.id}
              conversation={activeConversation}
              initialMessages={activeMessages}
              callerProfile={callerProfile}
              onConversationUpdate={handleConversationUpdate}
            />
          )
        ) : (
          <EmptyConversationState />
        )}
      </div>
    </div>
  );
}

WhatsAppShell.displayName = "WhatsAppShell";
