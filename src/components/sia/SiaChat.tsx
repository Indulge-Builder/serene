"use client";

// The Sia chat pane — a read-only WhatsApp-Web-style viewer over one group.
// There is deliberately NO compose bar: Serene never sends into these groups
// (the watcher is a silent ear, plan-whatsapp §6.1).
//
// Live tail: while the chat is open and the tab visible, a 4s poll through the
// role-gated action appends anything newer than the last known message. This is
// the pilot's "realtime" — wag_ tables are service_role-only (deny-by-default
// RLS), so client-side Supabase Realtime would deliver nothing; the poll keeps
// every byte behind the admin/founder action boundary (Q-13). Push transport can
// replace the interval when the connector moves to Fargate (Sia W1).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ClipboardPlus, Search, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { TICKETS_PATH } from "@/lib/constants/tickets";
import { TICKET_SELECTION_KEY, type TicketSelection } from "@/components/tickets/NewTicketForm";
import { Avatar } from "@/components/ui/Avatar";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { CollapseReveal } from "@/components/ui/CollapseReveal";
import { useDebounce } from "@/hooks/useDebounce";
import { scrollToBottom } from "@/lib/utils/scroll";
import { formatDate } from "@/lib/utils/dates";
import { SPRING_CONFIG, FAST_DURATION, EASE_IN_OUT } from "@/lib/constants/motion";
import { getSiaMessagesAction, searchSiaMessagesAction } from "@/lib/actions/sia";
import { SiaDaySeparator, SiaMessageBubble } from "./SiaMessageBubble";
import { SiaGroupInfoPanel } from "./SiaGroupInfoPanel";
import { groupTitle, senderLabel, SiaKindPill } from "./sia-shared";
import type { SiaGroupRow, SiaMessageRow, SiaSearchHit } from "@/lib/services/sia-service";

const LIVE_POLL_MS = 4000;
const NEAR_BOTTOM_PX = 140;

