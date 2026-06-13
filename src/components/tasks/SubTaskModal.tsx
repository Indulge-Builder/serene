"use client";

/**
 * SubTaskModal — centered two-zone task detail modal.
 *
 * Two-zone CSS grid (38% / 62%):
 *   Row 1 — Zone A header: title + description (left), status + priority (right).
 *           Zone B header: edit / delete / close icons (right).
 *   Row 2 — Zone A body: checklist, details, metadata (scroll).
 *           Zone B body: TaskRemarksPanel (messages + composer).
 * Row heights align so messages start level with Zone A body — no harsh header rule.
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
import { useRouter } from "next/navigation";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronRight,
  Pencil,
  CheckSquare,
  CalendarDays,
  User,
  CheckCircle2,
  Trash2,
  GripVertical,
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
import { CollapseReveal } from "@/components/ui/CollapseReveal";
import { DatePicker } from "@/components/ui/DatePicker";
import { toast } from "@/lib/toast";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants/task-constants";
import { TaskRemarksPanel, type TaskRemarkWithAuthor } from "@/components/tasks/TaskRemarksPanel";
import { TaskStatusIcon } from "@/components/tasks/TaskStatusIcon";
import { Avatar } from "@/components/ui/Avatar";
import { EASE_OUT_EXPO, FAST_DURATION, PAGE_DURATION } from '@/lib/constants/motion';
import { canToggleTaskComplete } from '@/lib/utils/task-complete-auth';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskGroup,
  ChecklistItem,
  Profile,
} from "@/lib/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubTaskModalTaskUpdate = {
  id:           string;
  status?:      TaskStatus;
  priority?:    TaskPriority;
  title?:       string;
  description?: string | null;
  due_at?:      string | null;
};

export interface SubTaskModalProps {
  open:             boolean;
  onClose:          () => void;
  task:             Task;
  group?:           TaskGroup;
  assignee?:        Pick<Profile, "id" | "full_name" | "avatar_url">;
  initialRemarks:   TaskRemarkWithAuthor[];
  callerProfile:    Pick<Profile, "id" | "role" | "domain">;
  currentUserName?: string;
  /** Fired after a successful server write so list/board parents can sync without refresh */
  onTaskUpdated?:   (update: SubTaskModalTaskUpdate) => void;
  onTaskDeleted?:   (taskId: string) => void;
}

// ─── Icon button ──────────────────────────────────────────────────────────────

type IconButtonVariant = "edit" | "danger" | "close";

function iconButtonStyles(
  variant: IconButtonVariant,
  active?: boolean,
  danger?: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    width:          "30px",
    height:         "30px",
    borderRadius:   "var(--radius-sm)",
    cursor:         "pointer",
    transition:     "var(--transition-hover), transform var(--duration-instant) var(--ease-spring)",
    flexShrink:     0,
  };

  switch (variant) {
    case "edit":
      return {
        ...base,
        border: active
          ? "1px solid var(--theme-accent)"
          : "1px solid color-mix(in srgb, var(--theme-accent) 32%, transparent)",
        background: active
          ? "color-mix(in srgb, var(--theme-accent) 18%, transparent)"
          : "color-mix(in srgb, var(--theme-accent) 10%, var(--theme-paper))",
        color: active ? "var(--theme-accent-hover)" : "var(--theme-accent)",
      };
    case "danger":
      return {
        ...base,
        border: danger
          ? "1px solid color-mix(in srgb, var(--color-danger) 45%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-danger) 22%, transparent)",
        background: danger
          ? "color-mix(in srgb, var(--color-danger) 12%, transparent)"
          : "var(--color-danger-light)",
        color: "var(--color-danger-text)",
      };
    case "close":
      return {
        ...base,
        border:     "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper-subtle)",
        color:      "var(--theme-text-tertiary)",
      };
  }
}

