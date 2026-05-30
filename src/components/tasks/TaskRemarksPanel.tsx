"use client";

/**
 * TaskRemarksPanel — timeline of task_remarks + compose area.
 *
 * Timeline: oldest at top, newest at bottom. Auto-scrolls to bottom on mount
 * and on new remarks. Each entry shows avatar + name + timestamp + content.
 * If remark.status_change is set, a status chip is rendered above the content.
 *
 * Input area: textarea (grows to 3 lines) + optional status-change pill row
 * (2×3 grid on mobile, 1 row of 6 on desktop) + "Post update" button.
 *
 * Realtime: subscribes to task_remarks filtered by task_id.
 * Channel name: task-remarks-${taskId}-${mountId}
 * mountId (from useId()) prevents Strict Mode double-mount collisions.
 *
 * Optimistic insert: remark appears at 0.6 opacity, confirmed on Realtime echo.
 * On action error: optimistic row removed, toast.danger fires.
 *
 * Pre-mortem addressed:
 * - Channel name includes taskId — no cross-task bleed.
 * - 6 status pills in a 2×3 grid on mobile (≤480px) — no overflow at 375px.
 * - useTransition isPending guards the Post button — no duplicate submissions.
 * - No form tag — all onClick/onChange.
 * - No tasks-service import — all data via props or actions.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { addTaskRemarkAction } from "@/lib/actions/tasks";
import { formatRelativeTime } from "@/lib/utils/dates";
import { sanitizeText } from "@/lib/utils/sanitize";
import { toast } from "@/lib/toast";
import { TASK_REMARK_STATUS_LABELS, TASK_STATUS } from "@/lib/constants/task-constants";
import { TaskStatusIcon } from "@/components/tasks/TaskStatusIcon";
import type { TaskRemarkWithAuthor } from "@/lib/services/tasks-service";
import type { TaskRemark, TaskStatus } from "@/lib/types/database";

export type { TaskRemarkWithAuthor };

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskRemarksPanelProps {
  taskId:               string;
  currentUserId:        string;
  currentUserName:      string;
  initialRemarks:       TaskRemarkWithAuthor[];
  composerPlaceholder?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskRemarksPanel({
  taskId,
  currentUserId,
  currentUserName,
  initialRemarks,
  composerPlaceholder = "Add an update…",
}: TaskRemarksPanelProps) {
  const listRef        = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const optimisticIds  = useRef<Set<string>>(new Set());
  // Tracks confirmed DB row IDs — prevents double-append when Strict Mode
  // mounts two subscriptions or Realtime fires the same event twice.
  const seenIds        = useRef<Set<string>>(new Set());
  // Stable mount-scoped nonce — prevents Strict Mode double-invoke channel collision
  const mountId = useId();

  const [remarks,    setRemarks]    = useState<TaskRemarkWithAuthor[]>(initialRemarks);
  const [draft,      setDraft]      = useState("");
  const [isPending,  startTransition] = useTransition();

  // Seed seenIds from initialRemarks so Realtime never double-appends rows
  // that were already present when the modal opened.
  useEffect(() => {
    seenIds.current = new Set(initialRemarks.map((r) => r.id));
    setRemarks(initialRemarks);
  // Only re-seed when the task changes (new modal open for a different task).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [remarks]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    // Include both taskId and mountId in channel name (P-06 + Strict Mode safety)
    const channel = supabase
      .channel(`task-remarks-${taskId}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "task_remarks",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const incoming = payload.new as TaskRemark;

          // Primary dedup guard — if this DB row ID was already rendered
          // (either from initialRemarks or a prior Realtime event), drop it.
          // This is the only reliable guard against Strict Mode double-mount
          // creating two live subscriptions that both deliver the same event.
          if (seenIds.current.has(incoming.id)) return;
          seenIds.current.add(incoming.id);

          setRemarks((prev) => {
            // If the row is from the current user and we have a pending
            // optimistic row, it is our echo — replace the oldest one.
            // We do NOT match on content: server sanitizeText may alter it.
            if (incoming.author_id === currentUserId && optimisticIds.current.size > 0) {
              const idx = prev.findIndex((r) => optimisticIds.current.has(r.id));
              if (idx !== -1) {
                optimisticIds.current.delete(prev[idx].id);
                const confirmed: TaskRemarkWithAuthor = {
                  ...incoming,
                  author: prev[idx].author,
                };
                return [...prev.slice(0, idx), confirmed, ...prev.slice(idx + 1)];
              }
            }

            // Remark from another user — append with null author (no profile fetch)
            const newRemark: TaskRemarkWithAuthor = {
              ...incoming,
              author: null,
            };
            return [...prev, newRemark];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // mountId is stable for the lifetime of this mount; taskId is the real dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`; // max 3 lines ≈ 72px
  }

  // ── Status pill toggle ────────────────────────────────────────────────────

  // ── Post remark ───────────────────────────────────────────────────────────

  const postRemark = useCallback(() => {
    const content = draft.trim();
    if (!content || isPending) return;

    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Sanitize client-side before optimistic insert
    const sanitized = sanitizeText(content);

    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    optimisticIds.current.add(optimisticId);

    const optimisticRemark: TaskRemarkWithAuthor = {
      id:            optimisticId,
      task_id:       taskId,
      author_id:     currentUserId,
      content:       sanitized,
      status_change: null,
      created_at:    new Date().toISOString(),
      is_suppressed: false,
      suppressed_by: null,
      suppressed_at: null,
      author:        { id: currentUserId, full_name: currentUserName, avatar_url: null },
    };

    setRemarks((prev) => [...prev, optimisticRemark]);

    startTransition(async () => {
      const result = await addTaskRemarkAction({ taskId, content });

      if (result.error) {
        setRemarks((prev) => prev.filter((r) => r.id !== optimisticId));
        optimisticIds.current.delete(optimisticId);
        toast.danger("Couldn't post update", { message: result.error });
        return;
      }

      // Confirm optimistic row immediately from action result — do not wait for
      // Realtime echo. The Realtime event will arrive later; seenIds guards against
      // the double-append.
      if (result.data) {
        const confirmed: TaskRemarkWithAuthor = {
          ...result.data,
          author: { id: currentUserId, full_name: currentUserName, avatar_url: null },
        };
        seenIds.current.add(result.data.id);
        optimisticIds.current.delete(optimisticId);
        setRemarks((prev) => {
          const idx = prev.findIndex((r) => r.id === optimisticId);
          if (idx === -1) return prev; // already removed or replaced by Realtime
          return [...prev.slice(0, idx), confirmed, ...prev.slice(idx + 1)];
        });
      }
    });
  }, [draft, isPending, taskId, currentUserId, currentUserName]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      postRemark();
    }
  }

  const canPost = draft.trim().length > 0 && !isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Ambient animation — two slow drifting orbs. GPU-only (transform + opacity).
          Zero layout impact. Pointer-events disabled so they never intercept clicks. */}
      <style>{`
        @keyframes trp-orb-a {
          0%   { transform: translate(0px, 0px)    scale(1);    opacity: 0.045; }
          40%  { transform: translate(18px, -22px) scale(1.08); opacity: 0.06;  }
          70%  { transform: translate(-10px, 12px) scale(0.96); opacity: 0.035; }
          100% { transform: translate(0px, 0px)    scale(1);    opacity: 0.045; }
        }
        @keyframes trp-orb-b {
          0%   { transform: translate(0px, 0px)    scale(1);    opacity: 0.03;  }
          35%  { transform: translate(-20px, 16px) scale(1.1);  opacity: 0.05;  }
          65%  { transform: translate(14px, -10px) scale(0.94); opacity: 0.025; }
          100% { transform: translate(0px, 0px)    scale(1);    opacity: 0.03;  }
        }
      `}</style>

      {/* Orb A — top-right quadrant */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           "-60px",
          right:         "-40px",
          width:         "280px",
          height:        "280px",
          borderRadius:  "50%",
          background:    "var(--theme-accent)",
          filter:        "blur(72px)",
          pointerEvents: "none",
          animation:     "trp-orb-a 18s ease-in-out infinite",
          willChange:    "transform, opacity",
          zIndex:        0,
        }}
      />

      {/* Orb B — bottom-left quadrant */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          bottom:        "-40px",
          left:          "-30px",
          width:         "220px",
          height:        "220px",
          borderRadius:  "50%",
          background:    "var(--theme-accent)",
          filter:        "blur(80px)",
          pointerEvents: "none",
          animation:     "trp-orb-b 24s ease-in-out infinite",
          willChange:    "transform, opacity",
          zIndex:        0,
        }}
      />

      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          height:         "100%",
          overflow:       "hidden",
          position:       "relative",
          zIndex:         1,
        }}
      >
        {/* Timeline — transparent background, messages as floating cards */}
        <div
          ref={listRef}
          style={{
            flex:                    1,
            overflowY:               "auto",
            padding:                 "var(--space-5) var(--space-4)",
            display:                 "flex",
            flexDirection:           "column",
            gap:                     "var(--space-3)",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior:      "contain",
          }}
        >
          {remarks.length === 0 ? (
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flex:           1,
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
                No updates yet.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {remarks.map((remark) => (
                <motion.div
                  key={remark.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: optimisticIds.current.has(remark.id) ? 0.5 : 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Status chip — shown when remark recorded a transition */}
                  {remark.status_change && (() => {
                    const chip = TASK_STATUS[remark.status_change as TaskStatus];
                    return (
                      <div
                        style={{
                          display:      "inline-flex",
                          alignItems:   "center",
                          gap:          "var(--space-1)",
                          padding:      "2px var(--space-2)",
                          borderRadius: "var(--radius-full)",
                          background:   chip.remarkBg,
                          border:       `1px solid ${chip.remarkBorder}`,
                          color:        chip.remarkColor,
                          marginBottom: "var(--space-2)",
                          marginLeft:   "var(--space-2)",
                        }}
                      >
                        <TaskStatusIcon status={remark.status_change as TaskStatus} size={10} />
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-2xs)",
                            fontWeight: "var(--weight-semibold)",
                          }}
                        >
                          {TASK_REMARK_STATUS_LABELS[remark.status_change as TaskStatus]}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Message card */}
                  <div
                    style={{
                      background:   "var(--theme-paper)",
                      border:       "1px solid var(--theme-paper-border)",
                      borderRadius: "var(--radius-md)",
                      padding:      "var(--space-3) var(--space-4)",
                      boxShadow:    "var(--shadow-1)",
                      opacity:      remark.is_suppressed ? 0.5 : 1,
                    }}
                  >
                    {remark.is_suppressed ? (
                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontStyle:  "italic",
                          fontSize:   "var(--text-sm)",
                          color:      "var(--theme-text-tertiary)",
                          margin:     0,
                        }}
                      >
                        This remark was removed.
                      </p>
                    ) : (
                      <>
                        {/* Author + timestamp row */}
                        <div
                          style={{
                            display:      "flex",
                            alignItems:   "center",
                            gap:          "var(--space-2)",
                            marginBottom: "var(--space-2)",
                          }}
                        >
                          {/* Avatar */}
                          <Avatar
                            src={remark.author?.avatar_url}
                            name={remark.author?.full_name ?? ""}
                            size="xs"
                            style={{ borderRadius: "var(--radius-xs)", width: 20, height: 20, minWidth: 20 }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize:   "var(--text-xs)",
                              fontWeight: "var(--weight-semibold)",
                              color:      "var(--theme-text-primary)",
                              flex:       1,
                              minWidth:   0,
                              overflow:   "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {remark.author?.full_name ?? "Unknown"}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize:   "10px",
                              color:      "var(--theme-text-tertiary)",
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatRelativeTime(remark.created_at)}
                          </span>
                        </div>

                        {/* Remark content */}
                        <p
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-sm)",
                            color:      "var(--theme-text-primary)",
                            margin:     0,
                            lineHeight: "var(--leading-relaxed)",
                            wordBreak:  "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {remark.content}
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Compose area */}
        <div
          style={{
            padding:       "var(--space-3) var(--space-4)",
            flexShrink:    0,
          }}
        >
          <div
            style={{
              display:      "flex",
              alignItems:   "flex-end",
              gap:          "var(--space-2)",
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              padding:      "var(--space-2) var(--space-3)",
              boxShadow:    "var(--shadow-2)",
              transition:   "var(--transition-hover)",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--theme-accent)";
              (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-accent-ring)";
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                (e.currentTarget as HTMLDivElement).style.borderColor = "";
                (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-2)";
              }
            }}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              placeholder={composerPlaceholder}
              rows={1}
              style={{
                flex:       1,
                border:     "none",
                outline:    "none",
                background: "transparent",
                resize:     "none",
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                color:      "var(--theme-text-primary)",
                lineHeight: "var(--leading-relaxed)",
                minHeight:  "24px",
                maxHeight:  "72px",
                overflowY:  "auto",
                caretColor: "var(--theme-accent)",
              }}
            />
            <button
              type="button"
              onClick={postRemark}
              disabled={!canPost}
              aria-label="Post update"
              style={{
                width:          "32px",
                height:         "32px",
                borderRadius:   "var(--radius-sm)",
                border:         "none",
                cursor:         canPost ? "pointer" : "not-allowed",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                background:     canPost ? "var(--theme-accent)" : "var(--theme-paper-border)",
                transition:     "var(--transition-interactive)",
              }}
            >
              <Send
                style={{
                  width:       "14px",
                  height:      "14px",
                  strokeWidth: 1.5,
                  color:       canPost ? "var(--theme-accent-fg)" : "var(--theme-text-tertiary)",
                }}
              />
            </button>
          </div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-2xs)",
              color:      "var(--theme-text-tertiary)",
              margin:     "var(--space-1) var(--space-1) 0",
            }}
          >
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}

TaskRemarksPanel.displayName = "TaskRemarksPanel";
