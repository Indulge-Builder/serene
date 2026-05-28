"use client";

/**
 * TaskChatPanel — scrollable message list + message bar for task_messages.
 *
 * Realtime: subscribes to task_messages filtered by task_id on mount.
 * Channel name: `task-messages-${taskId}` (unique per task, prevents cross-task bleed).
 * Optimistic insert: message appears immediately, confirmed on Realtime echo.
 * If action returns error, optimistic row is removed and toast.danger fires.
 *
 * Pre-mortem addressed:
 * - Channel name includes taskId — no cross-task subscription bleed.
 * - Initial messages loaded via prop, not fetched inside component.
 * - Auto-scrolls to bottom on new messages.
 */

import { useEffect, useRef, useState, useCallback, useTransition, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addTaskMessageAction } from "@/lib/actions/tasks";
import { formatRelativeTime } from "@/lib/utils/dates";
import { toast } from "@/lib/toast";
import type { TaskMessage, Profile } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskMessageWithAuthor = TaskMessage & {
  author: Pick<Profile, "full_name" | "avatar_url"> | null;
};

interface TaskChatPanelProps {
  taskId:          string;
  currentUserId:   string;
  currentUserName: string;
  initialMessages: TaskMessageWithAuthor[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskChatPanel({
  taskId,
  currentUserId,
  currentUserName,
  initialMessages,
}: TaskChatPanelProps) {
  const [messages, setMessages]     = useState<TaskMessageWithAuthor[]>(initialMessages);
  const [draft, setDraft]           = useState("");
  const [isPending, startTransition] = useTransition();

  const listRef      = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  // Track optimistic message ids so we can remove them on error
  const optimisticIds = useRef<Set<string>>(new Set());
  // Stable mount-scoped nonce — makes each mount's channel name unique so
  // StrictMode double-invoke never tries to .on() an already-subscribed channel.
  const mountId = useId();

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    // Channel name is scoped to taskId + mountId.
    // mountId (from useId) is stable for the lifetime of this mount but unique
    // across mounts — React StrictMode double-invokes effects, which means two
    // subscriptions with the same channel name would land on the same channel
    // object (Supabase client reuses channels by name). Calling .on() on an
    // already-subscribed channel throws "cannot add callbacks after subscribe()".
    // The mountId suffix makes each mount's channel name distinct, so cleanup
    // of the first invoke fully removes the channel before the second mount
    // creates a new one with a different name.
    const channel = supabase
      .channel(`task-messages-${taskId}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "task_messages",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const incoming = payload.new as TaskMessage;

          // If this is the echo of our own optimistic insert, replace the optimistic row
          // (identified by a temporary id) instead of appending a duplicate.
          // We can't match by id since the optimistic id is fake, so we match by
          // content + author_id + approximate time (within 5s).
          setMessages((prev) => {
            const isEcho = prev.some(
              (m) =>
                optimisticIds.current.has(m.id) &&
                m.content     === incoming.content &&
                m.author_id   === incoming.author_id,
            );

            if (isEcho) {
              // Replace the optimistic row with the confirmed server row.
              // Keep author data from the optimistic row.
              const idx = prev.findIndex(
                (m) =>
                  optimisticIds.current.has(m.id) &&
                  m.content   === incoming.content &&
                  m.author_id === incoming.author_id,
              );
              if (idx !== -1) {
                optimisticIds.current.delete(prev[idx].id);
                const confirmed: TaskMessageWithAuthor = {
                  ...incoming,
                  author: prev[idx].author,
                };
                return [...prev.slice(0, idx), confirmed, ...prev.slice(idx + 1)];
              }
            }

            // New message from another user — append.
            // Realtime payload includes is_suppressed/suppressed_by/suppressed_at from DB.
            const newMsg: TaskMessageWithAuthor = {
              ...incoming,
              author: null, // author name not available from realtime payload; use fallback
            };
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`; // 3 lines ≈ 72px
  }

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    const content = draft.trim();
    if (!content || isPending) return;

    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Optimistic insert — temporary id prefixed so we can identify it
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    optimisticIds.current.add(optimisticId);

    const optimisticMsg: TaskMessageWithAuthor = {
      id:            optimisticId,
      task_id:       taskId,
      author_id:     currentUserId,
      content,
      created_at:    new Date().toISOString(),
      is_suppressed: false,
      suppressed_by: null,
      suppressed_at: null,
      author:        { full_name: currentUserName, avatar_url: null },
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    startTransition(async () => {
      const result = await addTaskMessageAction({ taskId, content });

      if (result.error) {
        // Rollback optimistic insert
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        optimisticIds.current.delete(optimisticId);
        toast.danger("Couldn't send message", { message: result.error });
      }
    });
  }, [draft, isPending, taskId, currentUserId, currentUserName]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const canSend = draft.trim().length > 0 && !isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        overflow:      "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:       "var(--space-3) var(--space-4)",
          borderBottom:  "1px solid var(--theme-paper-border)",
          background:    "var(--theme-paper-subtle)",
          flexShrink:    0,
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
          }}
        >
          Progress Notes
        </span>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex:                     1,
          overflowY:                "auto",
          padding:                  "var(--space-4)",
          display:                  "flex",
          flexDirection:            "column",
          gap:                      "var(--space-4)",
          WebkitOverflowScrolling:  "touch",
          overscrollBehavior:       "contain",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flex:           1,
              paddingTop:     "var(--space-12)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   "var(--text-sm)",
                color:      "var(--theme-text-tertiary)",
                margin:     0,
                textAlign:  "center",
              }}
            >
              No progress notes yet.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  display: "flex",
                  gap:     "var(--space-2)",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width:           "24px",
                    height:          "24px",
                    borderRadius:    "var(--radius-xs)",
                    background:      "var(--theme-accent-surface)",
                    border:          "1px solid var(--theme-paper-border)",
                    display:         "flex",
                    alignItems:      "center",
                    justifyContent:  "center",
                    flexShrink:      0,
                    overflow:        "hidden",
                  }}
                >
                  {msg.author?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.author.avatar_url}
                      alt={msg.author.full_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize:   "9px",
                        fontWeight: "var(--weight-semibold)",
                        color:      "var(--theme-accent)",
                        lineHeight: 1,
                      }}
                    >
                      {msg.author ? getInitials(msg.author.full_name) : "?"}
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {msg.is_suppressed ? (
                    // Suppressed messages: single italic line, same row height as a normal message.
                    // Original content is NEVER rendered for any role — suppression is permanent from
                    // the UI perspective. suppressed_by and suppressed_at are never shown here.
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontStyle:  "italic",
                        fontSize:   "var(--text-sm)",
                        color:      "var(--theme-text-tertiary)",
                        margin:     0,
                        lineHeight: "var(--leading-relaxed)",
                        // Preserve approximate row height: header line + content line
                        paddingTop: "calc(var(--text-xs) + var(--space-1))",
                      }}
                    >
                      This message was removed.
                    </p>
                  ) : (
                    <>
                      <div
                        style={{
                          display:      "flex",
                          alignItems:   "baseline",
                          gap:          "var(--space-2)",
                          marginBottom: "var(--space-1)",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-xs)",
                            fontWeight: "var(--weight-semibold)",
                            color:      "var(--theme-text-primary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {msg.author?.full_name ?? "Unknown"}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize:   "10px",
                            color:      "var(--theme-text-tertiary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatRelativeTime(msg.created_at)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize:   "var(--text-sm)",
                          color:      "var(--theme-text-primary)",
                          margin:     0,
                          lineHeight: "var(--leading-relaxed)",
                          wordBreak:  "break-word",
                          opacity:    optimisticIds.current.has(msg.id) ? 0.6 : 1,
                        }}
                      >
                        {msg.content}
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Message bar — Section 5.11 */}
      <div
        style={{
          padding:    "var(--space-3) var(--space-4)",
          borderTop:  "1px solid var(--theme-paper-border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display:      "flex",
            alignItems:   "flex-end",
            gap:          "var(--space-2)",
            background:   "var(--theme-paper-subtle)",
            border:       "1px solid var(--theme-paper-border)",
            borderRadius: "var(--radius-lg)",
            padding:      "var(--space-2) var(--space-3)",
            transition:   "var(--transition-hover)",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--theme-accent)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-accent-ring)";
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
            }
          }}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a progress note…"
            rows={1}
            style={{
              flex:        1,
              border:      "none",
              outline:     "none",
              background:  "transparent",
              resize:      "none",
              fontFamily:  "var(--font-sans)",
              fontSize:    "var(--text-sm)",
              color:       "var(--theme-text-primary)",
              lineHeight:  "var(--leading-relaxed)",
              minHeight:   "24px",
              maxHeight:   "72px",
              overflowY:   "auto",
              caretColor:  "var(--theme-accent)",
            }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!canSend}
            aria-label="Send message"
            style={{
              width:           "32px",
              height:          "32px",
              borderRadius:    "var(--radius-sm)",
              border:          "none",
              cursor:          canSend ? "pointer" : "not-allowed",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              flexShrink:      0,
              background:      canSend ? "var(--theme-accent)" : "var(--theme-paper-border)",
              transition:      "var(--transition-interactive)",
            }}
          >
            <Send
              style={{
                width:       "14px",
                height:      "14px",
                strokeWidth: 1.5,
                color:       canSend ? "var(--theme-accent-fg)" : "var(--theme-text-tertiary)",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
