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
  // Live mirror of the RSC-seeded badge — adjusted optimistically on open/new
  // message; the server truth comes back on the next page load.
  const [unreadBadge, setUnreadBadge] = useState(unreadCount);
  const [activeMessages, setActiveMessages] = useState<WhatsAppMessage[]>([]);
  // Refs for the Realtime handler — its closure is mounted once and would
  // otherwise read stale state.
  const conversationsRef = useRef(conversations);
  const activeIdRef = useRef(activeConversationId);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);
  // Monotonic token so a slow getMessagesAction response for a previously
  // selected conversation can never overwrite the current one.
  const selectSeq = useRef(0);
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
            if (conversationsRef.current.some((c) => c.id === newConv.id)) return;
            // A conversation row is created by the first inbound message —
            // it starts unread unless the raw row says otherwise.
            setConversations((prev) => [
              { ...newConv, unread_count: 1 },
              ...prev,
            ]);
            setUnreadBadge((n) => n + 1);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as WhatsAppConversation;
            const prevRow = conversationsRef.current.find(
              (c) => c.id === updated.id,
            );
            if (!prevRow) return;

            const isActive = updated.id === activeIdRef.current;
            const hasNewMessage =
              !!updated.last_message_at &&
              (!prevRow.last_message_at ||
                updated.last_message_at > prevRow.last_message_at);
            // The conversation currently on screen is always read (the panel
            // keeps the server-side read position in step).
            const nextUnread = isActive
              ? 0
              : hasNewMessage
                ? 1
                : (prevRow.unread_count ?? 0);

            const wasUnread = (prevRow.unread_count ?? 0) > 0;
            if (nextUnread > 0 && !wasUnread) setUnreadBadge((n) => n + 1);
            if (nextUnread === 0 && wasUnread)
              setUnreadBadge((n) => Math.max(0, n - 1));

            setConversations((prev) =>
              prev
                .map((c) =>
                  c.id === updated.id
                    ? { ...c, ...updated, unread_count: nextUnread }
                    : c,
                )
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

    // Optimistically clear this row's unread state — the panel persists the
    // read position server-side (markConversationAsRead) when it mounts.
    const wasUnread = conversations.some(
      (c) => c.id === id && (c.unread_count ?? 0) > 0,
    );
    if (wasUnread) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
      );
      setUnreadBadge((n) => Math.max(0, n - 1));
    }

    const seq = ++selectSeq.current;
    setIsLoadingConv(true);
    try {
      const messages = await getMessagesAction(id);
      // A newer selection won the race — drop this stale response.
      if (seq !== selectSeq.current) return;
      setActiveMessages(messages);
    } finally {
      if (seq === selectSeq.current) setIsLoadingConv(false);
    }
  }

  // ── Conversation status update from panel ────────────────────────────────────

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
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Left rail — page title + search + list (same inset as Leads / Settings).
          Full-width pane <md; fixed 320px rail at md+ (w-80 = 320px). */}
      {showRail && (
      <div
        className="serene-wa-rail w-full md:w-80 p-4 pb-0 sm:p-6 sm:pb-0 lg:p-8 lg:pb-0"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--theme-paper)",
          borderRight: "1px solid var(--theme-paper-border)",
          overflow: "hidden",
        }}
      >
        <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
          <h1 className="type-page-title m-0">
            WhatsApp<span className="page-title-dot">.</span>
          </h1>
          {unreadBadge > 0 && (
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
              {unreadBadge > 99 ? "99+" : unreadBadge}
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
          display: "flex",
          flexDirection: "column",
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
                flex: 1,
                minHeight: 0,
              }}
            >
              <MessageCircle
                style={{
                  width: "32px",
                  height: "32px",
                  strokeWidth: 1.5,
                  color: "var(--theme-text-tertiary)",
                  animation: "serene-spin 1s linear infinite",
                }}
              />
            </div>
          ) : (
            <ConversationPanel
              key={activeConversation.id}
              conversation={activeConversation}
              initialMessages={activeMessages}
              callerProfile={callerProfile}
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
