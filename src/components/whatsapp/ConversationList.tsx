"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/ui/SearchBar";
import { useDebounce } from "@/hooks/useDebounce";
import { ConversationRow } from "@/components/whatsapp/ConversationRow";
import { WhatsAppConversationPeriodFilter } from "@/components/whatsapp/WhatsAppConversationPeriodFilter";
import { searchConversationsAction } from "@/lib/actions/whatsapp";
import type { WhatsAppPeriod } from "@/lib/constants/whatsapp-period";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import type { WhatsAppConversation } from "@/lib/types/whatsapp";

const RAIL_CARD: CSSProperties = {
  background: "var(--theme-paper)",
  border: "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-1)",
  overflow: "hidden",
};

const RAIL_CARD_LABEL: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-2xs)",
  fontWeight: "var(--weight-medium)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--theme-text-tertiary)",
};

const RAIL_CARD_HEADER: CSSProperties = {
  flexShrink: 0,
  padding: "var(--space-3) var(--space-4) var(--space-2)",
  borderBottom: "1px solid var(--theme-paper-border)",
};

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  period: WhatsAppPeriod | null;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onLoadMore,
  hasMore,
  isLoadingMore,
  period,
}: ConversationListProps) {
  const searchParams = useSearchParams();
  const { customFrom, customTo } = parseWhatsAppPeriodFromSearchParams(searchParams);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    WhatsAppConversation[] | null
  >(null);
  const [, startSearchTransition] = useTransition();
  const debouncedQuery = useDebounce(query, 300);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    // Clearing the input clears results immediately — never waits for the debounce.
    if (!value.trim()) setSearchResults(null);
  }, []);

  // Debounced search (300ms). Also re-runs immediately when the period changes
  // while a query is active (debouncedQuery is already settled in that case).
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) return;
    startSearchTransition(async () => {
      const results = await searchConversationsAction({
        query: trimmed,
        ...(period
          ? { period, customFrom: customFrom ?? undefined, customTo: customTo ?? undefined }
          : {}),
      });
      setSearchResults(results);
    });
  }, [debouncedQuery, period, customFrom, customTo]);

  // IntersectionObserver for "Load more" (P-05 — no scroll listener)
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const displayList = searchResults ?? conversations;

  function staggerDelay(i: number) {
    return Math.min(i * 35, 280);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          marginRight: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        {/* Search card — bar only, no section header */}
        <div style={{ ...RAIL_CARD, flexShrink: 0, padding: "var(--space-3) var(--space-4)" }}>
            <SearchBar
              value={query}
              onChange={handleQueryChange}
              placeholder="Search conversations…"
              size="sm"
              variant="default"
              aria-label="Search conversations"
            />
        </div>

        {/* Conversations card */}
        <div
          style={{
            ...RAIL_CARD,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              ...RAIL_CARD_HEADER,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 0,
            }}
          >
            <span style={RAIL_CARD_LABEL}>Conversations</span>
            <WhatsAppConversationPeriodFilter />
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--space-1)",
              WebkitOverflowScrolling:
                "touch" as React.CSSProperties["WebkitOverflowScrolling"],
              overscrollBehavior: "contain",
            }}
          >
            {displayList.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "var(--text-sm)",
                  color: "var(--theme-text-tertiary)",
                  textAlign: "center",
                  padding: "var(--space-8) var(--space-4)",
                  margin: 0,
                }}
              >
                {query
                  ? "No results found."
                  : period
                    ? "Nothing matches this period."
                    : "No conversations yet."}
              </p>
            ) : (
              <>
                {displayList.map((conv, i) => (
                  <ConversationRow
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversationId}
                    hasUnread={(conv.unread_count ?? 0) > 0}
                    onClick={() => onSelect(conv.id)}
                    delay={staggerDelay(i)}
                  />
                ))}

                {hasMore && !searchResults && (
                  <div
                    ref={loadMoreRef}
                    style={{ padding: "var(--space-4)", textAlign: "center" }}
                  >
                    {isLoadingMore ? (
                      <span
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "var(--text-xs)",
                          color: "var(--theme-text-tertiary)",
                        }}
                      >
                        Loading…
                      </span>
                    ) : null}
                  </div>
                )}

                {!hasMore &&
                  !searchResults &&
                  displayList.length >=
                    WHATSAPP_CONVERSATIONS_PAGE_SIZE && (
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-xs)",
                        color: "var(--theme-text-tertiary)",
                        textAlign: "center",
                        padding: "var(--space-4)",
                        margin: 0,
                      }}
                    >
                      That's everything.
                    </p>
                  )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ConversationList.displayName = "ConversationList";
