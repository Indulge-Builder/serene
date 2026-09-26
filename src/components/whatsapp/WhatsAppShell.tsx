"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ConversationList } from "@/components/whatsapp/ConversationList";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { ConversationPanel } from "@/components/whatsapp/ConversationPanel";
import { EmptyConversationState } from "@/components/whatsapp/EmptyConversationState";
import { SplitWorkspace, SplitPane } from "@/components/ui/SplitWorkspace";
import { PageControls } from "@/components/layout/PageControls";
import { TOP_BAR_ENABLED } from "@/lib/constants/feature-flags";
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


/** The open conversation in the URL below md (`/whatsapp?c=<conversationId>`). */
const WA_CONVERSATION_PARAM = "c";

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
  const pathname = usePathname();
  const { period, customFrom, customTo } = parseWhatsAppPeriodFromSearchParams(searchParams);
  const skipPeriodRefetch = useRef(true);
  // ?c=<conversationId>: below md an open conversation is a history entry, so
  // hardware Back closes it instead of leaving the page (mobile audit
  // 2026-09-26; the Sia workspace's ?group= rule). Pushed through the native
  // pushState Next integrates (no page refetch); read on mount for a deep link.
  const urlConversationId = searchParams.get(WA_CONVERSATION_PARAM);
  const pushedEntry = useRef(false);
  const returnFocusId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
          schema: "gia",
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
    if (isMobile && urlConversationId !== id) {
      const next = new URLSearchParams(searchParams.toString());
      next.set(WA_CONVERSATION_PARAM, id);
      window.history.pushState(null, "", `${pathname}?${next.toString()}`);
      pushedEntry.current = true;
    }
    await openConversation(id);
  }

  function closeConversation() {
    returnFocusId.current = activeConversationId;
    setActiveConversationId(null);
    if (!urlConversationId) return;
    if (pushedEntry.current) {
      pushedEntry.current = false;
      window.history.back();
    } else {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(WA_CONVERSATION_PARAM);
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  }

  // A deep link (?c=) opens its conversation on arrival, when it is in the list.
  useEffect(() => {
    if (urlConversationId && initialConversations.some((c) => c.id === urlConversationId)) {
      void openConversation(urlConversationId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On a phone the URL is the truth: Back / Forward move it and the pane follows.
  useEffect(() => {
    if (!isMobile) return;
    if (urlConversationId === null) {
      if (activeIdRef.current !== null) {
        returnFocusId.current = activeIdRef.current;
        setActiveConversationId(null);
      }
      pushedEntry.current = false;
    } else if (urlConversationId !== activeIdRef.current && conversationsRef.current.some((c) => c.id === urlConversationId)) {
      void openConversation(urlConversationId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConversationId, isMobile]);

  // Once the rail is back, focus the row that was open. The rows carry no id
  // (ConversationList is not ours to change), so the row is found by its place
  // in the list and checked against the title before it takes focus.
  useEffect(() => {
    if (activeConversationId !== null || !returnFocusId.current) return;
    const id = returnFocusId.current;
    returnFocusId.current = null;
    const conv = conversations.find((c) => c.id === id);
    const idx = conversations.findIndex((c) => c.id === id);
    if (!conv || idx < 0) return;
    requestAnimationFrame(() => {
      const rows = rootRef.current?.querySelectorAll<HTMLElement>("button[aria-pressed]");
      const row = rows?.[idx];
      if (!row || !row.textContent?.includes(conv.lead_name ?? conv.phone)) return;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  async function openConversation(id: string) {
    if (id === activeIdRef.current) return;
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
    // The Sia layout (2026-09-25): page header, then the rail card beside the pane
    // card on the workspace ground (ui/SplitWorkspace), never a full-bleed split.
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col">
      <div className="mb-6 flex shrink-0 items-center gap-4">
        <h1 className="type-page-title m-0" style={{ marginRight: "auto" }}>
          WhatsApp<span className="page-title-dot">.</span>
        </h1>
        {unreadBadge > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "22px",
              padding: "0 var(--space-2)",
              borderRadius: "var(--radius-full)",
              background: "var(--theme-accent)",
              color: "var(--theme-accent-fg)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              flexShrink: 0,
            }}
          >
            {unreadBadge > 99 ? "99+" : unreadBadge} unread
          </span>
        )}
        {/* The shared title-row controls (bell), as on every other page. WhatsApp is
            not domain-aware, so never the domain selector. */}
        {TOP_BAR_ENABLED && (
          <PageControls isPrivileged={false} />
        )}
      </div>

      <SplitWorkspace>
        {showRail && (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore || isRefetchingList}
            period={period}
          />
        )}

        {showPane &&
          (activeConversation ? (
            isLoadingConv ? (
              <SplitPane className="flex items-center justify-center">
                <LogoSpinner size="md" />
              </SplitPane>
            ) : (
              <SplitPane>
                <ConversationPanel
                  key={activeConversation.id}
                  conversation={activeConversation}
                  initialMessages={activeMessages}
                  callerProfile={callerProfile}
                  onBack={isMobile ? closeConversation : undefined}
                />
              </SplitPane>
            )
          ) : (
            <SplitPane className="hidden md:flex items-center justify-center">
              <EmptyConversationState />
            </SplitPane>
          ))}
      </SplitWorkspace>
    </div>
  );
}

WhatsAppShell.displayName = "WhatsAppShell";
