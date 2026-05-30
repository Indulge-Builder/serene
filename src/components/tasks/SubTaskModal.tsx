"use client";

/**
 * SubTaskModal — centered two-zone task detail modal.
 *
 * Zone A (38%): The Brief — title, notes/objective, checklist (group subtasks),
 *               key variables (deadline, assignee, status, priority), metadata.
 * Zone B (62%): Activity — TaskRemarksPanel.
 *
 * Pre-mortem addressed:
 * - AnimatePresence must wrap the conditional at the CALL SITE, not inside
 *   this component — see usage notes in component JSDoc at the bottom.
 * - Zone A and Zone B each have overflow-y: auto with fixed height (panel minus header).
 * - Status/priority inline dropdowns close on outside click via useRef + useEffect.
 * - Escape key listener added on mount, removed on unmount.
 * - @dnd-kit/sortable is already in package.json (confirmed before build).
 * - Edit mode Save calls updateTaskAction — does NOT insert into task_remarks.
 * - Checklist toggles are always interactive (not read-only), even outside edit mode.
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
import {
  X,
  ChevronRight,
  Pencil,
  MoreHorizontal,
  CheckSquare,
  CalendarDays,
  User,
  AlertCircle,
  CheckCircle2,
  Trash2,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
  updateChecklistAction,
} from "@/lib/actions/tasks";
import { formatDate } from "@/lib/utils/dates";
import { toast } from "@/lib/toast";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants/task-constants";
import { TaskRemarksPanel, type TaskRemarkWithAuthor } from "@/components/tasks/TaskRemarksPanel";
import { TaskStatusIcon } from "@/components/tasks/TaskStatusIcon";
import { Avatar } from "@/components/ui/Avatar";
import { InfoRow } from "@/components/ui/InfoRow";
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskGroup,
  ChecklistItem,
  Profile,
} from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubTaskModalProps {
  open:             boolean;
  onClose:          () => void;
  task:             Task;
  group?:           TaskGroup;
  assignee?:        Pick<Profile, "id" | "full_name" | "avatar_url">;
  initialRemarks:   TaskRemarkWithAuthor[];
  callerProfile:    Pick<Profile, "id" | "role" | "domain">;
  currentUserName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: TaskStatus[] = [
  "to_do", "in_progress", "in_review", "completed", "error", "cancelled",
];

const ALL_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ─── Eyebrow label ────────────────────────────────────────────────────────────

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </span>
  );
}

function monoValue(text: string) {
  return <span style={{ fontFamily: "var(--font-mono)" }}>{text}</span>;
}

// ─── Sortable checklist item ──────────────────────────────────────────────────

function SortableChecklistItem({
  item,
  editMode,
  onToggle,
  onDelete,
  onTextChange,
}: {
  item: ChecklistItem;
  editMode: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display:     "flex",
        alignItems:  "center",
        gap:         "var(--space-2)",
        padding:     "var(--space-1) 0",
      }}
    >
      {editMode && (
        <span
          {...attributes}
          {...listeners}
          style={{
            display:    "flex",
            cursor:     "grab",
            color:      "var(--theme-text-tertiary)",
            flexShrink: 0,
            touchAction: "none",
          }}
        >
          <GripVertical style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
        </span>
      )}

      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-label={item.checked ? "Uncheck item" : "Check item"}
        style={{
          width:          "16px",
          height:         "16px",
          borderRadius:   "var(--radius-xs)",
          border:         item.checked
            ? "1.5px solid var(--theme-accent)"
            : "1.5px solid var(--theme-paper-border)",
          background:     item.checked ? "var(--theme-accent)" : "transparent",
          cursor:         "pointer",
          flexShrink:     0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          transition:     "var(--transition-interactive)",
        }}
      >
        {item.checked && (
          <CheckCircle2
            style={{
              width:       10,
              height:      10,
              strokeWidth: 2.5,
              color:       "var(--theme-accent-fg)",
            }}
          />
        )}
      </button>

      {editMode ? (
        <input
          value={item.text}
          onChange={(e) => onTextChange(item.id, e.target.value)}
          style={{
            flex:       1,
            border:     "none",
            borderBottom: "1px solid var(--theme-paper-border)",
            outline:    "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-primary)",
            padding:    "var(--space-px) 0",
          }}
        />
      ) : (
        <span
          style={{
            flex:           1,
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
            color:          item.checked ? "var(--theme-text-tertiary)" : "var(--theme-text-primary)",
            textDecoration: item.checked ? "line-through" : "none",
            lineHeight:     "var(--leading-relaxed)",
          }}
        >
          {item.text}
        </span>
      )}

      {editMode && (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          aria-label="Remove item"
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          "20px",
            height:         "20px",
            borderRadius:   "var(--radius-xs)",
            border:         "none",
            background:     "transparent",
            color:          "var(--theme-text-tertiary)",
            cursor:         "pointer",
            flexShrink:     0,
            transition:     "var(--transition-hover)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-danger-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--theme-text-tertiary)";
          }}
        >
          <X style={{ width: 12, height: 12, strokeWidth: 2 }} />
        </button>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Usage: wrap the conditional render at the call site with AnimatePresence:
 *
 * ```tsx
 * <AnimatePresence>
 *   {open && (
 *     <SubTaskModal open={open} onClose={onClose} ... />
 *   )}
 * </AnimatePresence>
 * ```
 *
 * The modal contains its own AnimatePresence internally for the backdrop only.
 * The outer AnimatePresence at the call site is required for the exit animation.
 */
