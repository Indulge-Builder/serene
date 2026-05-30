"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { SearchBar } from "@/components/ui/SearchBar";
import { ConversationRow } from "@/components/whatsapp/ConversationRow";
import { searchConversationsAction } from "@/lib/actions/whatsapp";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import type { WhatsAppConversation } from "@/lib/types/whatsapp";

interface ConversationListProps {
  conversations:        WhatsAppConversation[];
  activeConversationId: string | null;
  onSelect:             (id: string) => void;
  onLoadMore:           () => void;
  hasMore:              boolean;
  isLoadingMore:        boolean;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: ConversationListProps) {
  const [query,           setQuery]           = useState("");
  const [searchResults,   setSearchResults]   = useState<WhatsAppConversation[] | null>(null);
  const [isSearching,     startSearchTransition] = useTransition();
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreRef  = useRef<HTMLDivElement>(null);

  // Debounced search — 300ms
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const results = await searchConversationsAction(value.trim());
        setSearchResults(results);
      });
    }, 300);
  }, []);

  // Clear debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        overflow:      "hidden",
      }}
    >
      {/* Search bar */}
      <div style={{ padding: "var(--space-3) var(--space-4)", flexShrink: 0 }}>
        <SearchBar
          value={query}
          onChange={handleQueryChange}
          placeholder="Search conversations…"
          size="sm"
        />
      </div>

      {/* Divider */}
      <div
        style={{
          height:     "1px",
          background: "var(--theme-paper-border)",
          flexShrink: 0,
        }}
      />

      {/* List */}
      <div
        style={{
          flex:                    1,
          overflowY:               "auto",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          overscrollBehavior:      "contain",
        }}
      >
        {displayList.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              textAlign:  "center",
              padding:    "var(--space-8) var(--space-4)",
              margin:     0,
            }}
          >
            {query ? "No results found." : "No conversations yet."}
          </p>
        ) : (
          <>
            {displayList.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                hasUnread={false}
                onClick={() => onSelect(conv.id)}
              />
            ))}

            {/* Load-more sentinel (IntersectionObserver target) */}
            {hasMore && !searchResults && (
              <div ref={loadMoreRef} style={{ padding: "var(--space-4)", textAlign: "center" }}>
                {isLoadingMore ? (
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize:   "var(--text-xs)",
                      color:      "var(--theme-text-tertiary)",
                    }}
                  >
                    Loading…
                  </span>
                ) : null}
              </div>
            )}

            {/* End state */}
            {!hasMore && !searchResults && displayList.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE && (
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-xs)",
                  color:      "var(--theme-text-tertiary)",
                  textAlign:  "center",
                  padding:    "var(--space-4)",
                  margin:     0,
                }}
              >
                That's everything.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

ConversationList.displayName = "ConversationList";