export function SiaChat({
  group,
  isMobile,
  onBack,
  onLiveMessages,
  onPatchGroup,
}: {
  group: SiaGroupRow;
  isMobile: boolean;
  onBack: () => void;
  /** Lets the rail update its preview/count when new messages land here. */
  onLiveMessages: (groupJid: string, latest: SiaMessageRow[], addedCount: number) => void;
  /** Mapping writes from the info panel patch the shared group state. */
  onPatchGroup: (jid: string, patch: Partial<SiaGroupRow>) => void;
}) {
  const [messages, setMessages] = useState<SiaMessageRow[]>([]);
  // Ticket creation from selected messages (member-ticket-plan.md 7.8, phase 1): a selection
  // mode over the stream; the chosen messages go to /tickets/new through sessionStorage.
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const startTicket = useCallback(() => {
    if (!group.member_id) { toast.warning("Link this group to a member first (Group info → Linked member)."); return; }
    const chosen = messages.filter((m) => selectedIds.has(m.id)).sort((a, b) => a.wa_timestamp.localeCompare(b.wa_timestamp));
    if (chosen.length === 0) return;
    const payload: TicketSelection = {
      member_id: group.member_id, member_name: groupTitle(group), queendom_id: null, group_jid: group.group_jid,
      messages: chosen.map((m) => ({ chat_jid: group.group_jid, wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, sender_name: m.sender_name, from_member: !m.from_me, at: m.wa_timestamp, text: m.text ?? (m.media ? `[${m.type}]` : "") })),
    };
    try { sessionStorage.setItem(TICKET_SELECTION_KEY, JSON.stringify(payload)); } catch { /* storage unavailable: the form falls back to manual */ }
    router.push(`${TICKETS_PATH}/new?member=${group.member_id}&from=sia`);
  }, [group, messages, selectedIds, router]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [hits, setHits] = useState<SiaSearchHit[] | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const latestTs = useRef<string | null>(null);
  const liveIds = useRef<Set<string>>(new Set());
  const loadingMoreRef = useRef(false);
  const pollFails = useRef(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useDebounce(searchInput, 350);
  const searching = hits !== null;

  const nearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // ── Initial page ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSiaMessagesAction(group.group_jid).then((res) => {
      if (!alive) return;
      if (res.data) {
        setMessages(res.data.messages);
        setHasMore(res.data.hasMore);
        knownIds.current = new Set(res.data.messages.map((m) => m.id));
        latestTs.current = res.data.messages.at(-1)?.wa_timestamp ?? null;
      }
      setLoading(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollToBottom(scrollRef.current);
      });
    });
    return () => {
      alive = false;
    };
  }, [group.group_jid]);

  // ── Live tail — the 4s poll ──
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!latestTs.current) return;
      let res: Awaited<ReturnType<typeof getSiaMessagesAction>>;
      try {
        res = await getSiaMessagesAction(group.group_jid, { after: latestTs.current });
        if (res.error) throw new Error(res.error);
        pollFails.current = 0;
      } catch {
        // A deploy invalidates an old tab's server-action ids and the poll dies
        // SILENTLY (2026-08-29 live-tail incident) — after a failure streak,
        // say so instead of pretending the groups went quiet.
        pollFails.current += 1;
        if (pollFails.current >= 3) setNeedsReload(true);
        return;
      }
      const fresh = (res.data?.messages ?? []).filter((m) => !knownIds.current.has(m.id));
      if (fresh.length === 0) return;
      for (const m of fresh) {
        knownIds.current.add(m.id);
        liveIds.current.add(m.id);
      }
      latestTs.current = fresh.at(-1)!.wa_timestamp;
      const stick = nearBottom();
      setMessages((prev) => [...prev, ...fresh]);
      onLiveMessages(group.group_jid, fresh, fresh.length);
      if (stick && !searching) {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollToBottom(scrollRef.current);
        });
      } else {
        setUnseen((n) => n + fresh.length);
      }
    };
    const t = setInterval(tick, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [group.group_jid, onLiveMessages, searching]);

  // ── Clear the unseen pill once the reader reaches the bottom ──
  const handleScroll = useCallback(() => {
    if (unseen > 0 && nearBottom()) setUnseen(0);
  }, [unseen]);

  const jumpToLatest = useCallback(() => {
    if (scrollRef.current) scrollToBottom(scrollRef.current);
    setUnseen(0);
  }, []);

  // ── Older history (scroll position preserved) ──
  const loadOlder = useCallback(async () => {
    if (loadingMoreRef.current || messages.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const oldest = messages[0].wa_timestamp;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const res = await getSiaMessagesAction(group.group_jid, { before: oldest });
    if (res.data) {
      const older = res.data.messages.filter((m) => !knownIds.current.has(m.id));
      for (const m of older) knownIds.current.add(m.id);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(res.data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [group.group_jid, messages]);

  // ── Seamless history: auto-fetch when the reader nears the top (P-05 —
  //    the ConversationList IntersectionObserver pattern; 300px early margin
  //    so the page usually lands before the reader ever sees the seam). ──
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || loading || searching) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMoreRef.current) {
          void loadOlderRef.current();
        }
      },
      { root, rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [group.group_jid, loading, searching]);

  // ── Reply-strip jump: scroll to the quoted original, flash it briefly.
  //    If it isn't loaded yet, pull up to 3 older pages looking for it. ──
  const jumpToMessage = useCallback(async (waMessageId: string) => {
    const find = () =>
      scrollRef.current?.querySelector(`[data-wa-id="${CSS.escape(waMessageId)}"]`) ?? null;
    let el = find();
    for (let i = 0; i < 3 && !el && hasMoreRef.current; i++) {
      await loadOlderRef.current();
      await new Promise((r) => requestAnimationFrame(r));
      el = find();
    }
    if (!el) return; // original beyond reach — the strip itself still shows its preview
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashId(waMessageId);
    flashTimer.current = setTimeout(() => setFlashId(null), 1400);
  }, []);

  // ── In-group search (debounced) ──
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    let alive = true;
    searchSiaMessagesAction(q, group.group_jid).then((res) => {
      if (alive && res.data) setHits(res.data);
    });
    return () => {
      alive = false;
    };
  }, [debouncedSearch, group.group_jid]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchInput("");
    setHits(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollToBottom(scrollRef.current);
    });
  }, []);

  const memberMeta = useMemo(() => {
    const parts: string[] = [];
    if (group.member_count) parts.push(`${group.member_count} members`);
    parts.push(`${group.message_count.toLocaleString("en-IN")} messages`);
    return parts.join(" · ");
  }, [group.member_count, group.message_count]);

  return (
    <section
      className="relative flex flex-col min-h-0 flex-1 rounded-(--radius-lg) border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1) overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="px-4 py-2.5 border-b border-(--theme-paper-border) bg-(--theme-paper)">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="serene-pressable shrink-0 w-8 h-8 rounded-full border border-(--theme-paper-border) bg-(--theme-paper) flex items-center justify-center text-(--theme-text-secondary)"
              style={{ cursor: "pointer" }}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="Open group info"
            title="Group info"
            className="min-w-0 flex-1 flex items-center gap-3 text-left border-0 bg-transparent rounded-(--radius-md) px-1 py-0.5 -mx-1 hover:bg-(--theme-paper-subtle)"
            style={{ cursor: "pointer", transition: "background var(--duration-fast) var(--ease-in-out)" }}
          >
            <Avatar name={groupTitle(group)} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="type-body-sm font-(--weight-medium) text-(--theme-text-primary) truncate">
                  {groupTitle(group)}
                </span>
                <SiaKindPill kind={group.group_kind} />
              </div>
              <div className="type-caption text-(--theme-text-tertiary) truncate inline-flex items-center gap-1">
                <Users className="w-3 h-3" strokeWidth={1.5} />
                {memberMeta}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setSelecting((v) => !v); setSelectedIds(new Set()); }}
            aria-label={selecting ? "Cancel selection" : "Create a ticket from messages"}
            title={selecting ? "Cancel selection" : "Create a ticket from messages"}
            className="serene-pressable shrink-0 w-8 h-8 rounded-full border flex items-center justify-center"
            style={{
              cursor: "pointer",
              borderColor: selecting ? "var(--theme-accent)" : "var(--theme-paper-border)",
              background: selecting ? "var(--theme-accent-surface)" : "var(--theme-paper)",
              color: selecting ? "var(--neu-accent-deep)" : "var(--theme-text-secondary)",
            }}
          >
            <ClipboardPlus className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            aria-label={searchOpen ? "Close search" : "Search this conversation"}
            title={searchOpen ? "Close search" : "Search this conversation"}
            className="serene-pressable shrink-0 w-8 h-8 rounded-full border flex items-center justify-center"
            style={{
              cursor: "pointer",
              borderColor: searchOpen ? "var(--theme-accent)" : "var(--theme-paper-border)",
              background: searchOpen ? "var(--theme-accent-surface)" : "var(--theme-paper)",
              color: searchOpen ? "var(--neu-accent-deep)" : "var(--theme-text-secondary)",
            }}
          >
            {searchOpen ? <X className="w-4 h-4" strokeWidth={1.5} /> : <Search className="w-4 h-4" strokeWidth={1.5} />}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {searchOpen && (
            <CollapseReveal key="sia-chat-search">
              <div className="pt-2.5">
                <SearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder="Search this conversation"
                  size="sm"
                  autoFocus
                  aria-label="Search messages in this group"
                />
              </div>
            </CollapseReveal>
          )}
        </AnimatePresence>
      </div>

      {/* ── Body: the wallpapered stream (or search results) ── */}
      <div className="relative flex-1 min-h-0 flex flex-col" style={{ background: "var(--theme-paper-subtle)" }}>
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6">
          {searching ? (
            <SiaSearchResults hits={hits} query={debouncedSearch} />
          ) : loading ? (
            <div className="h-full flex items-center justify-center">
              <LogoSpinner size="md" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState variant="inline" title="No messages captured yet" />
            </div>
          ) : (
            <>
              {/* Seamless history sentinel — crossing it auto-fetches the next
                  older page; the chip only shows while a fetch is in flight. */}
              <div ref={topSentinelRef} aria-hidden style={{ height: 1 }} />
              {loadingMore && hasMore && (
                <div className="flex justify-center mb-2">
                  <span
                    className="type-caption rounded-full px-3.5 py-1 inline-flex items-center gap-1.5"
                    style={{
                      background: "var(--neu-surface-high)",
                      boxShadow: "var(--neu-shadow-chip)",
                      color: "var(--theme-text-secondary)",
                      fontWeight: "var(--weight-medium)",
                    }}
                  >
                    Loading earlier messages…
                  </span>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  data-wa-id={m.wa_message_id}
                  onClick={selecting ? () => toggleSelected(m.id) : undefined}
                  style={selecting ? { cursor: "pointer", borderRadius: "var(--radius-md)", outline: selectedIds.has(m.id) ? "2px solid var(--theme-accent)" : "2px solid transparent", outlineOffset: 2, transition: "outline-color var(--duration-fast) var(--ease-in-out)" } : undefined}
                  aria-selected={selecting ? selectedIds.has(m.id) : undefined}
                >
                  {(!messages[i - 1] ||
                    new Date(messages[i - 1].wa_timestamp).toDateString() !==
                      new Date(m.wa_timestamp).toDateString()) && <SiaDaySeparator ts={m.wa_timestamp} />}
                  <SiaMessageBubble
                    m={m}
                    prev={messages[i - 1]}
                    chatJid={group.group_jid}
                    entrance={liveIds.current.has(m.id)}
                    flash={flashId === m.wa_message_id}
                    onJumpToQuoted={jumpToMessage}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Selection bar: N messages chosen → the new-ticket page pre-filled by the creator ── */}
        <AnimatePresence>
          {selecting && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: FAST_DURATION, ease: EASE_IN_OUT }}
              className="absolute left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-3 rounded-full px-4 py-2"
              style={{ background: "var(--theme-paper)", border: "1px solid var(--theme-paper-border)", boxShadow: "var(--shadow-3)", zIndex: "var(--z-raised)" }}
            >
              <span className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>{selectedIds.size} selected</span>
              <button type="button" onClick={startTicket} disabled={selectedIds.size === 0} className="serene-btn-primary serene-pressable type-caption rounded-full px-3 py-1" style={{ cursor: selectedIds.size ? "pointer" : "default", opacity: selectedIds.size ? 1 : 0.5 }}>
                Create ticket
              </button>
              <button type="button" onClick={() => { setSelecting(false); setSelectedIds(new Set()); }} className="type-caption" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--theme-text-tertiary)" }}>Cancel</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stale-build pill: the poll failed repeatedly (a deploy outdated
            this tab) — live messages are flowing, this tab just can't hear
            them until it reloads. ── */}
        <AnimatePresence>
          {needsReload && (
            <motion.button
              key="sia-reload"
              type="button"
              onClick={() => window.location.reload()}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING_CONFIG}
              className="serene-pressable absolute left-1/2 -translate-x-1/2 rounded-full inline-flex items-center gap-1.5 border-0 type-caption"
              style={{
                top: "12px",
                padding: "5px 14px",
                background: "var(--color-warning-light)",
                color: "var(--color-warning-text)",
                boxShadow: "var(--shadow-2)",
                cursor: "pointer",
                fontWeight: "var(--weight-medium)",
                zIndex: "var(--z-raised)",
              }}
            >
              Serene was updated — tap to refresh
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── New-messages pill (arrivals while scrolled up) ── */}
        <AnimatePresence>
          {unseen > 0 && !searching && (
            <motion.button
              key="sia-unseen"
              type="button"
              onClick={jumpToLatest}
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, transition: { duration: FAST_DURATION, ease: EASE_IN_OUT } }}
              transition={SPRING_CONFIG}
              className="serene-pressable absolute left-1/2 -translate-x-1/2 rounded-full inline-flex items-center gap-1.5 border-0 type-caption"
              style={{
                bottom: "16px",
                padding: "5px 14px",
                background: "var(--theme-accent)",
                color: "var(--theme-accent-fg)",
                boxShadow: "var(--shadow-2)",
                cursor: "pointer",
                fontWeight: "var(--weight-medium)",
                zIndex: "var(--z-raised)",
              }}
            >
              <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} />
              {unseen} new {unseen === 1 ? "message" : "messages"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Group info panel (parallel side panel over the pane) ── */}
      <AnimatePresence>
        {infoOpen && (
          <SiaGroupInfoPanel
            key={`info-${group.group_jid}`}
            group={group}
            onClose={() => setInfoOpen(false)}
            onPatchGroup={onPatchGroup}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function SiaSearchResults({ hits, query }: { hits: SiaSearchHit[] | null; query: string }) {
  if (!hits || hits.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState variant="inline" title={hits ? `Nothing matches "${query.trim()}"` : "Searching…"} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="type-caption text-(--theme-text-tertiary)">
        {hits.length} match{hits.length === 1 ? "" : "es"}
      </div>
      {hits.map((h) => (
        <motion.div
          key={h.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: FAST_DURATION, ease: EASE_IN_OUT }}
          className="rounded-(--radius-md) px-3.5 py-2.5 border border-(--neu-edge)"
          style={{ background: "var(--neu-surface-high)", boxShadow: "var(--neu-shadow-chip)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-0.5">
            <span
              className="type-caption truncate"
              style={{ color: "var(--theme-text-secondary)", fontWeight: "var(--weight-medium)" }}
            >
              {senderLabel(h)}
            </span>
            <span
              className="tabular-nums shrink-0"
              style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--theme-text-tertiary)" }}
            >
              {formatDate(h.wa_timestamp, "h:mm a, d MMM yyyy")}
            </span>
          </div>
          <div className="type-body-sm text-(--theme-text-primary)" style={{ wordBreak: "break-word" }}>
            {h.text ?? `(${h.type})`}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
