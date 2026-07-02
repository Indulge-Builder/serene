"use client";

/**
 * GroupTaskWorkspace — full-page workspace for a single task group.
 *
 * Two views, toggled by List | Board buttons:
 *   List  — flat list sorted priority DESC, due_at ASC NULLS LAST
 *   Board — 5 columns: To Do · In Progress · In Review · Completed · Error/Cancelled
 *
 * View preference persisted to localStorage at:
 *   serene:tasks:workspace-view:${groupId}
 * Default is always 'list' on SSR; useEffect reads localStorage after mount
 * to prevent hydration mismatch.
 *
 * Status changes: user opens TaskModal → clicks status pill inside the modal.
 * updateTaskStatusAction fires. On success, local subtask state is updated
 * (no Realtime needed — workspace is single-user context). On error, toast.danger.
 *
 * Realtime: subscribes to tasks filtered by group_id on mount.
 * Channel name: workspace-subtasks-${groupId} — unique per group.
 * On INSERT or UPDATE: merges into local subtask list without full refetch.
 *
 * Add subtask: floating "+ Add subtask" button (bottom-right).
 * Opens inline creation form: title + assignee + priority + due date.
 * createSubtaskAction → appends to local list on success.
 *
 * Pre-mortem addressed:
 * - localStorage default: useState('list') on first render, useEffect reads
 *   after mount. No hydration mismatch.
 * - Board Error/Cancelled column: combined header "Error / Cancelled",
 *   count = error_count + cancelled_count, cards show actual status pill.
 * - Subtasks received as props — no client-side fetch on mount.
 * - No drag-and-drop — status changes via TaskModal only.
 * - Completion circle on each row toggles completed ↔ to_do (optimistic).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  List,
  LayoutGrid,
  Plus,
  X,
  User,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createSubtaskAction,
  getGroupSubtasksAction,
  getTaskRemarksAction,
  deleteGroupTaskAction,
} from "@/lib/actions/tasks";
import { getAssignableUsersAction } from "@/lib/actions/profiles";
import { formatRelativeTime, formatDate } from "@/lib/utils/dates";
import { toast } from "@/lib/toast";
import type { SubTaskModalTaskUpdate } from "@/components/tasks/SubTaskModal";
import { TaskCompletionCircle } from "@/components/tasks/TaskCompletionCircle";
import { TaskStatusIcon } from "@/components/tasks/TaskStatusIcon";
import { useTaskCompletionToggle } from "@/hooks/useTaskCompletionToggle";
import { canToggleTaskComplete } from "@/lib/utils/task-complete-auth";
import { AssigneePickerModal } from "@/components/tasks/AssigneePickerModal";
import type { AssignableUser } from "@/lib/types";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants/task-constants";
import { TASK_STATUS_LABELS } from "@/lib/constants/task-types";
import type {
  SubtaskWithAssignee,
  TaskRemarkWithAuthor,
} from "@/lib/services/tasks-service";
import { Avatar } from "@/components/ui/Avatar";
import { BackButton } from "@/components/ui/BackButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DatePicker } from "@/components/ui/DatePicker";
import type {
  Task,
  TaskGroup,
  TaskStatus,
  TaskPriority,
  UserRole,
  AppDomain,
} from "@/lib/types/database";
import { BASE_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

// Load-on-intent (perf audit G-1): SubTaskModal (1,672 lines) stays out of the
// /tasks/[id] route chunk until a subtask is first opened (the call site
// already conditional-renders it behind the remarks fetch).
const SubTaskModal = dynamic(
  () => import("@/components/tasks/SubTaskModal").then((m) => m.SubTaskModal),
  { ssr: false },
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GroupTaskWorkspaceProps {
  group: TaskGroup;
  initialSubtasks: SubtaskWithAssignee[];
  currentUserId: string;
  currentUserName: string;
  callerRole: UserRole;
  callerDomain: AppDomain;
}

type WorkspaceView = "list" | "board";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; dot: string }> = {
  urgent: { label: "Urgent", dot: "var(--color-danger)" },
  high: { label: "High", dot: "var(--color-warning)" },
  normal: { label: "Normal", dot: "var(--theme-text-tertiary)" },
};

// Board columns — Error and Cancelled share one column (both terminal non-success)
const BOARD_COLUMNS: Array<{
  key: string;
  label: string;
  statuses: TaskStatus[];
  accent: string;
}> = [
  {
    key: "to_do",
    label: "To Do",
    statuses: ["to_do"],
    accent: "var(--theme-paper-border)",
  },
  {
    key: "in_progress",
    label: "In Progress",
    statuses: ["in_progress"],
    accent: "var(--theme-accent)",
  },
  {
    key: "in_review",
    label: "In Review",
    statuses: ["in_review"],
    accent: "var(--color-info)",
  },
  {
    key: "completed",
    label: "Completed",
    statuses: ["completed"],
    accent: "var(--color-success)",
  },
  {
    key: "terminal",
    label: "Error / Cancelled",
    statuses: ["error", "cancelled"],
    accent: "var(--color-danger)",
  },
];

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDueDateColor(dueAt: string | null, status: TaskStatus): string {
  if (!dueAt || status === "completed" || status === "cancelled")
    return "var(--theme-text-tertiary)";
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return "var(--color-danger-text)";
  if (diff < 24 * 60 * 60 * 1000) return "var(--color-warning-text)";
  return "var(--theme-text-tertiary)";
}

function sortSubtasks(tasks: SubtaskWithAssignee[]): SubtaskWithAssignee[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return a.due_at.localeCompare(b.due_at);
  });
}

// ─── Group status/priority pill ───────────────────────────────────────────────

function GroupStatusPill({ group }: { group: TaskGroup }) {
  const cfg = TASK_STATUS[group.status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px var(--space-2)",
        borderRadius: "var(--radius-full)",
        background: cfg.pillBg,
        color: cfg.pillText,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <TaskStatusIcon status={group.status} size={11} />
      {TASK_STATUS_LABELS[group.status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  const statusCfg = TASK_PRIORITY[priority];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        border: `1px solid color-mix(in srgb, ${cfg.dot} 30%, transparent)`,
        background: `color-mix(in srgb, ${cfg.dot} 10%, transparent)`,
        color: statusCfg.color,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "var(--radius-full)",
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}

// ─── Assignee avatar chip ─────────────────────────────────────────────────────

function AssigneeChip({
  assignee,
}: {
  assignee: SubtaskWithAssignee["assignee"];
}) {
  if (!assignee) return null;
  return (
    <Avatar
      src={assignee.avatar_url}
      name={assignee.full_name}
      size="xs"
      style={{
        width: 24,
        height: 24,
        minWidth: 24,
        borderRadius: "var(--radius-xs)",
      }}
    />
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function GroupTaskWorkspace({
  group,
  initialSubtasks,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
}: GroupTaskWorkspaceProps) {
  const router = useRouter();

  // ── View toggle — default 'list', hydrated from localStorage after mount ──
  const [view, setView] = useState<WorkspaceView>("list");
  // Value deliberately unread — the state exists so the post-hydration set
  // triggers the re-render that applies the localStorage view choice.
  const [, setHydrated] = useState(false);
  const LS_KEY = `serene:tasks:workspace-view:${group.id}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY) as WorkspaceView | null;
      if (stored === "list" || stored === "board") setView(stored);
    } catch {
      // localStorage unavailable (SSR/incognito) — stay on default
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleViewChange(v: WorkspaceView) {
    setView(v);
    try {
      localStorage.setItem(LS_KEY, v);
    } catch {
      /* noop */
    }
  }

  // ── Delete group state ────────────────────────────────────────────────────
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteGroup() {
    setIsDeleting(true);
    const result = await deleteGroupTaskAction({ groupId: group.id });
    setIsDeleting(false);
    if (result.error) {
      toast.danger("Failed to delete group task", { message: result.error });
      return;
    }
    toast.success("Group task deleted");
    router.push("/tasks?tab=group");
  }

  // ── Subtask state ─────────────────────────────────────────────────────────
  const [subtasks, setSubtasks] =
    useState<SubtaskWithAssignee[]>(initialSubtasks);
  const [hoveredSubtaskId, setHoveredSubtaskId] = useState<string | null>(null);
  const { getEffectiveStatus, handleToggle } = useTaskCompletionToggle();
  const caller = { id: currentUserId, role: callerRole, domain: callerDomain };

  // ── Realtime subscription ─────────────────────────────────────────────────
  const mountId = useId();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`workspace-subtasks-${group.id}-${mountId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT and UPDATE
          schema: "public",
          table: "tasks",
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          const incoming = payload.new as Task;
          if (!incoming?.id) return;

          setSubtasks((prev) => {
            const idx = prev.findIndex((t) => t.id === incoming.id);
            if (payload.eventType === "INSERT") {
              if (idx !== -1) return prev; // already in list
              // New subtask — no assignee profile available; workspace will
              // show placeholder until a full refresh or next mount.
              return [...prev, { ...incoming, assignee: null }];
            }
            if (payload.eventType === "UPDATE") {
              if (idx === -1) return prev; // unknown task — ignore
              return [
                ...prev.slice(0, idx),
                { ...prev[idx], ...incoming },
                ...prev.slice(idx + 1),
              ];
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // mountId is stable per mount; group.id is the real dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  // ── Task modal state ──────────────────────────────────────────────────────
  const [selectedSubtask, setSelectedSubtask] =
    useState<SubtaskWithAssignee | null>(null);
  const [selectedSubtaskRemarks, setSelectedSubtaskRemarks] = useState<
    TaskRemarkWithAuthor[] | null
  >(null);
  const [modalOpen, setModalOpen] = useState(false);

  function handleOpenModal(subtask: SubtaskWithAssignee) {
    setSelectedSubtask(subtask);
    setSelectedSubtaskRemarks(null); // show skeleton until remarks arrive
    getTaskRemarksAction(subtask.id)
      .then((r) => {
        setSelectedSubtaskRemarks(r.data ?? []);
      })
      .catch(() => {
        setSelectedSubtaskRemarks([]);
      });
    setModalOpen(true);
  }

  const handleSubtaskUpdated = useCallback((update: SubTaskModalTaskUpdate) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === update.id ? { ...s, ...update } : s)),
    );
    setSelectedSubtask((prev) =>
      prev?.id === update.id ? { ...prev, ...update } : prev,
    );
  }, []);

  const handleSubtaskDeleted = useCallback((taskId: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== taskId));
    setSelectedSubtask(null);
    setModalOpen(false);
  }, []);

  function handleModalClose() {
    setModalOpen(false);
    setSelectedSubtaskRemarks(null);
    // Belt-and-suspenders sync after modal close (realtime + onTaskUpdated cover most cases)
    getGroupSubtasksAction(group.id)
      .then((r) => {
        if (r.data) setSubtasks(r.data);
      })
      .catch(() => {});
    setSelectedSubtask(null);
  }

  // ── Add subtask panel state ───────────────────────────────────────────────
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<TaskPriority>("normal");
  const [addDueAt, setAddDueAt] = useState<Date | null>(null);
  const [addAssignee, setAddAssignee] = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isPending, startTransition] = useTransition();
  const addTitleRef = useRef<HTMLInputElement>(null);

  // Load all assignable users on first add-panel open (all roles can assign subtasks)
  useEffect(() => {
    if (!showAddPanel) return;
    if (assignableUsers.length > 0) return;
    getAssignableUsersAction().then((r) => {
      if (r.data) {
        const users = r.data;
        setAssignableUsers(users);
        // Default to the current user if not already set
        setAddAssignee((prev) => {
          if (prev) return prev;
          return users.find((u) => u.id === currentUserId) ?? null;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPanel]);

  useEffect(() => {
    if (showAddPanel) setTimeout(() => addTitleRef.current?.focus(), 50);
  }, [showAddPanel]);

  const handleAddSubtask = useCallback(() => {
    if (isPending || !addTitle.trim()) {
      addTitleRef.current?.focus();
      return;
    }
    const assigneeId = addAssignee?.id ?? currentUserId;
    startTransition(async () => {
      const result = await createSubtaskAction({
        group_id: group.id,
        title: addTitle.trim(),
        priority: addPriority,
        assigned_to: assigneeId,
        due_at: addDueAt ? addDueAt.toISOString() : undefined,
      });
      if (result.error) {
        toast.danger("Failed to create subtask", { message: result.error });
        return;
      }
      toast.success("Subtask created");
      setAddTitle("");
      setAddPriority("normal");
      setAddDueAt(null);
      setAddAssignee(null);
      setShowAddPanel(false);
      // Re-fetch to get assignee profile attached
      getGroupSubtasksAction(group.id)
        .then((r) => {
          if (r.data) setSubtasks(r.data);
        })
        .catch(() => {});
    });
  }, [
    isPending,
    addTitle,
    addPriority,
    addDueAt,
    addAssignee,
    currentUserId,
    group.id,
  ]);

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAddSubtask();
    if (e.key === "Escape") {
      setShowAddPanel(false);
      setAddTitle("");
    }
  }

  // ── Sorted list for list view ─────────────────────────────────────────────
  const sortedSubtasks = sortSubtasks(subtasks);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        paddingBottom: "var(--space-20)",
      }}
    >
      {/* Back + header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Title row: back button + title block + meta pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          <BackButton href="/tasks?tab=group" label="Back to Group Tasks" />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="type-page-title"
              style={{
                margin: 0,
                marginBottom: group.description ? "var(--space-2)" : 0,
              }}
            >
              {group.title}
            </h1>
            {group.description && (
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  color: "var(--theme-text-secondary)",
                  margin: 0,
                  lineHeight: "var(--leading-relaxed)",
                }}
              >
                {group.description}
              </p>
            )}
          </div>

          {/* Meta pills — right side */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            <PriorityBadge priority={group.priority} />
            <GroupStatusPill group={group} />
            {group.due_at && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: getDueDateColor(group.due_at, group.status),
                  whiteSpace: "nowrap",
                }}
              >
                <CalendarDays
                  style={{ width: 12, height: 12, strokeWidth: 1.5 }}
                />
                {formatDate(group.due_at, "dd MMM yyyy")}
              </span>
            )}

            {/* Delete button — admin/founder only */}
            {(callerRole === "admin" || callerRole === "founder") && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                title="Delete group task"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--theme-paper-border)",
                  background: "transparent",
                  color: "var(--color-danger-text)",
                  cursor: "pointer",
                  transition: "var(--transition-hover)",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--color-danger-light)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                <Trash2 style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
              </button>
            )}
          </div>
        </div>

        {/* Confirm delete — ConfirmDialog owns the portal + z-index contract */}
        <ConfirmDialog
          open={confirmDeleteOpen}
          dialogKey="ws-delete"
          title="Delete group task?"
          body={
            <>
              <strong style={{ color: "var(--theme-text-primary)" }}>
                {group.title}
              </strong>{" "}
              and all its subtasks will be permanently deleted. This cannot be
              undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          danger
          pending={isDeleting}
          onConfirm={handleDeleteGroup}
          onCancel={() => setConfirmDeleteOpen(false)}
        />

        {/* Toolbar: subtask count + view toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "var(--space-2)",
            borderBottom: "1px solid var(--theme-paper-border)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xs)",
              color: "var(--theme-text-tertiary)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""}
          </span>

          {/* View toggle — List | Board */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {(
              [
                ["list", List, "List view"],
                ["board", LayoutGrid, "Board view"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => handleViewChange(v)}
                aria-label={label}
                aria-pressed={view === v}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "var(--space-1) var(--space-3)",
                  border: "none",
                  background:
                    view === v ? "var(--theme-accent)" : "transparent",
                  color:
                    view === v
                      ? "var(--theme-accent-fg)"
                      : "var(--theme-text-secondary)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-xs)",
                  fontWeight:
                    view === v
                      ? "var(--weight-semibold)"
                      : "var(--weight-normal)",
                  cursor: "pointer",
                  transition: "var(--transition-interactive)",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                {v === "list" ? "List" : "Board"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── List view ─────────────────────────────────────────────────────── */}
      {view === "list" && (
        <div>
          {sortedSubtasks.length === 0 ? (
            <div
              style={{
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-16) var(--space-8)",
                textAlign: "center",
                boxShadow: "var(--shadow-1)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "var(--text-lg)",
                  color: "var(--theme-text-tertiary)",
                  margin: 0,
                }}
              >
                No subtasks yet.
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  color: "var(--theme-text-tertiary)",
                  marginTop: "var(--space-2)",
                  marginBottom: 0,
                }}
              >
                Add the first subtask with the button below.
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                boxShadow: "var(--shadow-1)",
              }}
            >
              {sortedSubtasks.map((subtask, idx) => {
                const effectiveStatus = getEffectiveStatus(
                  subtask.id,
                  subtask.status,
                );
                const isComplete = effectiveStatus === "completed";
                const dueDateColor = getDueDateColor(
                  subtask.due_at,
                  effectiveStatus,
                );
                const canComplete =
                  canToggleTaskComplete(subtask, caller, group.domain) &&
                  effectiveStatus !== "cancelled" &&
                  effectiveStatus !== "error";

                return (
                  <motion.div
                    key={subtask.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: BASE_DURATION,
                      delay: Math.min(idx * 0.03, 0.24),
                      ease: EASE_OUT_EXPO,
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom:
                        idx < sortedSubtasks.length - 1
                          ? "1px solid var(--theme-paper-border)"
                          : "none",
                      background: "var(--theme-paper)",
                      cursor: "pointer",
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenModal(subtask)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        handleOpenModal(subtask);
                    }}
                    onMouseEnter={() => setHoveredSubtaskId(subtask.id)}
                    onMouseLeave={() => setHoveredSubtaskId(null)}
                  >
                    <TaskCompletionCircle
                      checked={isComplete}
                      disabled={!canComplete}
                      highlighted={hoveredSubtaskId === subtask.id}
                      onToggle={(e) =>
                        handleToggle(e, subtask, (newStatus) => {
                          setSubtasks((prev) =>
                            prev.map((s) =>
                              s.id === subtask.id
                                ? { ...s, status: newStatus }
                                : s,
                            ),
                          );
                        })
                      }
                    />

                    {/* Title */}
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--weight-medium)",
                        color: isComplete
                          ? "var(--theme-text-tertiary)"
                          : "var(--theme-text-primary)",
                        textDecoration: isComplete ? "line-through" : "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {subtask.title}
                    </span>

                    {subtask.priority !== "normal" && (
                      <PriorityBadge priority={subtask.priority} />
                    )}

                    {/* Assignee avatar */}
                    <AssigneeChip assignee={subtask.assignee} />

                    {/* Due date chip */}
                    {subtask.due_at && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-xs)",
                          color: dueDateColor,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatRelativeTime(subtask.due_at)}
                      </span>
                    )}

                    {/* Status pill */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px var(--space-2)",
                        borderRadius: "var(--radius-full)",
                        background: TASK_STATUS[effectiveStatus].pillBg,
                        color: TASK_STATUS[effectiveStatus].pillText,
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-xs)",
                        fontWeight: "var(--weight-semibold)",
                        flexShrink: 0,
                      }}
                    >
                      <TaskStatusIcon status={effectiveStatus} size={10} />
                      {TASK_STATUS_LABELS[effectiveStatus]}
                    </span>

                    {/* Arrow */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(subtask);
                      }}
                      aria-label="Open subtask details"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "24px",
                        height: "24px",
                        borderRadius: "var(--radius-xs)",
                        border: "1px solid var(--theme-paper-border)",
                        background: "transparent",
                        color: "var(--theme-text-tertiary)",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "var(--transition-hover)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--theme-accent)";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--theme-accent)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--theme-text-tertiary)";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--theme-paper-border)";
                      }}
                    >
                      <ArrowRight
                        style={{ width: 12, height: 12, strokeWidth: 1.5 }}
                      />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Board view ────────────────────────────────────────────────────── */}
      {view === "board" && (
        <div className="serene-board">
          {BOARD_COLUMNS.map((col) => {
            const colSubtasks = subtasks.filter((t) =>
              col.statuses.includes(getEffectiveStatus(t.id, t.status)),
            );
            return (
              <div
                key={col.key}
                style={{
                  border: "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow-1)",
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: "var(--space-3) var(--space-3)",
                    background: "var(--theme-paper-subtle)",
                    borderBottom: "1px solid var(--theme-paper-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "var(--radius-full)",
                      background:
                        col.accent === "var(--theme-paper-border)"
                          ? "var(--theme-text-tertiary)"
                          : col.accent,
                      flexShrink: 0,
                    }}
                    aria-hidden
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--weight-semibold)",
                      letterSpacing: "var(--tracking-wide)",
                      textTransform: "uppercase",
                      color: "var(--theme-text-secondary)",
                      flex: 1,
                    }}
                  >
                    {col.label}
                  </span>
                  {/* Count pill — sum of all statuses in this column (pre-mortem: Error/Cancelled shows sum) */}
                  <span
                    style={{
                      padding: "1px var(--space-2)",
                      borderRadius: "var(--radius-full)",
                      background: `color-mix(in srgb, ${col.accent} 12%, transparent)`,
                      color:
                        col.accent === "var(--theme-paper-border)"
                          ? "var(--theme-text-secondary)"
                          : col.accent,
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-2xs)",
                      fontWeight: "var(--weight-semibold)",
                    }}
                  >
                    {colSubtasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div
                  style={{
                    padding: "var(--space-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    minHeight: "120px",
                  }}
                >
                  <AnimatePresence initial={false}>
                    {colSubtasks.length === 0 ? (
                      <p
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontStyle: "italic",
                          fontSize: "var(--text-xs)",
                          color: "var(--theme-text-tertiary)",
                          textAlign: "center",
                          padding: "var(--space-4) var(--space-2)",
                          margin: 0,
                        }}
                      >
                        Empty
                      </p>
                    ) : (
                      colSubtasks.map((subtask) => {
                        const pCfg = PRIORITY_CONFIG[subtask.priority];
                        const effectiveStatus = getEffectiveStatus(
                          subtask.id,
                          subtask.status,
                        );
                        const isComplete = effectiveStatus === "completed";
                        const canComplete =
                          canToggleTaskComplete(
                            subtask,
                            caller,
                            group.domain,
                          ) &&
                          effectiveStatus !== "cancelled" &&
                          effectiveStatus !== "error";

                        return (
                          <motion.div
                            key={subtask.id}
                            layout
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenModal(subtask)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ")
                                handleOpenModal(subtask);
                            }}
                            style={{
                              background: "var(--theme-paper)",
                              border: "1px solid var(--theme-paper-border)",
                              borderRadius: "var(--radius-sm)",
                              padding: "var(--space-2) var(--space-3)",
                              cursor: "pointer",
                              transition:
                                "box-shadow var(--duration-fast) var(--ease-in-out)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "var(--space-2)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.boxShadow =
                                "var(--shadow-2)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.boxShadow =
                                "";
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "var(--space-2)",
                              }}
                            >
                              <TaskCompletionCircle
                                checked={isComplete}
                                disabled={!canComplete}
                                onToggle={(e) =>
                                  handleToggle(e, subtask, (newStatus) => {
                                    setSubtasks((prev) =>
                                      prev.map((s) =>
                                        s.id === subtask.id
                                          ? { ...s, status: newStatus }
                                          : s,
                                      ),
                                    );
                                  })
                                }
                              />
                              <span
                                style={{
                                  flex: 1,
                                  fontFamily: "var(--font-sans)",
                                  fontSize: "var(--text-xs)",
                                  fontWeight: "var(--weight-medium)",
                                  color: isComplete
                                    ? "var(--theme-text-tertiary)"
                                    : "var(--theme-text-primary)",
                                  textDecoration: isComplete
                                    ? "line-through"
                                    : "none",
                                  lineHeight: "var(--leading-snug)",
                                  wordBreak: "break-word",
                                }}
                              >
                                {subtask.title}
                              </span>
                            </div>

                            {/* Bottom row: assignee + priority dot + due */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "var(--space-2)",
                                flexWrap: "wrap",
                              }}
                            >
                              <AssigneeChip assignee={subtask.assignee} />

                              {/* Priority dot */}
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "var(--radius-full)",
                                  background: pCfg.dot,
                                  flexShrink: 0,
                                }}
                                title={pCfg.label}
                              />

                              {/* Due chip */}
                              {subtask.due_at && (
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "var(--text-2xs)",
                                    color: getDueDateColor(
                                      subtask.due_at,
                                      subtask.status,
                                    ),
                                    whiteSpace: "nowrap",
                                    marginLeft: "auto",
                                  }}
                                >
                                  {formatRelativeTime(subtask.due_at)}
                                </span>
                              )}
                            </div>

                            {/* Actual status pill — always shown (pre-mortem: Error/Cancelled column shows actual status) */}
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px var(--space-2)",
                                borderRadius: "var(--radius-full)",
                                background: TASK_STATUS[subtask.status].pillBg,
                                color: TASK_STATUS[subtask.status].pillText,
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--text-2xs)",
                                fontWeight: "var(--weight-semibold)",
                                width: "fit-content",
                              }}
                            >
                              <TaskStatusIcon
                                status={subtask.status}
                                size={9}
                              />
                              {TASK_STATUS_LABELS[subtask.status]}
                            </span>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add subtask floating button + panel ───────────────────────────── */}
      <div
        className="fixed bottom-4 left-4 right-4 md:bottom-8 md:left-auto md:right-8"
        style={{
          zIndex: "var(--z-raised)" as React.CSSProperties["zIndex"],
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "var(--space-3)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <AnimatePresence>
          {showAddPanel && (
            <motion.div
              key="add-panel"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
              className="w-full md:w-80"
              style={{
                background: "var(--theme-paper)",
                border: "1px solid var(--theme-paper-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-3)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    letterSpacing: "var(--tracking-widest)",
                    textTransform: "uppercase",
                    color: "var(--theme-text-tertiary)",
                  }}
                >
                  New Subtask
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPanel(false);
                    setAddTitle("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "22px",
                    height: "22px",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid var(--theme-paper-border)",
                    background: "transparent",
                    color: "var(--theme-text-tertiary)",
                    cursor: "pointer",
                  }}
                >
                  <X style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                </button>
              </div>

              {/* Title */}
              <input
                ref={addTitleRef}
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="Subtask title…"
                style={{
                  border: "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-2) var(--space-3)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  color: "var(--theme-text-primary)",
                  background: "var(--theme-paper-subtle)",
                  outline: "none",
                  caretColor: "var(--theme-accent)",
                  width: "100%",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-accent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--theme-paper-border)";
                }}
              />

              {/* Priority + Due date row */}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {/* Priority select */}
                <div style={{ position: "relative", flex: 1 }}>
                  <select
                    value={addPriority}
                    onChange={(e) =>
                      setAddPriority(e.target.value as TaskPriority)
                    }
                    style={{
                      appearance: "none",
                      WebkitAppearance: "none",
                      width: "100%",
                      padding:
                        "var(--space-2) var(--space-5) var(--space-2) var(--space-2)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--theme-paper-border)",
                      background: "var(--theme-paper-subtle)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      color: "var(--theme-text-primary)",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {(["urgent", "high", "normal"] as TaskPriority[]).map(
                      (p) => (
                        <option key={p} value={p}>
                          {PRIORITY_CONFIG[p].label}
                        </option>
                      ),
                    )}
                  </select>
                  <ChevronDown
                    style={{
                      position: "absolute",
                      right: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 10,
                      height: 10,
                      strokeWidth: 1.5,
                      pointerEvents: "none",
                      color: "var(--theme-text-tertiary)",
                    }}
                  />
                </div>

                {/* Due date */}
                <div style={{ flex: 1 }}>
                  <DatePicker
                    value={addDueAt}
                    onChange={setAddDueAt}
                    showTime
                    placeholder="Due date"
                  />
                </div>
              </div>

              {/* Assignee picker row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowAssigneePicker(true)}
                  aria-label="Pick assignee"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--theme-paper-border)",
                    background: addAssignee
                      ? "var(--theme-accent-surface)"
                      : "var(--theme-paper-subtle)",
                    color: addAssignee
                      ? "var(--theme-accent)"
                      : "var(--theme-text-secondary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-xs)",
                    cursor: "pointer",
                    flex: 1,
                    transition: "var(--transition-hover)",
                  }}
                >
                  <User style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                  {addAssignee ? addAssignee.full_name : "Assign to…"}
                </button>

                {/* Save */}
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  disabled={isPending || !addTitle.trim() || !addAssignee}
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background:
                      addTitle.trim() && addAssignee
                        ? "var(--theme-accent)"
                        : "var(--theme-paper-border)",
                    color:
                      addTitle.trim() && addAssignee
                        ? "var(--theme-accent-fg)"
                        : "var(--theme-text-tertiary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    cursor:
                      isPending || !addTitle.trim() || !addAssignee
                        ? "not-allowed"
                        : "pointer",
                    opacity: isPending ? 0.6 : 1,
                    transition: "var(--transition-interactive)",
                    flexShrink: 0,
                  }}
                >
                  {isPending ? "Adding…" : "Add"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB — plus twirls on approach; the open-state X gets the same quarter turn */}
        <button
          type="button"
          onClick={() => setShowAddPanel((v) => !v)}
          aria-label="Add subtask"
          className="serene-pressable serene-icon-rotate-hover"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-3) var(--space-5)",
            borderRadius: "var(--radius-full)",
            border: "none",
            background: "var(--theme-accent)",
            color: "var(--theme-accent-fg)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-semibold)",
            cursor: "pointer",
            boxShadow: "var(--shadow-accent-glow)",
            transition: "opacity var(--duration-fast) var(--ease-in-out)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {showAddPanel ? (
            <X style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
          ) : (
            <Plus style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
          )}
          {showAddPanel ? "Close" : "Add subtask"}
        </button>
      </div>

      {/* Task Modal */}
      <AnimatePresence>
        {selectedSubtask && modalOpen && selectedSubtaskRemarks !== null && (
          <SubTaskModal
            open={modalOpen}
            onClose={handleModalClose}
            task={selectedSubtask as Task}
            group={group}
            assignee={selectedSubtask.assignee ?? undefined}
            initialRemarks={selectedSubtaskRemarks}
            callerProfile={{
              id: currentUserId,
              role: callerRole,
              domain: callerDomain,
            }}
            currentUserName={currentUserName}
            onTaskUpdated={handleSubtaskUpdated}
            onTaskDeleted={handleSubtaskDeleted}
          />
        )}
      </AnimatePresence>

      {/* Assignee Picker — portaled to document.body */}
      {typeof window !== "undefined" &&
        createPortal(
          <AssigneePickerModal
            open={showAssigneePicker}
            onClose={() => setShowAssigneePicker(false)}
            onConfirm={(_userId, user) => {
              setAddAssignee(user);
              setShowAssigneePicker(false);
            }}
            users={assignableUsers}
            initialDomain={callerDomain}
          />,
          document.body,
        )}
    </div>
  );
}

GroupTaskWorkspace.displayName = "GroupTaskWorkspace";
