"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/whatsapp/ConversationList";
import { ConversationPanel } from "@/components/whatsapp/ConversationPanel";
import { EmptyConversationState } from "@/components/whatsapp/EmptyConversationState";
import { createClient } from "@/lib/supabase/client";
import { useMediaQuery, MQ } from "@/hooks/useMediaQuery";
import {
  getConversationsAction,
  getMessagesAction,
} from "@/lib/actions/whatsapp";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";
import type {
  WhatsAppConversation,
  WhatsAppMessage,
} from "@/lib/types/whatsapp";
import type { UserRole } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatsAppShellProps {
  initialConversations: WhatsAppConversation[];
  unreadCount: number;
  callerProfile: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
    role: UserRole;
  };
}


// ─── Component ────────────────────────────────────────────────────────────────

export function WhatsAppShell({
  initialConversations,
  unreadCount,
  callerProfile,
}: WhatsAppShellProps) {
  const mountId = useId();
  // Single-pane mode below md (responsive audit F3, D-1): list OR conversation
  // with back navigation — a genuine behaviour branch, so the hook, not CSS.
  const isMobile = useMediaQuery(MQ.mobile);
  const searchParams = useSearchParams();
  const { period, customFrom, customTo } = parseWhatsAppPeriodFromSearchParams(searchParams);
  const skipPeriodRefetch = useRef(true);

  const [conversations, setConversations] =
    useState<WhatsAppConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [activeMessages, setActiveMessages] = useState<WhatsAppMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(
    initialConversations.length > 0
      ? (initialConversations[initialConversations.length - 1]
          ?.last_message_at ?? null)
      : null,
  );
  const [hasMore, setHasMore] = useState(
    initialConversations.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE,
  );
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [isRefetchingList, startListRefetchTransition] = useTransition();
  const [isLoadingConv, setIsLoadingConv] = useState(false);

  const listFilter = {
    period:     period ?? undefined,
    customFrom: customFrom ?? undefined,
    customTo:   customTo   ?? undefined,
  };

  // ── Refetch list when period URL params change ────────────────────────────────

  useEffect(() => {
    if (skipPeriodRefetch.current) {
      skipPeriodRefetch.current = false;
      return;
    }

    startListRefetchTransition(async () => {
      const { conversations: fresh, nextCursor } = await getConversationsAction({
        limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE,
        ...listFilter,
      });
      setConversations(fresh);
      setCursor(nextCursor);
      setHasMore(fresh.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE);
      setActiveConversationId((current) =>
        current && fresh.some((c) => c.id === current) ? current : null,
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // ── Realtime — conversation list updates ────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`wa-conversations-${callerProfile.id}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
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
        limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE,
        cursor,
        ...listFilter,
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
      prev.map((c) =>
        c.id === activeConversationId ? { ...c, ...updated } : c,
      ),
    );
  }

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────────

  // <md the split-pane collapses to a single pane: the list, or the active
  // conversation with a back affordance (audit §3.4).
  const showRail = !isMobile || activeConversation === null;
  const showPane = !isMobile || activeConversation !== null;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Left rail — page title + search + list (same inset as Leads / Settings).
          Full-width pane <md; fixed 320px rail at md+ (w-80 = 320px). */}
      {showRail && (
      <div
        className="w-full md:w-80 pt-4 pl-4 md:pt-8 md:pl-8"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--theme-paper)",
          borderRight: "1px solid var(--theme-paper-border)",
          overflow: "hidden",
        }}
      >
        <div
          className="mb-6 flex shrink-0 items-center justify-between gap-4"
          style={{ paddingRight: "var(--space-4)" }}
        >
          <h1 className="type-page-title m-0">
            WhatsApp<span className="page-title-dot">.</span>
          </h1>
          {unreadCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "22px",
                height: "22px",
                padding: "0 var(--space-1)",
                borderRadius: "var(--radius-full)",
                background: "var(--theme-accent)",
                color: "var(--theme-accent-fg)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                fontWeight: "var(--weight-semibold)",
                flexShrink: 0,
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore || isRefetchingList}
            period={period}
          />
        </div>
      </div>
      )}

      {/* Right pane — full height from top; contact header owns top breathing room */}
      {showPane && (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          background: "var(--theme-paper-subtle)",
          overflow: "hidden",
        }}
      >
        {activeConversation ? (
          isLoadingConv ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <MessageCircle
                style={{
                  width: "32px",
                  height: "32px",
                  strokeWidth: 1.5,
                  color: "var(--theme-text-tertiary)",
                  animation: "eia-spin 1s linear infinite",
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
              onBack={isMobile ? () => setActiveConversationId(null) : undefined}
            />
          )
        ) : (
          <EmptyConversationState />
        )}
      </div>
      )}
    </div>
  );
}

WhatsAppShell.displayName = "WhatsAppShell";
