"use client";

/**
 * TaskModal — two-column task detail + chat panel.
 *
 * Layout: left 55% (details), right 45% (chat).
 * Mobile: full-screen bottom sheet, details on top, chat below, swipe-down to dismiss.
 *
 * Pre-mortem addressed:
 * - Inline title/description debounced saves (400ms) are flushed synchronously on modal close.
 * - Status segmented control uses 2-column grid on mobile to prevent overflow at 375px.
 * - Does NOT fetch task data inside the modal — receives it as a prop.
 * - No <form> tags — all onClick/onChange handlers.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Clock,
  User,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  Loader,
  XCircle,
  RefreshCw,
  PlayCircle,
} from "lucide-react";
import { updateTaskAction, updateTaskStatusAction } from "@/lib/actions/tasks";
import { formatRelativeTime, formatDate } from "@/lib/utils/dates";
import { toast } from "@/lib/toast";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/constants/task-types";
import { TaskChatPanel, type TaskMessageWithAuthor } from "@/components/tasks/TaskChatPanel";
import type { Task, TaskStatus, TaskPriority, Profile } from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskModalProps {
  open:            boolean;
  onClose:         () => void;
  task:            Task;
  assignee:        Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  initialMessages: TaskMessageWithAuthor[];
  currentUserId:   string;
  currentUserName: string;
}

// ─── Priority config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  urgent: {
    label: "Urgent",
    color: "var(--color-danger-text)",
    bg:    "var(--color-danger)",
  },
  high: {
    label: "High",
    color: "var(--color-warning-text)",
    bg:    "var(--color-warning)",
  },
  normal: {
    label: "Normal",
    color: "var(--theme-text-secondary)",
    bg:    "var(--theme-paper-subtle)",
  },
};

// ─── Status icon map ──────────────────────────────────────────────────────────

function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const style = { width: size, height: size, strokeWidth: 1.5 };
  switch (status) {
    case "to_do":       return <Clock        style={style} />;
    case "in_progress": return <PlayCircle   style={style} />;
    case "in_review":   return <RefreshCw    style={style} />;
    case "completed":   return <CheckCircle2 style={style} />;
    case "error":       return <AlertCircle  style={style} />;
    case "cancelled":   return <XCircle      style={style} />;
    default:            return <Loader       style={style} />;
  }
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, { active: string; text: string }> = {
  to_do:       { active: "var(--theme-paper-border)",    text: "var(--theme-text-secondary)" },
  in_progress: { active: "var(--theme-accent)",           text: "var(--theme-accent-fg)" },
  in_review:   { active: "var(--color-info)",             text: "var(--color-info-text)" },
  completed:   { active: "var(--color-success)",          text: "var(--color-success-text)" },
  error:       { active: "var(--color-danger)",           text: "var(--color-danger-text)" },
  cancelled:   { active: "var(--theme-text-tertiary)",    text: "var(--theme-text-inverse)" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskModal({
  open,
  onClose,
  task,
  assignee,
  initialMessages,
  currentUserId,
  currentUserName,
}: TaskModalProps) {
  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status,      setStatus]      = useState<TaskStatus>(task.status);
  const [priority,    setPriority]    = useState<TaskPriority>(task.priority);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc,  setEditingDesc]  = useState(false);

  // Pending debounce timers
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending save values — used to flush on close
  const pendingTitle = useRef<string | null>(null);
  const pendingDesc  = useRef<string | null>(null);

  const [, startTransition] = useTransition();

  // ── Sync task prop changes into local state ───────────────────────────────

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
  }, [task]);

  // ── Debounced save helpers ────────────────────────────────────────────────

  function saveTitle(value: string) {
    if (value === task.title || !value.trim()) return;
    startTransition(async () => {
      const result = await updateTaskAction({ taskId: task.id, title: value.trim() });
      if (result.error) toast.danger("Couldn't save title", { message: result.error });
    });
  }

  function saveDescription(value: string) {
    startTransition(async () => {
      const result = await updateTaskAction({
        taskId:      task.id,
        description: value.trim() || null,
      });
      if (result.error) toast.danger("Couldn't save description", { message: result.error });
    });
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTitle(v);
    pendingTitle.current = v;

    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      if (pendingTitle.current !== null) {
        saveTitle(pendingTitle.current);
        pendingTitle.current = null;
      }
    }, 400);
  }

  function handleTitleBlur() {
    setEditingTitle(false);
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    if (pendingTitle.current !== null) {
      saveTitle(pendingTitle.current);
      pendingTitle.current = null;
    }
  }

  function handleDescChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setDescription(v);
    pendingDesc.current = v;

    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => {
      if (pendingDesc.current !== null) {
        saveDescription(pendingDesc.current);
        pendingDesc.current = null;
      }
    }, 400);
  }

  function handleDescBlur() {
    setEditingDesc(false);
    if (descTimerRef.current) {
      clearTimeout(descTimerRef.current);
      descTimerRef.current = null;
    }
    if (pendingDesc.current !== null) {
      saveDescription(pendingDesc.current);
      pendingDesc.current = null;
    }
  }

  // ── Status update ─────────────────────────────────────────────────────────

  function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === status) return;
    const prev = status;
    setStatus(newStatus);
    startTransition(async () => {
      const result = await updateTaskStatusAction({ taskId: task.id, status: newStatus });
      if (result.error) {
        setStatus(prev);
        toast.danger("Couldn't update status", { message: result.error });
      }
    });
  }

  // ── Priority update ───────────────────────────────────────────────────────

  function handlePriorityChange(newPriority: TaskPriority) {
    if (newPriority === priority) return;
    const prev = priority;
    setPriority(newPriority);
    startTransition(async () => {
      const result = await updateTaskAction({ taskId: task.id, priority: newPriority });
      if (result.error) {
        setPriority(prev);
        toast.danger("Couldn't update priority", { message: result.error });
      }
    });
  }

  // ── Flush pending saves on close ──────────────────────────────────────────

  const flushAndClose = useCallback(() => {
    // Cancel debounce timers and flush synchronously before unmounting
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    if (descTimerRef.current) {
      clearTimeout(descTimerRef.current);
      descTimerRef.current = null;
    }
    if (pendingTitle.current !== null) {
      saveTitle(pendingTitle.current);
      pendingTitle.current = null;
    }
    if (pendingDesc.current !== null) {
      saveDescription(pendingDesc.current);
      pendingDesc.current = null;
    }
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // ── Keyboard dismiss ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") flushAndClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, flushAndClose]);

  // ── Mobile swipe-down to dismiss ──────────────────────────────────────────

  const sheetRef    = useRef<HTMLDivElement>(null);
  const dragStartY  = useRef<number | null>(null);
  const dragCurrent = useRef<number>(0);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current  = e.touches[0].clientY;
    dragCurrent.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta < 0) return; // only downward drag
    dragCurrent.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }

  function handleTouchEnd() {
    const el = sheetRef.current;
    if (!el) return;
    const sheetHeight = el.offsetHeight;
    const threshold   = sheetHeight * 0.4;

    if (dragCurrent.current > threshold) {
      flushAndClose();
    } else {
      // Snap back
      el.style.transition = "transform var(--duration-base) var(--ease-out-expo)";
      el.style.transform  = "translateY(0)";
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 200);
    }
    dragStartY.current  = null;
    dragCurrent.current = 0;
  }

  const priorityConfig = PRIORITY_CONFIG[priority];

  // Priority pills — used in both desktop and mobile
  const priorityPills = useMemo(
    () =>
      (["urgent", "high", "normal"] as TaskPriority[]).map((p) => {
        const cfg    = PRIORITY_CONFIG[p];
        const active = p === priority;
        return (
          <button
            key={p}
            type="button"
            onClick={() => handlePriorityChange(p)}
            style={{
              padding:      "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-full)",
              border:       active
                ? `1px solid ${cfg.bg}`
                : "1px solid var(--theme-paper-border)",
              background:   active ? cfg.bg : "transparent",
              color:        active ? cfg.color : "var(--theme-text-secondary)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-xs)",
              fontWeight:   "var(--weight-semibold)",
              cursor:       "pointer",
              transition:   "var(--transition-interactive)",
              whiteSpace:   "nowrap",
            }}
          >
            {cfg.label}
          </button>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priority],
  );

  // ── Left detail panel ─────────────────────────────────────────────────────

  const detailPanel = (
    <div
      style={{
        padding:       "var(--space-5) var(--space-6)",
        overflowY:     "auto",
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        gap:           "var(--space-5)",
      }}
    >
      {/* Title */}
      <div>
        <span
          style={{
            display:       "block",
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
            marginBottom:  "var(--space-1)",
          }}
        >
          Title
        </span>
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            style={{
              width:        "100%",
              border:       "none",
              borderBottom: "2px solid var(--theme-accent)",
              outline:      "none",
              background:   "transparent",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-base)",
              fontWeight:   "var(--weight-semibold)",
              color:        "var(--theme-text-primary)",
              padding:      "var(--space-1) 0",
              caretColor:   "var(--theme-accent)",
            }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setEditingTitle(true)}
            onKeyDown={(e) => e.key === "Enter" && setEditingTitle(true)}
            style={{
              display:       "block",
              fontFamily:    "var(--font-sans)",
              fontSize:      "var(--text-base)",
              fontWeight:    "var(--weight-semibold)",
              color:         "var(--theme-text-primary)",
              cursor:        "text",
              borderBottom:  "1px dashed transparent",
              paddingBottom: "var(--space-1)",
              transition:    "border-color var(--duration-fast) var(--ease-in-out)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderBottomColor = "var(--theme-paper-border)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
            }}
          >
            {title}
          </span>
        )}
      </div>

      {/* Description */}
      <div>
        <span
          style={{
            display:       "block",
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
            marginBottom:  "var(--space-1)",
          }}
        >
          Description
        </span>
        {editingDesc ? (
          <textarea
            autoFocus
            value={description}
            onChange={handleDescChange}
            onBlur={handleDescBlur}
            rows={4}
            style={{
              width:        "100%",
              border:       "none",
              borderBottom: "2px solid var(--theme-accent)",
              outline:      "none",
              background:   "transparent",
              resize:       "vertical",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--theme-text-primary)",
              lineHeight:   "var(--leading-relaxed)",
              padding:      "var(--space-1) 0",
              caretColor:   "var(--theme-accent)",
            }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setEditingDesc(true)}
            onKeyDown={(e) => e.key === "Enter" && setEditingDesc(true)}
            style={{
              display:       "block",
              fontFamily:    "var(--font-sans)",
              fontSize:      "var(--text-sm)",
              color:         description ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
              cursor:        "text",
              lineHeight:    "var(--leading-relaxed)",
              borderBottom:  "1px dashed transparent",
              paddingBottom: "var(--space-1)",
              transition:    "border-color var(--duration-fast) var(--ease-in-out)",
              minHeight:     "1.4em",
              whiteSpace:    "pre-wrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderBottomColor = "var(--theme-paper-border)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
            }}
          >
            {description || "Click to add a description…"}
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--theme-paper-border)" }} />

      {/* Status segmented control — 6 states */}
      <div>
        <span
          style={{
            display:       "block",
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
            marginBottom:  "var(--space-2)",
          }}
        >
          Status
        </span>
        {/* 2-column grid on mobile (375px), 3-column on desktop — prevents overflow */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 "var(--space-1)",
          }}
          className="task-status-grid"
        >
          {TASK_STATUSES.map((s) => {
            const active = s === status;
            const cfg    = STATUS_COLORS[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            "var(--space-1)",
                  padding:        "var(--space-1) var(--space-2)",
                  borderRadius:   "var(--radius-sm)",
                  border:         active
                    ? `1px solid ${cfg.active}`
                    : "1px solid var(--theme-paper-border)",
                  background:     active ? cfg.active : "transparent",
                  color:          active ? cfg.text : "var(--theme-text-secondary)",
                  fontFamily:     "var(--font-sans)",
                  fontSize:       "var(--text-xs)",
                  fontWeight:     active ? "var(--weight-semibold)" : "var(--weight-normal)",
                  cursor:         "pointer",
                  transition:     "var(--transition-interactive)",
                  whiteSpace:     "nowrap",
                  overflow:       "hidden",
                  textOverflow:   "ellipsis",
                }}
              >
                <StatusIcon status={s} size={12} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {TASK_STATUS_LABELS[s]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority pills */}
      <div>
        <span
          style={{
            display:       "block",
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-2xs)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            color:         "var(--theme-text-tertiary)",
            marginBottom:  "var(--space-2)",
          }}
        >
          Priority
        </span>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {priorityPills}
        </div>
        {/* Active priority badge */}
        <div style={{ marginTop: "var(--space-2)" }}>
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          "var(--space-1)",
              padding:      "var(--space-px) var(--space-2)",
              borderRadius: "var(--radius-full)",
              background:   priorityConfig.bg,
              color:        priorityConfig.color,
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-xs)",
              fontWeight:   "var(--weight-semibold)",
            }}
          >
            {priorityConfig.label}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "var(--theme-paper-border)" }} />

      {/* Meta grid — Assignee, Deadline, Created */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Assignee */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <User
            style={{
              width:       "16px",
              height:      "16px",
              strokeWidth: 1.5,
              color:       "var(--theme-text-tertiary)",
              flexShrink:  0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <span
              style={{
                fontFamily:    "var(--font-sans)",
                fontSize:      "var(--text-2xs)",
                fontWeight:    "var(--weight-semibold)",
                letterSpacing: "var(--tracking-widest)",
                textTransform: "uppercase",
                color:         "var(--theme-text-tertiary)",
              }}
            >
              Assigned To
            </span>
            {assignee ? (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                {/* Avatar */}
                <div
                  style={{
                    width:          "20px",
                    height:         "20px",
                    borderRadius:   "var(--radius-xs)",
                    background:     "var(--theme-accent-surface)",
                    border:         "1px solid var(--theme-paper-border)",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    flexShrink:     0,
                    overflow:       "hidden",
                  }}
                >
                  {assignee.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assignee.avatar_url}
                      alt={assignee.full_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize:   "8px",
                        fontWeight: "var(--weight-semibold)",
                        color:      "var(--theme-accent)",
                        lineHeight: 1,
                      }}
                    >
                      {getInitials(assignee.full_name)}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    color:      "var(--theme-text-primary)",
                  }}
                >
                  {assignee.full_name}
                </span>
              </div>
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize:   "var(--text-sm)",
                  color:      "var(--theme-text-tertiary)",
                }}
              >
                Unassigned
              </span>
            )}
          </div>
        </div>

        {/* Deadline */}
        {task.due_at && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <CalendarDays
              style={{
                width:       "16px",
                height:      "16px",
                strokeWidth: 1.5,
                color:       "var(--theme-text-tertiary)",
                flexShrink:  0,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              <span
                style={{
                  fontFamily:    "var(--font-sans)",
                  fontSize:      "var(--text-2xs)",
                  fontWeight:    "var(--weight-semibold)",
                  letterSpacing: "var(--tracking-widest)",
                  textTransform: "uppercase",
                  color:         "var(--theme-text-tertiary)",
                }}
              >
                Deadline
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize:   "var(--text-sm)",
                  color:      "var(--theme-text-primary)",
                }}
              >
                {formatDate(task.due_at, "dd MMM yyyy")}
                <span
                  style={{
                    marginLeft: "var(--space-2)",
                    color:      "var(--theme-text-tertiary)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  ({formatRelativeTime(task.due_at)})
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Clock
            style={{
              width:       "16px",
              height:      "16px",
              strokeWidth: 1.5,
              color:       "var(--theme-text-tertiary)",
              flexShrink:  0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <span
              style={{
                fontFamily:    "var(--font-sans)",
                fontSize:      "var(--text-2xs)",
                fontWeight:    "var(--weight-semibold)",
                letterSpacing: "var(--tracking-widest)",
                textTransform: "uppercase",
                color:         "var(--theme-text-tertiary)",
              }}
            >
              Created
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize:   "var(--text-xs)",
                color:      "var(--theme-text-tertiary)",
              }}
            >
              {formatDate(task.created_at, "dd MMM yyyy, HH:mm")}
            </span>
            {task.updated_at !== task.created_at && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize:   "10px",
                  color:      "var(--theme-text-tertiary)",
                  marginTop:  "2px",
                }}
              >
                Updated {formatRelativeTime(task.updated_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile-only 375px grid fix */}
      <style>{`
        @media (max-width: 480px) {
          .task-status-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="task-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={flushAndClose}
              style={{
                position:   "fixed",
                inset:      0,
                background: "rgba(0,0,0,0.5)",
                zIndex:     "var(--z-overlay)" as React.CSSProperties["zIndex"],
              }}
            />

            {/* ── Desktop modal ─────────────────────────────────────── */}
            <motion.div
              key="task-modal-container"
              role="dialog"
              aria-modal="true"
              aria-label={`Task: ${task.title}`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="task-modal-desktop"
              style={{
                position:     "fixed",
                top:          "50%",
                left:         "50%",
                transform:    "translate(-50%, -50%)",
                zIndex:       "var(--z-modal)" as React.CSSProperties["zIndex"],
                width:        "min(900px, calc(100vw - 2rem))",
                maxHeight:    "min(700px, calc(100vh - 4rem))",
                background:   "var(--theme-paper)",
                borderRadius: "var(--radius-lg)",
                boxShadow:    "var(--shadow-4)",
                overflow:     "hidden",
                display:      "flex",
                flexDirection: "column",
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "var(--space-4) var(--space-6)",
                  background:     "var(--theme-paper-subtle)",
                  borderBottom:   "1px solid var(--theme-paper-border)",
                  flexShrink:     0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <StatusIcon status={status} size={16} />
                  <h2
                    style={{
                      fontFamily:  "var(--font-sans)",
                      fontSize:    "var(--text-sm)",
                      fontWeight:  "var(--weight-semibold)",
                      color:       "var(--theme-text-primary)",
                      margin:      0,
                    }}
                  >
                    Task Detail
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={flushAndClose}
                  aria-label="Close task"
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    width:          "28px",
                    height:         "28px",
                    borderRadius:   "var(--radius-sm)",
                    border:         "1px solid var(--theme-paper-border)",
                    background:     "transparent",
                    color:          "var(--theme-text-tertiary)",
                    cursor:         "pointer",
                    transition:     "var(--transition-hover)",
                    flexShrink:     0,
                  }}
                >
                  <X style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
                </button>
              </div>

              {/* Two-column body */}
              <div
                style={{
                  display:  "flex",
                  flex:     1,
                  overflow: "hidden",
                }}
              >
                {/* Left panel — 55% */}
                <div
                  style={{
                    flex:        "0 0 55%",
                    borderRight: "1px solid var(--theme-paper-border)",
                    display:     "flex",
                    flexDirection: "column",
                    overflow:    "hidden",
                  }}
                >
                  {detailPanel}
                </div>

                {/* Right panel — 45% */}
                <div
                  style={{
                    flex:     "0 0 45%",
                    display:  "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <TaskChatPanel
                    taskId={task.id}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    initialMessages={initialMessages}
                  />
                </div>
              </div>
            </motion.div>

            {/* ── Mobile bottom sheet ──────────────────────────────── */}
            <motion.div
              ref={sheetRef}
              key="task-modal-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Task: ${task.title}`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="task-modal-sheet"
              style={{
                position:      "fixed",
                bottom:        0,
                left:          0,
                right:         0,
                zIndex:        "var(--z-modal)" as React.CSSProperties["zIndex"],
                maxHeight:     "92dvh",
                background:    "var(--theme-paper)",
                borderRadius:  "var(--radius-lg) var(--radius-lg) 0 0",
                boxShadow:     "var(--shadow-4)",
                display:       "flex",
                flexDirection: "column",
                overflow:      "hidden",
              }}
            >
              {/* Drag handle */}
              <div
                style={{
                  display:        "flex",
                  justifyContent: "center",
                  paddingTop:     "var(--space-3)",
                  paddingBottom:  "var(--space-2)",
                  flexShrink:     0,
                }}
              >
                <div
                  style={{
                    width:        "40px",
                    height:       "4px",
                    borderRadius: "var(--radius-full)",
                    background:   "var(--theme-paper-border)",
                  }}
                />
              </div>

              {/* Sheet header */}
              <div
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "var(--space-3) var(--space-4)",
                  borderBottom:   "1px solid var(--theme-paper-border)",
                  flexShrink:     0,
                }}
              >
                <h2
                  style={{
                    fontFamily:  "var(--font-sans)",
                    fontSize:    "var(--text-sm)",
                    fontWeight:  "var(--weight-semibold)",
                    color:       "var(--theme-text-primary)",
                    margin:      0,
                  }}
                >
                  Task Detail
                </h2>
                <button
                  type="button"
                  onClick={flushAndClose}
                  aria-label="Close task"
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    width:          "28px",
                    height:         "28px",
                    borderRadius:   "var(--radius-sm)",
                    border:         "1px solid var(--theme-paper-border)",
                    background:     "transparent",
                    color:          "var(--theme-text-tertiary)",
                    cursor:         "pointer",
                    transition:     "var(--transition-hover)",
                  }}
                >
                  <X style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
                </button>
              </div>

              {/* Sheet body: details on top, chat below */}
              <div
                style={{
                  flex:          1,
                  overflowY:     "auto",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior:      "contain",
                }}
              >
                {detailPanel}
                {/* Chat section in sheet */}
                <div
                  style={{
                    borderTop: "2px solid var(--theme-paper-border)",
                    height:    "360px",
                    display:   "flex",
                    flexDirection: "column",
                  }}
                >
                  <TaskChatPanel
                    taskId={task.id}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    initialMessages={initialMessages}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hide sheet on desktop, hide desktop modal on mobile */}
      <style>{`
        .task-modal-sheet   { display: none; }
        .task-modal-desktop { display: flex; }
        @media (max-width: 767px) {
          .task-modal-sheet   { display: flex; }
          .task-modal-desktop { display: none; }
        }
      `}</style>
    </>
  );
}

TaskModal.displayName = "TaskModal";