function IconButton({
  onClick,
  label,
  variant,
  active,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  variant: IconButtonVariant;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={variant === "close" ? "serene-pressable serene-icon-rotate-hover serene-touch" : "serene-pressable serene-touch"}
      style={iconButtonStyles(variant, active, danger)}
    >
      {children}
    </button>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: TaskStatus[] = [
  "to_do", "in_progress", "in_review", "completed", "error", "cancelled",
];

const ALL_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal"];

const META_PILL_TRIGGER: React.CSSProperties = {
  display:        "inline-flex",
  alignItems:     "center",
  justifyContent: "center",
  gap:            "var(--space-1)",
  minHeight:      28,
  padding:        "0 var(--space-3)",
  borderRadius:   "var(--radius-full)",
  fontFamily:     "var(--font-sans)",
  fontSize:       "var(--text-xs)",
  fontWeight:     "var(--weight-semibold)",
  whiteSpace:     "nowrap",
  cursor:         "pointer",
  transition:     "var(--transition-hover)",
  flexShrink:     0,
  lineHeight:     1,
};

// ─── Add action item row (always visible when caller can edit) ────────────────

function ActionItemAddRow({
  value,
  onChange,
  onSubmit,
  hasItemsAbove,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  hasItemsAbove: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "var(--space-2)",
        padding:       "var(--space-2) var(--space-1)",
        marginTop:     hasItemsAbove ? "var(--space-1)" : 0,
        borderRadius:  "var(--radius-sm)",
        borderTop:     hasItemsAbove ? "1px solid var(--theme-paper-border)" : "none",
        paddingTop:    hasItemsAbove ? "var(--space-3)" : "var(--space-2)",
        cursor:        disabled ? "default" : "text",
        background:    focused ? "var(--theme-paper-subtle)" : "transparent",
        boxShadow:     focused ? "inset 0 0 0 1px var(--theme-accent-surface)" : "none",
        transition:    "background var(--transition-hover), box-shadow var(--transition-hover)",
        opacity:       disabled ? 0.5 : 1,
      }}
    >
      <div
        aria-hidden
        style={{
          width:        "16px",
          height:       "16px",
          borderRadius: "var(--radius-xs)",
          border:       "1.5px dashed var(--theme-paper-border)",
          flexShrink:   0,
          transition:   "border-color var(--transition-hover)",
          ...(focused ? { borderColor: "var(--theme-accent)" } : {}),
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Add an action item…"
        aria-label="Add an action item"
        style={{
          flex:         1,
          border:       "none",
          outline:      "none",
          background:   "transparent",
          fontFamily:   "var(--font-sans)",
          fontSize:     "var(--text-sm)",
          color:        "var(--theme-text-primary)",
          padding:      0,
          caretColor:   "var(--theme-accent)",
        }}
      />
      <AnimatePresence initial={false}>
        {value.trim().length > 0 && !disabled && (
          <motion.button
            key="add-action-submit"
            type="button"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
            onClick={(e) => {
              e.stopPropagation();
              onSubmit();
            }}
            whileTap={{ scale: 0.92 }}
            aria-label="Add action item"
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
              padding:        "2px var(--space-2)",
              borderRadius:   "var(--radius-full)",
              border:         "none",
              background:     "var(--theme-accent)",
              color:          "var(--theme-accent-fg)",
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-2xs)",
              fontWeight:     "var(--weight-semibold)",
              letterSpacing:  "var(--tracking-wide)",
              cursor:         "pointer",
              willChange:     "transform",
            }}
          >
            Add
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
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
        display:    "flex",
        alignItems: "center",
        gap:        "var(--space-2)",
        padding:    "var(--space-1) 0",
      }}
    >
      {editMode && (
        <span
          {...attributes}
          {...listeners}
          style={{
            display:     "flex",
            cursor:      "grab",
            color:       "var(--theme-text-tertiary)",
            flexShrink:  0,
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
            flex:         1,
            border:       "none",
            borderBottom: "1px solid var(--theme-paper-border)",
            outline:      "none",
            background:   "transparent",
            fontFamily:   "var(--font-sans)",
            fontSize:     "var(--text-sm)",
            color:        "var(--theme-text-primary)",
            padding:      "var(--space-px) 0",
            caretColor:   "var(--theme-accent)",
          }}
        />
      ) : (
        <span
          style={{
            flex:           1,
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
            color:          item.checked
              ? "var(--theme-text-tertiary)"
              : "var(--theme-text-primary)",
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
  onTaskUpdated,
  onTaskDeleted,
}: SubTaskModalProps) {
  const isGroupSubtask = task.task_category === "group_subtask";

  // ── Local state ───────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueAt,       setDueAt]       = useState<string | null>(task.due_at ?? null);
  const [status,      setStatus]      = useState<TaskStatus>(task.status);
  const [priority,    setPriority]    = useState<TaskPriority>(task.priority);
  const [checklist,   setChecklist]   = useState<ChecklistItem[]>(task.attachments ?? []);

  const [editMode,          setEditMode]          = useState(false);
  const [showStatusMenu,    setShowStatusMenu]    = useState(false);
  const [showPriorityMenu,  setShowPriorityMenu]  = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [editTitle,  setEditTitle]  = useState(task.title);
  const [editDesc,   setEditDesc]   = useState(task.description ?? "");
  const [editDueAt,  setEditDueAt]  = useState<Date | null>(task.due_at ? new Date(task.due_at) : null);
  const [editItems,  setEditItems]  = useState<ChecklistItem[]>(task.attachments ?? []);
  const [newItemText, setNewItemText]   = useState("");
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  const [, startTransition] = useTransition();
  const router = useRouter();

  // Unique id for aria
  const titleId = useId();

  // ── Refs for dropdown click-outside ──────────────────────────────────────
  const statusMenuRef   = useRef<HTMLDivElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);

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
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function emitTaskUpdate(update: SubTaskModalTaskUpdate) {
    onTaskUpdated?.(update);
  }

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
        return;
      }
      emitTaskUpdate({ id: task.id, status: newStatus });
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
        return;
      }
      emitTaskUpdate({ id: task.id, priority: newPriority });
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
    setEditDueAt(dueAt ? new Date(dueAt) : null);
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
      const newDueAtIso = editDueAt ? editDueAt.toISOString() : null;
      const oldDueAtIso = task.due_at ?? null;
      if (newDueAtIso !== oldDueAtIso) updateFields.due_at = newDueAtIso;

      // Save task fields
      if (Object.keys(updateFields).length > 1) {
        const result = await updateTaskAction(updateFields);
        if (result.error) {
          toast.danger("Couldn't save brief", { message: result.error });
          return;
        }
        setTitle(trimmedTitle);
        setDescription(editDesc.trim());
        if (newDueAtIso !== oldDueAtIso) setDueAt(newDueAtIso);
        emitTaskUpdate({
          id: task.id,
          ...(trimmedTitle !== task.title ? { title: trimmedTitle } : {}),
          ...(editDesc.trim() !== (task.description ?? "")
            ? { description: editDesc.trim() || null }
            : {}),
          ...(newDueAtIso !== oldDueAtIso ? { due_at: newDueAtIso } : {}),
        });
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
      router.refresh();
    });
  }

  // ── Delete task ───────────────────────────────────────────────────────────
  function handleDeleteTask() {
    setShowDeleteConfirm(false);
    startTransition(async () => {
      const result = await deleteTaskAction({ taskId: task.id });
      if (result.error) {
        toast.danger("Couldn't delete task", { message: result.error });
      } else {
        onTaskDeleted?.(task.id);
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

  function buildNewChecklistItem(text: string): ChecklistItem {
    return {
      id:      `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      checked: false,
    };
  }

  function handleAddNewItem() {
    const text = newItemText.trim();
    if (!text) return;
    setEditItems((prev) => [...prev, buildNewChecklistItem(text)]);
    setNewItemText("");
  }

  function handlePersistAddItem() {
    const text = newItemText.trim();
    if (!text) return;
    const newItem = buildNewChecklistItem(text);
    const updated = [...checklist, newItem];
    const previous = checklist;
    setChecklist(updated);
    setNewItemText("");
    startTransition(async () => {
      const result = await updateChecklistAction({ taskId: task.id, items: updated });
      if (result.error) {
        setChecklist(previous);
        toast.danger("Couldn't add action item", { message: result.error });
      }
    });
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

  const canEditChecklist = canToggleTaskComplete(
    task,
    callerProfile,
    group?.domain ?? null,
  );

  const addRowHasItemsAbove = editMode ? editItems.length > 0 : totalCount > 0;

  // ── Status pill config ────────────────────────────────────────────────────
  const statusCfg   = TASK_STATUS[status];
  const priorityCfg = TASK_PRIORITY[priority];

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
          background: "color-mix(in srgb, var(--theme-canvas) 72%, transparent)",
          zIndex:     "var(--z-overlay)" as React.CSSProperties["zIndex"],
        }}
      />

      {/* Panel */}
      <motion.div
        key="subtask-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
        onClick={(e) => e.stopPropagation()}
        className="left-0 lg:left-60"
        style={{
          position:       "fixed",
          top:            0,
          right:          0,
          bottom:         0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          zIndex:         "var(--z-modal)" as React.CSSProperties["zIndex"],
          pointerEvents:  "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            width:         "95vw",
            maxWidth:      "1100px",
            height:        "90dvh",
            maxHeight:     "820px",
            background:    "var(--theme-paper)",
            borderRadius:  "var(--radius-lg)",
            boxShadow:     "var(--shadow-4)",
            border:        "1px solid var(--theme-paper-border)",
            overflow:      "hidden",
            display:       "flex",
            flexDirection: "column",
          }}
        >
          {/* ── TWO-ZONE GRID — shared header row, aligned content row.
                Below md the zones stack in one scrolling column (audit F4);
                placements live in classes so the mobile column can reflow. ─ */}
          <div
            className="grid grid-cols-1 md:grid-cols-[38%_62%] md:grid-rows-[auto_1fr] overflow-y-auto md:overflow-hidden"
            style={{
              flex:       1,
              minHeight:  0,
              background: "var(--theme-paper-subtle)",
            }}
          >
            {/* Zone A header — title + description | status + priority */}
            <div
              id={titleId}
              className="md:col-start-1 md:row-start-1"
              style={{
                display:        "flex",
                alignItems:     "flex-start",
                justifyContent: "space-between",
                gap:            "var(--space-5)",
                padding:        "var(--space-5) var(--space-6) var(--space-4)",
                paddingLeft:    "var(--space-7)",
              }}
            >
              {/* Left: title + description */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
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
                      fontFamily:   "var(--font-serif)",
                      fontSize:     "var(--text-xl)",
                      fontWeight:   "var(--weight-semibold)",
                      color:        "var(--theme-text-primary)",
                      padding:      "var(--space-2) var(--space-3)",
                      caretColor:   "var(--theme-accent)",
                      boxSizing:    "border-box",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-paper-border)";
                    }}
                  />
                ) : (
                  <h2
                    style={{
                      margin:        0,
                      fontFamily:    "var(--font-serif)",
                      fontSize:      "var(--text-xl)",
                      fontWeight:    "var(--weight-semibold)",
                      color:         "var(--theme-text-primary)",
                      lineHeight:    "var(--leading-snug)",
                      letterSpacing: "var(--tracking-tight)",
                    }}
                  >
                    {title}
                  </h2>
                )}

                {editMode ? (
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
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
                      maxHeight:    "120px",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--theme-paper-border)";
                    }}
                  />
                ) : (
                  <span
                    style={{
                      display:    "block",
                      fontFamily: description ? "var(--font-sans)" : "var(--font-serif)",
                      fontStyle:  description ? "normal" : "italic",
                      fontSize:   "var(--text-sm)",
                      color:      description
                        ? "var(--theme-text-secondary)"
                        : "var(--theme-text-tertiary)",
                      lineHeight: "var(--leading-relaxed)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {description || "No description yet."}
                  </span>
                )}
              </div>

              {/* Right: status + priority */}
              <div
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "flex-end",
                  gap:           "var(--space-2)",
                  flexShrink:    0,
                  paddingTop:    "var(--space-1)",
                }}
              >
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "flex-end",
                    gap:            "var(--space-2)",
                    flexWrap:       "nowrap",
                  }}
                >

                {/* Status selector */}
              <div ref={statusMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMenu((v) => !v);
                    setShowPriorityMenu(false);
                  }}
                  style={{
                    ...META_PILL_TRIGGER,
                    background: statusCfg.pillBg,
                    color:      statusCfg.pillText,
                    border:     `1px solid color-mix(in srgb, ${statusCfg.color} 20%, transparent)`,
                  }}
                >
                  <TaskStatusIcon status={status} size={11} />
                  {statusCfg.label}
                  <ChevronRight style={{ width: 10, height: 10, strokeWidth: 2, opacity: 0.5, transform: "rotate(90deg)", flexShrink: 0 }} />
                </button>

                <AnimatePresence>
                  {showStatusMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
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
                        minWidth:     "160px",
                        padding:      "var(--space-1)",
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
                              display:      "flex",
                              alignItems:   "center",
                              gap:          "var(--space-2)",
                              width:        "100%",
                              padding:      "var(--space-2) var(--space-3)",
                              border:       "none",
                              borderRadius: "var(--radius-sm)",
                              background:   active ? cfg.remarkBg : "transparent",
                              color:        active ? cfg.remarkColor : "var(--theme-text-secondary)",
                              fontFamily:   "var(--font-sans)",
                              fontSize:     "var(--text-sm)",
                              cursor:       "pointer",
                              textAlign:    "left",
                              transition:   "background 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--theme-paper-subtle)";
                            }}
                            onMouseLeave={(e) => {
                              if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            }}
                          >
                            <span style={{ display: "block", width: 7, height: 7, borderRadius: "var(--radius-full)", background: cfg.color, flexShrink: 0 }} />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Priority selector */}
              <div ref={priorityMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPriorityMenu((v) => !v);
                    setShowStatusMenu(false);
                  }}
                  style={{
                    ...META_PILL_TRIGGER,
                    background: "var(--theme-paper)",
                    border:     `1px solid color-mix(in srgb, ${priorityCfg.color} 24%, var(--theme-paper-border))`,
                    color:      priorityCfg.color,
                  }}
                >
                  <span
                    style={{
                      display:      "block",
                      width:        6,
                      height:       6,
                      borderRadius: "var(--radius-full)",
                      background:   priorityCfg.color,
                      flexShrink:   0,
                    }}
                  />
                  {priorityCfg.label}
                  <ChevronRight style={{ width: 10, height: 10, strokeWidth: 2, opacity: 0.5, transform: "rotate(90deg)", flexShrink: 0 }} />
                </button>

                <AnimatePresence>
                  {showPriorityMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
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
                        minWidth:     "130px",
                        padding:      "var(--space-1)",
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
                              display:      "flex",
                              alignItems:   "center",
                              gap:          "var(--space-2)",
                              width:        "100%",
                              padding:      "var(--space-2) var(--space-3)",
                              border:       "none",
                              borderRadius: "var(--radius-sm)",
                              background:   active ? "var(--theme-paper-subtle)" : "transparent",
                              color:        active ? cfg.color : "var(--theme-text-secondary)",
                              fontFamily:   "var(--font-sans)",
                              fontSize:     "var(--text-sm)",
                              fontWeight:   active ? "var(--weight-semibold)" : "var(--weight-normal)",
                              cursor:       "pointer",
                              textAlign:    "left",
                              transition:   "background 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--theme-paper-subtle)";
                            }}
                            onMouseLeave={(e) => {
                              if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            }}
                          >
                            <span style={{ display: "block", width: 6, height: 6, borderRadius: "var(--radius-full)", background: cfg.color, flexShrink: 0 }} />
                            {cfg.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

                </div>
              </div>
            </div>

            {/* Zone B header — action icons (first in the mobile column so
                close/edit stay at the top of the sheet) */}
            <div
              className="md:col-start-2 md:row-start-1 max-md:order-first max-md:pb-0"
              style={{
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "flex-end",
                gap:            "var(--space-2)",
                padding:        "var(--space-5) var(--space-6) var(--space-4)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
                <IconButton
                  variant="edit"
                  onClick={() => editMode ? setEditMode(false) : enterEditMode()}
                  label={editMode ? "Cancel editing" : "Edit brief"}
                  active={editMode}
                >
                  <Pencil style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                </IconButton>

                {canDelete && (
                  <IconButton
                    variant="danger"
                    onClick={() => setShowDeleteConfirm((v) => !v)}
                    label="Delete task"
                    danger={showDeleteConfirm}
                  >
                    <Trash2 style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                  </IconButton>
                )}

                <IconButton variant="close" onClick={onClose} label="Close">
                  <X style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                </IconButton>
              </div>

            {/* Delete confirm banner — slides in */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <CollapseReveal>
                  <div
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "space-between",
                      padding:        "var(--space-3) var(--space-4)",
                      background:     "color-mix(in srgb, var(--color-danger) 8%, var(--theme-paper-subtle))",
                      borderRadius:   "var(--radius-md)",
                      gap:            "var(--space-4)",
                      width:          "100%",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize:   "var(--text-sm)",
                        color:      "var(--theme-text-secondary)",
                      }}
                    >
                      This task will be permanently deleted. Are you sure?
                    </span>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        style={{
                          padding:      "var(--space-1) var(--space-3)",
                          borderRadius: "var(--radius-sm)",
                          border:       "1px solid var(--theme-paper-border)",
                          background:   "var(--theme-paper)",
                          color:        "var(--theme-text-secondary)",
                          fontFamily:   "var(--font-sans)",
                          fontSize:     "var(--text-sm)",
                          cursor:       "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteTask}
                        style={{
                          padding:      "var(--space-1) var(--space-3)",
                          borderRadius: "var(--radius-sm)",
                          border:       "none",
                          background:   "var(--color-danger)",
                          color:        "var(--color-danger-fg)",
                          fontFamily:   "var(--font-sans)",
                          fontSize:     "var(--text-sm)",
                          fontWeight:   "var(--weight-semibold)",
                          cursor:       "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </CollapseReveal>
              )}
            </AnimatePresence>
            </div>

            {/* Zone A body — checklist, details, metadata */}
            <div
              className="md:col-start-1 md:row-start-2"
              style={{
                minHeight:     0,
                overflow:      "hidden",
                display:       "flex",
                flexDirection: "column",
                position:      "relative",
              }}
            >
              {/* Left accent glow bar */}
              <div
                aria-hidden
                style={{
                  position:     "absolute",
                  left:         0,
                  top:          "var(--space-6)",
                  bottom:       "var(--space-6)",
                  width:        "2px",
                  borderRadius: "var(--radius-full)",
                  background:   "linear-gradient(to bottom, transparent, var(--theme-accent), transparent)",
                  opacity:      0.4,
                  pointerEvents: "none",
                }}
              />

              {/* Scrollable body */}
              <div
                style={{
                  flex:          1,
                  overflowY:     "auto",
                  padding:       "var(--space-4) var(--space-6) var(--space-6) var(--space-7)",
                  display:       "flex",
                  flexDirection: "column",
                  gap:           "var(--space-5)",
                }}
              >

                {/* 2. Action Items card — checklist (personal + group subtasks) */}
                  <div
                    style={{
                      background:   "var(--theme-paper)",
                      borderRadius: "var(--radius-md)",
                      border:       "1px solid var(--theme-paper-border)",
                      overflow:     "hidden",
                      boxShadow:    "var(--shadow-1)",
                    }}
                  >
                    {/* Card header */}
                    <div
                      style={{
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "space-between",
                        padding:        "var(--space-3) var(--space-4)",
                        borderBottom:   "1px solid var(--theme-paper-border)",
                        background:     "var(--theme-paper-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <CheckSquare style={{ width: 13, height: 13, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
                        <span
                          style={{
                            fontFamily:    "var(--font-sans)",
                            fontSize:      "var(--text-2xs)",
                            fontWeight:    "var(--weight-semibold)",
                            letterSpacing: "var(--tracking-widest)",
                            textTransform: "uppercase" as const,
                            color:         "var(--theme-text-tertiary)",
                          }}
                        >
                          Action Items
                        </span>
                      </div>
                      {totalCount > 0 && (
                        <span
                          style={{
                            fontFamily:   "var(--font-mono)",
                            fontSize:     "var(--text-2xs)",
                            fontWeight:   "var(--weight-semibold)",
                            color:        progressPct === 100 ? "var(--color-success-text)" : "var(--theme-accent)",
                            background:   progressPct === 100 ? "var(--color-success-light)" : "var(--theme-accent-surface)",
                            borderRadius: "var(--radius-full)",
                            padding:      "1px var(--space-2)",
                            transition:   "var(--transition-hover)",
                          }}
                        >
                          {doneCount}/{totalCount}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {totalCount > 0 && (
                      <div style={{ height: "2px", background: "var(--theme-paper-border)", overflow: "hidden" }}>
                        {/* Full-width fill scaled by transform — never animate width (DNA M-06) */}
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: progressPct / 100 }}
                          transition={{ duration: PAGE_DURATION, ease: EASE_OUT_EXPO }}
                          style={{
                            width:           "100%",
                            height:          "100%",
                            transformOrigin: "left center",
                            background: progressPct === 100 ? "var(--color-success)" : "var(--theme-accent)",
                          }}
                        />
                      </div>
                    )}

                    {/* Checklist items */}
                    <div style={{ padding: "var(--space-2) var(--space-4)" }}>
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
                                margin:     "var(--space-1) 0 var(--space-2)",
                                fontFamily: "var(--font-sans)",
                                fontSize:   "var(--text-xs)",
                                color:      "var(--theme-accent)",
                                background: "transparent",
                                border:     "none",
                                cursor:     "pointer",
                                padding:    0,
                              }}
                            >
                              Show {hiddenCount} more…
                            </button>
                          )}
                        </>
                      )}

                      {canEditChecklist && (
                        <ActionItemAddRow
                          value={newItemText}
                          onChange={setNewItemText}
                          onSubmit={editMode ? handleAddNewItem : handlePersistAddItem}
                          hasItemsAbove={addRowHasItemsAbove}
                        />
                      )}
                    </div>
                  </div>

                {/* 3. Details card — deadline + assignee */}
                <div
                  style={{
                    background:   "var(--theme-paper)",
                    borderRadius: "var(--radius-md)",
                    border:       "1px solid var(--theme-paper-border)",
                    overflow:     "hidden",
                    boxShadow:    "var(--shadow-1)",
                  }}
                >
                  <div
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          "var(--space-2)",
                      padding:      "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--theme-paper-border)",
                      background:   "var(--theme-paper-subtle)",
                    }}
                  >
                    <CalendarDays style={{ width: 13, height: 13, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
                    <span
                      style={{
                        fontFamily:    "var(--font-sans)",
                        fontSize:      "var(--text-2xs)",
                        fontWeight:    "var(--weight-semibold)",
                        letterSpacing: "var(--tracking-widest)",
                        textTransform: "uppercase" as const,
                        color:         "var(--theme-text-tertiary)",
                      }}
                    >
                      Details
                    </span>
                  </div>
                  <div
                    style={{
                      display:       "flex",
                      flexDirection: "column",
                      gap:           "var(--space-3)",
                      padding:       "var(--space-4)",
                    }}
                  >
                    {/* Deadline row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <CalendarDays style={{ width: 13, height: 13, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", flexShrink: 0, minWidth: "60px" }}>Deadline</span>
                      {editMode ? (
                        <DatePicker
                          value={editDueAt}
                          onChange={setEditDueAt}
                          showTime
                          placeholder="Set deadline"
                        />
                      ) : dueAt ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--theme-text-primary)" }}>
                          {formatDate(dueAt, "dd MMM yyyy, HH:mm")}
                        </span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "var(--text-sm)", color: "var(--theme-text-tertiary)" }}>
                          No deadline set
                        </span>
                      )}
                    </div>
                    <div style={{ height: "1px", background: "var(--theme-paper-border)" }} />
                    {/* Assignee row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <User style={{ width: 13, height: 13, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", flexShrink: 0, minWidth: "60px" }}>Assigned</span>
                      {assignee ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <Avatar src={assignee.avatar_url} name={assignee.full_name} size="xs" style={{ borderRadius: "var(--radius-xs)", width: 18, height: 18, minWidth: 18 }} />
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", color: "var(--theme-text-primary)" }}>{assignee.full_name}</span>
                        </div>
                      ) : (
                        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "var(--text-sm)", color: "var(--theme-text-tertiary)" }}>
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Metadata footer — whispered, monospace */}
                <div
                  style={{
                    display:       "flex",
                    flexDirection: "column",
                    gap:           "var(--space-1)",
                    paddingTop:    "var(--space-2)",
                    borderTop:     "1px dashed var(--theme-paper-border)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)" }}>
                    {task.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)" }}>
                    Created {formatDate(task.created_at, "dd MMM yyyy")}
                  </span>
                  {task.updated_at !== task.created_at && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--theme-text-tertiary)" }}>
                      Updated {formatDate(task.updated_at, "dd MMM yyyy")}
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
                      background:     "var(--theme-paper-subtle)",
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
                        background:   "var(--theme-paper)",
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
                      Save
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Zone B body — remarks timeline + composer. Fixed height in the
                mobile column so the timeline scrolls internally and the
                composer stays reachable. */}
            <div
              className="md:col-start-2 md:row-start-2 max-md:h-[60dvh]"
              style={{
                minHeight:     0,
                overflow:      "hidden",
                display:       "flex",
                flexDirection: "column",
                position:      "relative",
                borderLeft:    "1px solid color-mix(in srgb, var(--theme-paper-border) 40%, transparent)",
              }}
            >
              <TaskRemarksPanel
                taskId={task.id}
                currentUserId={callerProfile.id}
                currentUserName={currentUserName}
                initialRemarks={initialRemarks}
                embedded
              />
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

SubTaskModal.displayName = "SubTaskModal";
