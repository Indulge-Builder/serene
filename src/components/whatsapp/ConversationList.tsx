"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConversationRailRow } from "@/components/ui/ConversationRailRow";
import { SplitRail, SplitRailHeader, SplitRailList } from "@/components/ui/SplitWorkspace";
import { useDebounce } from "@/hooks/useDebounce";
import { formatRelativeTime } from "@/lib/utils/dates";
import { WhatsAppConversationPeriodFilter } from "@/components/whatsapp/WhatsAppConversationPeriodFilter";
import { searchConversationsAction } from "@/lib/actions/whatsapp";
import type { WhatsAppPeriod } from "@/lib/constants/whatsapp-period";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import type { WhatsAppConversation } from "@/lib/types/whatsapp";

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

  // The rail card (ui/SplitWorkspace): search + period in the header strip, then
  // the rows. The Sia rail's anatomy, so the two conversation pages read the same.
  return (
    <SplitRail>
      <SplitRailHeader>
        <SearchBar
          value={query}
          onChange={handleQueryChange}
          placeholder="Search conversations…"
          size="sm"
          aria-label="Search conversations"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
            Conversations
          </span>
          <WhatsAppConversationPeriodFilter />
        </div>
      </SplitRailHeader>

      <SplitRailList>
        {displayList.length === 0 ? (
          <div className="py-10 px-4">
            <EmptyState
              variant="inline"
              title={query ? "No results found." : period ? "Nothing matches this period." : "No conversations yet."}
            />
          </div>
        ) : (
          <>
            {displayList.map((conv, i) => (
              <ConversationRailRow
                key={conv.id}
                title={conv.lead_name ?? conv.phone}
                // The number under the name, unless the number already IS the title.
                preview={conv.lead_name ? (conv.lead_phone ?? conv.phone) : null}
                meta={conv.last_message_at ? formatRelativeTime(conv.last_message_at) : null}
                selected={conv.id === activeConversationId}
                unread={(conv.unread_count ?? 0) > 0}
                index={i}
                onSelect={() => onSelect(conv.id)}
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
              displayList.length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE && (
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
                  That&apos;s everything.
                </p>
              )}
          </>
        )}
      </SplitRailList>
    </SplitRail>
  );
}

ConversationList.displayName = "ConversationList";