export function SubTaskModal({
  open,
  onClose,
  task,
  group,
  assignee,
  initialRemarks,
  callerProfile,
  currentUserName = "",
}: SubTaskModalProps) {
  const isGroupSubtask = task.task_category === "group_subtask";

  // ── Local state ───────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status,      setStatus]      = useState<TaskStatus>(task.status);
  const [priority,    setPriority]    = useState<TaskPriority>(task.priority);
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>(task.attachments ?? []);

  const [editMode,        setEditMode]        = useState(false);
  const [showStatusMenu,  setShowStatusMenu]  = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showMoreMenu,    setShowMoreMenu]    = useState(false);

  const [editTitle, setEditTitle]       = useState(task.title);
  const [editDesc,  setEditDesc]        = useState(task.description ?? "");
  const [editItems, setEditItems]       = useState<ChecklistItem[]>(task.attachments ?? []);
  const [newItemText, setNewItemText]   = useState("");
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  const [, startTransition] = useTransition();

  // Unique id for aria
  const titleId = useId();

  // ── Refs for dropdown click-outside ──────────────────────────────────────
  const statusMenuRef   = useRef<HTMLDivElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef     = useRef<HTMLDivElement>(null);

  // ── Sync task prop into local state ──────────────────────────────────────
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setChecklist(task.attachments ?? []);
  }, [task]);

  // ── Escape key ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // ── Click-outside for dropdowns ───────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(e.target as Node)) {
        setShowPriorityMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Status update (optimistic) ────────────────────────────────────────────
  function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === status) { setShowStatusMenu(false); return; }
    const prev = status;
    setStatus(newStatus);
    setShowStatusMenu(false);
    startTransition(async () => {
      const result = await updateTaskStatusAction({ taskId: task.id, status: newStatus });
      if (result.error) {
        setStatus(prev);
        toast.danger("Couldn't update status", { message: result.error });
      }
    });
  }

  // ── Priority update (optimistic) ──────────────────────────────────────────
  function handlePriorityChange(newPriority: TaskPriority) {
    if (newPriority === priority) { setShowPriorityMenu(false); return; }
    const prev = priority;
    setPriority(newPriority);
    setShowPriorityMenu(false);
    startTransition(async () => {
      const result = await updateTaskAction({ taskId: task.id, priority: newPriority });
      if (result.error) {
        setPriority(prev);
        toast.danger("Couldn't update priority", { message: result.error });
      }
    });
  }

  // ── Checklist toggle (always interactive, even outside edit mode) ─────────
  function handleChecklistToggle(id: string) {
    const updated = checklist.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    );
    setChecklist(updated);
    startTransition(async () => {
      const result = await updateChecklistAction({ taskId: task.id, items: updated });
      if (result.error) {
        // Roll back
        setChecklist(checklist);
        toast.danger("Couldn't update checklist", { message: result.error });
      }
    });
  }

  // ── Edit mode open ────────────────────────────────────────────────────────
  function enterEditMode() {
    setEditTitle(title);
    setEditDesc(description);
    setEditItems([...checklist]);
    setEditMode(true);
  }

  // ── Edit mode save ────────────────────────────────────────────────────────
  function handleSaveBrief() {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    startTransition(async () => {
      const updateFields: Record<string, unknown> = { taskId: task.id };
      if (trimmedTitle !== task.title) updateFields.title = trimmedTitle;
      if (editDesc.trim() !== (task.description ?? "")) {
        updateFields.description = editDesc.trim() || null;
      }

      // Save task fields
      if (Object.keys(updateFields).length > 1) {
        const result = await updateTaskAction(updateFields);
        if (result.error) {
          toast.danger("Couldn't save brief", { message: result.error });
          return;
        }
        setTitle(trimmedTitle);
        setDescription(editDesc.trim());
      }

      // Save checklist separately if changed
      const checklistChanged =
        JSON.stringify(editItems) !== JSON.stringify(checklist);
      if (checklistChanged) {
        const clResult = await updateChecklistAction({
          taskId: task.id,
          items:  editItems,
        });
        if (clResult.error) {
          toast.danger("Couldn't save checklist", { message: clResult.error });
          return;
        }
        setChecklist(editItems);
      }

      setEditMode(false);
      toast.success("Brief updated.");
    });
  }

  // ── Delete task ───────────────────────────────────────────────────────────
  function handleDeleteTask() {
    setShowMoreMenu(false);
    startTransition(async () => {
      const result = await deleteTaskAction({ taskId: task.id });
      if (result.error) {
        toast.danger("Couldn't delete task", { message: result.error });
      } else {
        onClose();
      }
    });
  }

  // ── Checklist edit operations ─────────────────────────────────────────────
  function handleEditItemToggle(id: string) {
    setEditItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  }

  function handleEditItemDelete(id: string) {
    setEditItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleEditItemTextChange(id: string, text: string) {
    setEditItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item)),
    );
  }

  function handleAddNewItem() {
    const text = newItemText.trim();
    if (!text) return;
    const newItem: ChecklistItem = {
      id:      `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      checked: false,
    };
    setEditItems((prev) => [...prev, newItem]);
    setNewItemText("");
  }

  function handleNewItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddNewItem();
    }
  }

  // ── DnD sensors ───────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids      = editItems.map((i) => i.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setEditItems(arrayMove(editItems, oldIndex, newIndex));
  }

  // ── Authorization: can this caller delete this task? ──────────────────────
  const canDelete = isGroupSubtask
    ? ["manager", "admin", "founder"].includes(callerProfile.role)
    : task.created_by === callerProfile.id && task.assigned_to === callerProfile.id;

  // ── Checklist display ─────────────────────────────────────────────────────
  const CHECKLIST_PREVIEW = 5;
  const displayItems = editMode
    ? editItems
    : checklistExpanded
      ? checklist
      : checklist.slice(0, CHECKLIST_PREVIEW);
  const hiddenCount = Math.max(0, checklist.length - CHECKLIST_PREVIEW);
  const doneCount   = checklist.filter((i) => i.checked).length;
  const totalCount  = checklist.length;
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  // ── Status pill config ────────────────────────────────────────────────────
  const statusCfg   = TASK_STATUS[status];
  const priorityCfg = TASK_PRIORITY[priority];

  // ── Composer placeholder ──────────────────────────────────────────────────
  const composerPlaceholder = isGroupSubtask
    ? "Log a progress update, note, or observation…"
    : "Add a note…";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="subtask-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          background: "var(--overlay-bg)",
          zIndex:     "var(--z-overlay)" as React.CSSProperties["zIndex"],
        }}
      />

      {/* Panel */}
      <motion.div
        key="subtask-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position:      "fixed",
          top:           0,
          right:         0,
          bottom:        0,
          left:          "240px",
          display:       "flex",
          alignItems:    "center",
          justifyContent: "center",
          zIndex:        "var(--z-modal)" as React.CSSProperties["zIndex"],
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents:  "auto",
            width:          "95vw",
            maxWidth:       "1100px",
            height:         "90vh",
            maxHeight:      "820px",
            background:     "var(--theme-paper)",
            borderRadius:   "var(--radius-lg)",
            boxShadow:      "var(--shadow-4)",
            overflow:       "hidden",
            display:        "flex",
            flexDirection:  "column",
          }}
        >
          {/* ── HEADER ─────────────────────────────────────────────── */}
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "var(--space-3) var(--space-5)",
              borderBottom:   "1px solid var(--theme-paper-border)",
              flexShrink:     0,
              gap:            "var(--space-3)",
            }}
          >
            {/* Left: breadcrumb */}
            <div
              id={titleId}
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        "var(--space-1)",
                minWidth:   0,
                flex:       1,
              }}
            >
              <span
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-xs)",
                  color:       "var(--theme-text-tertiary)",
                  whiteSpace:  "nowrap",
                  flexShrink:  0,
                }}
              >
                {isGroupSubtask && group ? truncate(group.title, 28) : "My Tasks"}
              </span>
              <ChevronRight
                style={{
                  width:       12,
                  height:      12,
                  strokeWidth: 1.5,
                  color:       "var(--theme-text-tertiary)",
                  flexShrink:  0,
                }}
              />
              <span
                style={{
                  fontFamily:  "var(--font-sans)",
                  fontSize:    "var(--text-sm)",
                  fontWeight:  "var(--weight-semibold)",
                  color:       "var(--theme-text-primary)",
                  overflow:    "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:  "nowrap",
                }}
              >
                {truncate(title, 40)}
              </span>
            </div>

            {/* Right: status pill + priority pill + divider + actions */}
            <div
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        "var(--space-2)",
                flexShrink: 0,
              }}
            >
              {/* Status pill */}
              <div ref={statusMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMenu((v) => !v);
                    setShowPriorityMenu(false);
                    setShowMoreMenu(false);
                  }}
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    gap:          "var(--space-1)",
                    padding:      "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-full)",
                    border:       "1px solid var(--theme-paper-border)",
                    background:   "var(--theme-paper-subtle)",
                    color:        statusCfg.color,
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-xs)",
                    fontWeight:   "var(--weight-semibold)",
                    cursor:       "pointer",
                    transition:   "var(--transition-interactive)",
                    whiteSpace:   "nowrap",
                  }}
                >
                  <TaskStatusIcon status={status} size={11} />
                  {statusCfg.label}
                </button>

                <AnimatePresence>
                  {showStatusMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position:     "absolute",
                        top:          "calc(100% + var(--space-1))",
                        right:        0,
                        zIndex:       "calc(var(--z-modal) + 1)" as React.CSSProperties["zIndex"],
                        background:   "var(--theme-paper)",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow:    "var(--shadow-3)",
                        overflow:     "hidden",
                        minWidth:     "140px",
                      }}
                    >
                      {ALL_STATUSES.map((s) => {
                        const cfg    = TASK_STATUS[s];
                        const active = s === status;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleStatusChange(s)}
                            style={{
                              display:     "flex",
                              alignItems:  "center",
                              gap:         "var(--space-2)",
                              width:       "100%",
                              padding:     "var(--space-2) var(--space-3)",
                              border:      "none",
                              background:  active ? "var(--theme-paper-subtle)" : "transparent",
                              color:       cfg.color,
                              fontFamily:  "var(--font-sans)",
                              fontSize:    "var(--text-sm)",
                              fontWeight:  active ? "var(--weight-semibold)" : "var(--weight-normal)",
                              cursor:      "pointer",
                              transition:  "var(--transition-hover)",
                              textAlign:   "left",
                            }}
                          >
                            <TaskStatusIcon status={s} size={12} />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Priority pill */}
              <div ref={priorityMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPriorityMenu((v) => !v);
                    setShowStatusMenu(false);
                    setShowMoreMenu(false);
                  }}
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    gap:          "var(--space-1)",
                    padding:      "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-full)",
                    border:       "1px solid var(--theme-paper-border)",
                    background:   "var(--theme-paper-subtle)",
                    color:        priorityCfg.color,
                    fontFamily:   "var(--font-sans)",
                    fontSize:     "var(--text-xs)",
                    fontWeight:   "var(--weight-semibold)",
                    cursor:       "pointer",
                    transition:   "var(--transition-interactive)",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {priorityCfg.label}
                </button>

                <AnimatePresence>
                  {showPriorityMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position:     "absolute",
                        top:          "calc(100% + var(--space-1))",
                        right:        0,
                        zIndex:       "calc(var(--z-modal) + 1)" as React.CSSProperties["zIndex"],
                        background:   "var(--theme-paper)",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow:    "var(--shadow-3)",
                        overflow:     "hidden",
                        minWidth:     "120px",
                      }}
                    >
                      {ALL_PRIORITIES.map((p) => {
                        const cfg    = TASK_PRIORITY[p];
                        const active = p === priority;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handlePriorityChange(p)}
                            style={{
                              display:    "flex",
                              alignItems: "center",
                              width:      "100%",
                              padding:    "var(--space-2) var(--space-3)",
                              border:     "none",
                              background: active ? "var(--theme-paper-subtle)" : "transparent",
                              color:      cfg.color,
                              fontFamily: "var(--font-sans)",
                              fontSize:   "var(--text-sm)",
                              fontWeight: active ? "var(--weight-semibold)" : "var(--weight-normal)",
                              cursor:     "pointer",
                              transition: "var(--transition-hover)",
                              textAlign:  "left",
                            }}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div
                style={{
                  width:      "1px",
                  height:     "20px",
                  background: "var(--theme-paper-border)",
                  flexShrink: 0,
                }}
              />

              {/* Edit pencil */}
              <button
                type="button"
                onClick={() => editMode ? setEditMode(false) : enterEditMode()}
                aria-label={editMode ? "Cancel editing" : "Edit brief"}
                title={editMode ? "Cancel editing" : "Edit brief"}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  width:          "28px",
                  height:         "28px",
                  borderRadius:   "var(--radius-sm)",
                  border:         editMode ? "1px solid var(--theme-accent)" : "1px solid var(--theme-paper-border)",
                  background:     editMode ? "var(--theme-accent-surface)" : "transparent",
                  color:          editMode ? "var(--theme-accent)" : "var(--theme-text-tertiary)",
                  cursor:         "pointer",
                  transition:     "var(--transition-hover)",
                  flexShrink:     0,
                }}
              >
                <Pencil style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
              </button>

              {/* More menu */}
              <div ref={moreMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu((v) => !v);
                    setShowStatusMenu(false);
                    setShowPriorityMenu(false);
                  }}
                  aria-label="More options"
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
                  <MoreHorizontal style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                </button>

                <AnimatePresence>
                  {showMoreMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position:     "absolute",
                        top:          "calc(100% + var(--space-1))",
                        right:        0,
                        zIndex:       "calc(var(--z-modal) + 1)" as React.CSSProperties["zIndex"],
                        background:   "var(--theme-paper)",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow:    "var(--shadow-3)",
                        overflow:     "hidden",
                        minWidth:     "140px",
                      }}
                    >
                      {canDelete && (
                        <button
                          type="button"
                          onClick={handleDeleteTask}
                          style={{
                            display:    "flex",
                            alignItems: "center",
                            gap:        "var(--space-2)",
                            width:      "100%",
                            padding:    "var(--space-2) var(--space-3)",
                            border:     "none",
                            background: "transparent",
                            color:      "var(--color-danger-text)",
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-sm)",
                            cursor:     "pointer",
                            transition: "var(--transition-hover)",
                            textAlign:  "left",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-danger-light)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          }}
                        >
                          <Trash2 style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                          Delete task
                        </button>
                      )}
                      {!canDelete && (
                        <div
                          style={{
                            padding:    "var(--space-3)",
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-xs)",
                            color:      "var(--theme-text-tertiary)",
                          }}
                        >
                          No actions available
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
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
                <X style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
              </button>
            </div>
          </div>

          {/* ── TWO-ZONE BODY ───────────────────────────────────────── */}
          <div
            style={{
              display:  "flex",
              flex:     1,
              overflow: "hidden",
            }}
          >
            {/* ── ZONE A — The Brief (38%) ──────────────────────────── */}
            <div
              style={{
                flex:          "0 0 38%",
                borderRight:   "1px solid var(--theme-paper-border)",
                display:       "flex",
                flexDirection: "column",
                overflow:      "hidden",
              }}
            >
              <div
                style={{
                  flex:      1,
                  overflowY: "auto",
                  padding:   "var(--space-5) var(--space-5)",
                  display:   "flex",
                  flexDirection: "column",
                  gap:       "var(--space-5)",
                }}
              >
                {/* 1. Title */}
                <div>
                  <EyebrowLabel>Title</EyebrowLabel>
                  {editMode ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={255}
                      style={{
                        width:        "100%",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-sm)",
                        outline:      "none",
                        background:   "var(--theme-paper-subtle)",
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-sm)",
                        fontWeight:   "var(--weight-semibold)",
                        color:        "var(--theme-text-primary)",
                        padding:      "var(--space-2) var(--space-3)",
                        caretColor:   "var(--theme-accent)",
                        boxSizing:    "border-box",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-accent)";
                        e.currentTarget.style.boxShadow  = "var(--shadow-accent-ring)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.boxShadow  = "";
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display:    "block",
                        fontFamily: "var(--font-sans)",
                        fontSize:   "var(--text-sm)",
                        fontWeight: "var(--weight-semibold)",
                        color:      "var(--theme-text-primary)",
                        lineHeight: "var(--leading-relaxed)",
                      }}
                    >
                      {title}
                    </span>
                  )}
                </div>

                {/* 2. Notes / Objective */}
                <div>
                  <EyebrowLabel>
                    {isGroupSubtask ? "Objective" : "Notes"}
                  </EyebrowLabel>
                  {editMode ? (
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={4}
                      style={{
                        width:        "100%",
                        border:       "1px solid var(--theme-paper-border)",
                        borderRadius: "var(--radius-sm)",
                        outline:      "none",
                        background:   "var(--theme-paper-subtle)",
                        resize:       "vertical",
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-sm)",
                        color:        "var(--theme-text-primary)",
                        lineHeight:   "var(--leading-relaxed)",
                        padding:      "var(--space-2) var(--space-3)",
                        caretColor:   "var(--theme-accent)",
                        boxSizing:    "border-box",
                        maxHeight:    "200px",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-accent)";
                        e.currentTarget.style.boxShadow  = "var(--shadow-accent-ring)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.boxShadow  = "";
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display:    "block",
                        fontFamily: description ? "var(--font-sans)" : "var(--font-serif)",
                        fontStyle:  description ? "normal" : "italic",
                        fontSize:   "var(--text-sm)",
                        color:      description ? "var(--theme-text-primary)" : "var(--theme-text-tertiary)",
                        lineHeight: "var(--leading-relaxed)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {description || "No description provided."}
                    </span>
                  )}
                </div>

                {/* 3. Action Items (group subtasks only) */}
                {isGroupSubtask && (
                  <div>
                    {/* Section header */}
                    <div
                      style={{
                        display:        "flex",
                        alignItems:     "center",
                        gap:            "var(--space-2)",
                        marginBottom:   "var(--space-2)",
                      }}
                    >
                      <CheckSquare
                        style={{
                          width:       14,
                          height:      14,
                          strokeWidth: 1.5,
                          color:       "var(--theme-text-tertiary)",
                          flexShrink:  0,
                        }}
                      />
                      <EyebrowLabel>Action Items</EyebrowLabel>
                      {totalCount > 0 && (
                        <span
                          style={{
                            fontFamily:   "var(--font-sans)",
                            fontSize:     "var(--text-2xs)",
                            color:        "var(--theme-text-tertiary)",
                            background:   "var(--theme-paper-subtle)",
                            border:       "1px solid var(--theme-paper-border)",
                            borderRadius: "var(--radius-full)",
                            padding:      "0 var(--space-2)",
                            lineHeight:   "1.6",
                          }}
                        >
                          {doneCount}/{totalCount}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {totalCount > 0 && (
                      <div
                        style={{
                          height:       "3px",
                          background:   "var(--theme-paper-border)",
                          borderRadius: "var(--radius-full)",
                          marginBottom: "var(--space-3)",
                          overflow:     "hidden",
                        }}
                      >
                        <div
                          style={{
                            height:       "100%",
                            width:        `${progressPct}%`,
                            background:   "var(--theme-accent)",
                            borderRadius: "var(--radius-full)",
                            transition:   "width var(--duration-base) var(--ease-out-expo)",
                          }}
                        />
                      </div>
                    )}

                    {/* Checklist items */}
                    {editMode ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={editItems.map((i) => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {editItems.map((item) => (
                            <SortableChecklistItem
                              key={item.id}
                              item={item}
                              editMode={true}
                              onToggle={handleEditItemToggle}
                              onDelete={handleEditItemDelete}
                              onTextChange={handleEditItemTextChange}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <>
                        {displayItems.map((item) => (
                          <SortableChecklistItem
                            key={item.id}
                            item={item}
                            editMode={false}
                            onToggle={handleChecklistToggle}
                            onDelete={() => {}}
                            onTextChange={() => {}}
                          />
                        ))}
                        {!checklistExpanded && hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setChecklistExpanded(true)}
                            style={{
                              display:    "block",
                              marginTop:  "var(--space-1)",
                              fontFamily: "var(--font-sans)",
                              fontSize:   "var(--text-xs)",
                              color:      "var(--theme-accent)",
                              background: "transparent",
                              border:     "none",
                              cursor:     "pointer",
                              padding:    0,
                              textAlign:  "left",
                            }}
                          >
                            Show {hiddenCount} more…
                          </button>
                        )}
                      </>
                    )}

                    {/* Edit mode: add new item */}
                    {editMode && (
                      <div
                        style={{
                          display:    "flex",
                          alignItems: "center",
                          gap:        "var(--space-2)",
                          marginTop:  "var(--space-2)",
                        }}
                      >
                        <Plus
                          style={{
                            width:       14,
                            height:      14,
                            strokeWidth: 1.5,
                            color:       "var(--theme-text-tertiary)",
                            flexShrink:  0,
                          }}
                        />
                        <input
                          value={newItemText}
                          onChange={(e) => setNewItemText(e.target.value)}
                          onKeyDown={handleNewItemKeyDown}
                          placeholder="Add action item…"
                          style={{
                            flex:       1,
                            border:     "none",
                            borderBottom: "1px solid var(--theme-paper-border)",
                            outline:    "none",
                            background: "transparent",
                            fontFamily: "var(--font-sans)",
                            fontSize:   "var(--text-sm)",
                            color:      "var(--theme-text-primary)",
                            padding:    "var(--space-px) 0",
                            caretColor: "var(--theme-accent)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Divider */}
                <div style={{ height: "1px", background: "var(--theme-paper-border)" }} />

                {/* 4. Key Variables */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <InfoRow
                    icon={CalendarDays}
                    label="Deadline"
                    value={
                      task.due_at ? (
                        monoValue(formatDate(task.due_at, "dd MMM yyyy, HH:mm"))
                      ) : (
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontStyle:  "italic",
                            color:      "var(--theme-text-tertiary)",
                          }}
                        >
                          No deadline set
                        </span>
                      )
                    }
                  />

                  <InfoRow
                    icon={User}
                    label="Assigned To"
                    value={
                      assignee ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <Avatar
                            src={assignee.avatar_url}
                            name={assignee.full_name}
                            size="xs"
                            style={{ borderRadius: "var(--radius-xs)", width: 20, height: 20, minWidth: 20 }}
                          />
                          <span>{assignee.full_name}</span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--theme-text-tertiary)" }}>Unassigned</span>
                      )
                    }
                  />
                </div>

                {/* Divider */}
                <div style={{ height: "1px", background: "var(--theme-paper-border)" }} />

                {/* 5. Metadata footer */}
                <div
                  style={{
                    display:       "flex",
                    flexDirection: "column",
                    gap:           "var(--space-1)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize:   "var(--text-2xs)",
                      color:      "var(--theme-text-tertiary)",
                    }}
                  >
                    ID: {task.id.slice(0, 8)}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize:   "var(--text-2xs)",
                      color:      "var(--theme-text-tertiary)",
                    }}
                  >
                    Created: {formatDate(task.created_at, "dd MMM yyyy, HH:mm")}
                  </span>
                  {task.updated_at !== task.created_at && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize:   "var(--text-2xs)",
                        color:      "var(--theme-text-tertiary)",
                      }}
                    >
                      Updated: {formatDate(task.updated_at, "dd MMM yyyy, HH:mm")}
                    </span>
                  )}
                  {isGroupSubtask && group && (
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize:   "var(--text-2xs)",
                        color:      "var(--theme-text-tertiary)",
                      }}
                    >
                      In: {group.title}
                    </span>
                  )}
                </div>
              </div>

              {/* Edit mode footer — slide up */}
              <AnimatePresence>
                {editMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                    style={{
                      display:        "flex",
                      justifyContent: "flex-end",
                      gap:            "var(--space-2)",
                      padding:        "var(--space-3) var(--space-5)",
                      borderTop:      "1px solid var(--theme-paper-border)",
                      flexShrink:     0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      style={{
                        padding:      "var(--space-2) var(--space-4)",
                        borderRadius: "var(--radius-sm)",
                        border:       "1px solid var(--theme-paper-border)",
                        background:   "transparent",
                        color:        "var(--theme-text-secondary)",
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-sm)",
                        cursor:       "pointer",
                        transition:   "var(--transition-hover)",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBrief}
                      style={{
                        padding:      "var(--space-2) var(--space-4)",
                        borderRadius: "var(--radius-sm)",
                        border:       "none",
                        background:   "var(--theme-accent)",
                        color:        "var(--theme-accent-fg)",
                        fontFamily:   "var(--font-sans)",
                        fontSize:     "var(--text-sm)",
                        fontWeight:   "var(--weight-semibold)",
                        cursor:       "pointer",
                        transition:   "var(--transition-interactive)",
                      }}
                    >
                      Save Brief
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── ZONE B — Activity (62%) ────────────────────────────── */}
            <div
              style={{
                flex:          "0 0 62%",
                display:       "flex",
                flexDirection: "column",
                overflow:      "hidden",
                background:    "transparent",
                position:      "relative",
              }}
            >
              <TaskRemarksPanel
                taskId={task.id}
                currentUserId={callerProfile.id}
                currentUserName={currentUserName}
                initialRemarks={initialRemarks}
                composerPlaceholder={composerPlaceholder}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

SubTaskModal.displayName = "SubTaskModal";
