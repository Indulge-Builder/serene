'use client';

/**
 * PersonalTasksTab — priority-section layout with completion circles and quick-add.
 *
 * Layout:
 *   [Quick-add row]        ← always at top when open
 *   [URGENT section]       ← collapsed/expanded; hidden when empty
 *   [HIGH section]
 *   [NORMAL section]
 *   [COMPLETED section]    ← collapsed by default; last 20, ordered updated_at DESC
 *
 * Data: all non-completed tasks fetched in one call (limit 500) on mount.
 *       Completed tasks fetched separately (limit 20, status=['completed']).
 *       Both calls in parallel via Promise.all.
 *
 * Section collapse: tracked in useRef (not useState) so optimistic status
 * changes do not trigger collapse animation re-renders.
 *
 * Optimistic complete: local optimisticStatus map keyed by taskId.
 * On error: removed from map + toast.danger. On success: task moved to
 * completed list on next server-side refresh.
 *
 * Pre-mortem addressed:
 * - useRef for section open/closed — no collapse re-render on optimistic update.
 * - Fetch limit 500 — no unbounded SELECT.
 * - Quick-add useTransition guard preserved exactly from Problem 7 fix.
 * - Priority selector removed from quick-add (defaults to 'normal').
 * - Filters live in TasksShell filter bar (client-side only).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  UserCircle,
  X,
  ArrowRight,
  User,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  createPersonalTaskAction,
  getPersonalTasksAction,
  getTaskRemarksAction,
} from '@/lib/actions/tasks';
import { TaskCompletionCircle } from '@/components/tasks/TaskCompletionCircle';
import { useCreateTriggerModal } from '@/hooks/useCreateTriggerModal';
import { useTaskCompletionToggle } from '@/hooks/useTaskCompletionToggle';
import { canToggleTaskComplete } from '@/lib/utils/task-complete-auth';
import { formatRelativeTime } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { SubTaskModal, type SubTaskModalTaskUpdate } from '@/components/tasks/SubTaskModal';
import { AssigneePickerModal, type AssignableUser } from '@/components/tasks/AssigneePickerModal';
import { CreatePersonalTaskModal } from '@/components/tasks/CreatePersonalTaskModal';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import type { PersonalTasksResult, TaskRemarkWithAuthor, PersonalTaskCursor } from '@/lib/services/tasks-service';
import type { Task, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import {
  countVisiblePersonalTasks,
  resolvePersonalTaskAssignee,
  type PersonalTaskFiltersState,
} from '@/lib/utils/task-client-filters';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PersonalTasksTabProps {
  initialResult:   PersonalTasksResult;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
  /** Increments each time the parent header button is clicked — triggers modal open */
  createTrigger?:  number;
  filters:           PersonalTaskFiltersState;
  onFilteredCountChange?: (count: number) => void;
  onTagsMayHaveChanged?: () => void;
}

// ─── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; dotColor: string; headerColor: string; headerBg: string; borderColor: string }
> = {
  urgent: {
    label:       'URGENT',
    dotColor:    'var(--color-danger)',
    headerColor: 'var(--color-danger-text)',
    headerBg:    'var(--color-danger-light)',
    borderColor: 'var(--color-danger)',
  },
  high: {
    label:       'HIGH',
    dotColor:    'var(--color-warning)',
    headerColor: 'var(--color-warning-text)',
    headerBg:    'var(--color-warning-light)',
    borderColor: 'var(--color-warning)',
  },
  normal: {
    label:       'NORMAL',
    dotColor:    'var(--theme-text-tertiary)',
    headerColor: 'var(--theme-text-secondary)',
    headerBg:    'var(--theme-paper-subtle)',
    borderColor: 'var(--theme-paper-border)',
  },
};

const ACTIVE_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDueDateColor(dueAt: string | null, status: TaskStatus): string {
  if (!dueAt || status === 'completed' || status === 'cancelled') return 'var(--theme-text-tertiary)';
  const now  = new Date();
  const due  = new Date(dueAt);
  const diff = due.getTime() - now.getTime();
  if (diff < 0)                    return 'var(--color-danger-text)';
  if (diff < 24 * 60 * 60 * 1000) return 'var(--color-warning-text)';
  return 'var(--theme-text-tertiary)';
}

function isOverdue(dueAt: string | null, status: TaskStatus): boolean {
  if (!dueAt || status === 'completed' || status === 'cancelled') return false;
  return new Date(dueAt) < new Date();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PersonalTasksTab({
  initialResult,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  createTrigger = 0,
  filters,
  onFilteredCountChange,
  onTagsMayHaveChanged,
}: PersonalTasksTabProps) {
  // ── Task data ─────────────────────────────────────────────────────────────
  const [activeTasks,    setActiveTasks]    = useState<Task[]>(initialResult.tasks);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);

  // ── Optimistic complete / reopen (circle control) ─────────────────────────
  const { optimisticStatus, handleToggle } = useTaskCompletionToggle();
  const caller = { id: currentUserId, role: callerRole, domain: callerDomain };

  // ── Section collapse — useRef, NOT useState — pre-mortem P-04 ─────────────
  // Prevents optimistic status updates (which re-render) from collapsing sections.
  const sectionOpenRef = useRef<Record<string, boolean>>({
    urgent:    true,
    high:      true,
    normal:    true,
    completed: false,
  });
  // Separate useState only to trigger a re-render when section is toggled by the user
  const [sectionRenderKey, setSectionRenderKey] = useState(0);

  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // ── Cursor pagination for active tasks ───────────────────────────────────────
  const [hasMore,       setHasMore]       = useState(initialResult.hasMore);
  const [nextCursor,    setNextCursor]    = useState<PersonalTaskCursor | null>(initialResult.nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    getPersonalTasksAction({ cursor: nextCursor, status: ['to_do', 'in_progress', 'in_review', 'error', 'cancelled'] })
      .then((r) => {
        if (r.data) {
          setActiveTasks((prev) => [...prev, ...r.data!.tasks]);
          setHasMore(r.data.hasMore);
          setNextCursor(r.data.nextCursor);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [hasMore, isLoadingMore, nextCursor]);

  // Guards against double-fetch if the completed section header is clicked
  // twice before the first response returns. Set BEFORE the action call fires.
  const hasLoadedCompleted = useRef(false);

  function isSectionOpen(key: string): boolean {
    return sectionOpenRef.current[key] ?? true;
  }

  function toggleSection(key: string) {
    sectionOpenRef.current[key] = !sectionOpenRef.current[key];
    setSectionRenderKey((k) => k + 1);

    // Lazy-load completed tasks on first expand of the completed section.
    // hasLoadedCompleted.current is set BEFORE the action call fires — not after
    // it resolves — so a double-click before the first response returns never
    // triggers two network calls.
    if (key === 'completed' && sectionOpenRef.current['completed'] && !hasLoadedCompleted.current) {
      hasLoadedCompleted.current = true;
      setIsLoadingCompleted(true);
      getPersonalTasksAction({ status: ['completed'], limit: 20 })
        .then((r) => {
          if (r.data) setCompletedTasks(r.data.tasks);
        })
        .catch(() => {})
        .finally(() => setIsLoadingCompleted(false));
    }
  }

  // ── Create task modal ─────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useCreateTriggerModal(createTrigger, () => setCreateModalOpen(true));

  // ── Quick-add row state ──────────────────────────────────────────────────
  const [showQuickAdd,       setShowQuickAdd]       = useState(false);
  const [quickTitle,         setQuickTitle]         = useState('');
  const [quickDueAt,         setQuickDueAt]         = useState<Date | null>(null);
  const [quickAssignee,      setQuickAssignee]      = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assignableUsers,    setAssignableUsers]    = useState<AssignableUser[]>([]);
  const quickTitleRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();

  // ── Task modal state ──────────────────────────────────────────────────────
  const [selectedTask,        setSelectedTask]        = useState<Task | null>(null);
  const [selectedTaskRemarks, setSelectedTaskRemarks] = useState<TaskRemarkWithAuthor[] | null>(null);
  const [taskModalOpen,       setTaskModalOpen]       = useState(false);

  // ── Focus quick-add title on show ─────────────────────────────────────────
  useEffect(() => {
    if (showQuickAdd) {
      setTimeout(() => quickTitleRef.current?.focus(), 50);
    }
  }, [showQuickAdd]);

  // ── Assignee picker: load users on mount (manager+ only) ─────────────────
  useEffect(() => {
    if (!['manager', 'admin', 'founder'].includes(callerRole)) return;

    import('@/lib/actions/leads').then(({ listAgentsForDomain }) => {
      listAgentsForDomain(callerDomain).then((result) => {
        if (result.data) {
          setAssignableUsers(
            result.data.map((a: { id: string; full_name: string }) => ({
              id:         a.id,
              full_name:  a.full_name,
              avatar_url: null,
              role:       'agent' as const,
              domain:     callerDomain,
            })),
          );
        }
      });
    });
  }, [callerRole, callerDomain]);

  // ── Quick-add confirm (Problem 7 fix preserved exactly) ───────────────────
  const handleQuickAddSave = useCallback(() => {
    if (isPending) return;
    if (!quickTitle.trim()) {
      quickTitleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createPersonalTaskAction({
        title:       quickTitle.trim(),
        priority:    'normal',      // always normal — user sets priority in TaskModal
        due_at:      quickDueAt ? quickDueAt.toISOString() : null,
        assigned_to: quickAssignee?.id ?? undefined,
      });
      if (result.error) {
        toast.danger('Failed to create task', { message: result.error });
        return;
      }
      toast.success('Task created');
      setShowQuickAdd(false);
      setQuickTitle('');
      setQuickDueAt(null);
      setQuickAssignee(null);

      // Prepend synthetic task — avoids a full 500-row re-fetch
      const now = new Date().toISOString();
      const syntheticTask: Task = {
        id:            result.data!.taskId,
        title:         quickTitle.trim(),
        description:   null,
        priority:      'normal',
        status:        'to_do',
        due_at:        quickDueAt ? quickDueAt.toISOString() : null,
        assigned_to:   result.data!.assignedTo,
        created_by:    result.data!.createdBy,
        group_id:      null,
        task_category: 'personal',
        task_type:     'other',
        module:        'gia',
        completed_at:  null,
        attachments:   [],
        tags:          [],
        created_at:    now,
        updated_at:    now,
      };
      setActiveTasks((prev) => [syntheticTask, ...prev]);
    });
  }, [isPending, quickTitle, quickDueAt, quickAssignee, startTransition]);

  function handleQuickAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleQuickAddSave();
    if (e.key === 'Escape') {
      setShowQuickAdd(false);
      setQuickTitle('');
    }
  }

  // ── Row click → fetch remarks then open modal ─────────────────────────────
  function handleRowClick(task: Task) {
    setSelectedTask(task);
    setSelectedTaskRemarks(null); // show skeleton until remarks arrive
    getTaskRemarksAction(task.id).then((r) => {
      setSelectedTaskRemarks(r.data ?? []);
    }).catch(() => {
      setSelectedTaskRemarks([]);
    });
    setTaskModalOpen(true);
  }

  const handlePersonalTaskUpdated = useCallback((update: SubTaskModalTaskUpdate) => {
    const merge = (t: Task) => (t.id === update.id ? { ...t, ...update } : t);
    setActiveTasks((prev) => prev.map(merge));
    setCompletedTasks((prev) => prev.map(merge));
    setSelectedTask((prev) => (prev?.id === update.id ? { ...prev, ...update } : prev));
  }, []);

  // ── Group active tasks by priority (client-side filters from filter bar) ──
  const tasksByPriority: Record<TaskPriority, Task[]> = {
    urgent: [],
    high:   [],
    normal: [],
  };

  function taskPassesFilters(task: Task, effectiveStatus: TaskStatus): boolean {
    if (filters.search.trim()) {
      const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
      if (!haystack.includes(filters.search.trim().toLowerCase())) return false;
    }
    if (filters.tags.length > 0 && !filters.tags.every((t) => task.tags.includes(t))) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(effectiveStatus)) {
      return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
      return false;
    }
    return true;
  }

  for (const task of activeTasks) {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    if (effectiveStatus === 'completed') continue;
    if (!taskPassesFilters(task, effectiveStatus)) continue;
    tasksByPriority[task.priority]?.push(task);
  }

  const filteredCompleted = completedTasks.filter((task) => {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    return taskPassesFilters(task, effectiveStatus);
  });

  const visibleCount = countVisiblePersonalTasks(
    activeTasks,
    completedTasks,
    optimisticStatus,
    filters,
  );

  useEffect(() => {
    onFilteredCountChange?.(visibleCount);
  }, [visibleCount, onFilteredCountChange]);

  const totalActive = activeTasks.filter(
    (t) => (optimisticStatus[t.id] ?? t.status) !== 'completed',
  ).length;

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.tags.length > 0 ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0;

  // ─── Section render helper ────────────────────────────────────────────────

  function renderSection(
    key: string,
    label: string,
    tasks: Task[],
    cfg: typeof PRIORITY_CONFIG[TaskPriority],
    isCompleted: boolean,
    defaultClosed = false,
  ) {
    if (tasks.length === 0) return null;

    const open = isSectionOpen(key);

    return (
      <div
        key={key}
        style={{
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          overflow:     'hidden',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        {/* Section header */}
        <button
          type="button"
          onClick={() => toggleSection(key)}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-2)',
            width:          '100%',
            padding:        'var(--space-2) var(--space-4)',
            background:     cfg.headerBg,
            border:         'none',
            borderBottom:   open ? '1px solid var(--theme-paper-border)' : 'none',
            cursor:         'pointer',
            transition:     'background var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.filter = 'brightness(0.97)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.filter = '';
          }}
        >
          <span
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color:         cfg.headerColor,
              flex:          1,
              textAlign:     'left',
            }}
          >
            {label}
          </span>
          {/* Task count pill */}
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              padding:      'var(--space-px) var(--space-2)',
              borderRadius: 'var(--radius-full)',
              background:   isCompleted ? 'var(--color-success-light)' : `color-mix(in srgb, ${cfg.dotColor} 14%, transparent)`,
              color:        isCompleted ? 'var(--color-success-text)' : cfg.headerColor,
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-2xs)',
              fontWeight:   'var(--weight-semibold)',
            }}
          >
            {tasks.length}
          </span>
          {/* Chevron */}
          <ChevronDown
            style={{
              width:      14,
              height:     14,
              strokeWidth: 1.5,
              color:      cfg.headerColor,
              transform:  open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform var(--duration-base) var(--ease-out-expo)',
              flexShrink: 0,
            }}
          />
        </button>

        {/* Rows */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key={`${key}-rows`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              style={{ overflow: 'hidden' }}
            >
              {tasks.map((task, idx) => {
                const effectiveStatus = optimisticStatus[task.id] ?? task.status;
                const isComplete      = isCompleted || effectiveStatus === 'completed';
                const canComplete     = canToggleTaskComplete(task, caller);
                const dueDateColor    = getDueDateColor(task.due_at, effectiveStatus);
                const overdue         = isOverdue(task.due_at, effectiveStatus);

                return (
                  <div
                    key={task.id}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          'var(--space-3)',
                      padding:      'var(--space-3) var(--space-4)',
                      borderBottom: idx < tasks.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                      background:   'var(--theme-paper)',
                      borderLeft:   `3px solid ${isComplete ? 'var(--color-success)' : cfg.borderColor}`,
                    }}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                  >
                    <TaskCompletionCircle
                      checked={isComplete}
                      disabled={!canComplete}
                      highlighted={hoveredTaskId === task.id}
                      onToggle={(e) => handleToggle(e, task)}
                    />

                    {/* Title + assignee avatar (if assigned to someone else) */}
                    <div
                      style={{
                        flex:     1,
                        display:  'flex',
                        alignItems: 'center',
                        gap:      'var(--space-2)',
                        minWidth: 0,
                        cursor:   'pointer',
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowClick(task)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(task); }}
                    >
                      <span
                        style={{
                          fontFamily:     'var(--font-sans)',
                          fontSize:       'var(--text-sm)',
                          fontWeight:     'var(--weight-medium)',
                          color:          isComplete
                            ? 'var(--theme-text-tertiary)'
                            : 'var(--theme-text-primary)',
                          textDecoration: isComplete ? 'line-through' : 'none',
                          overflow:       'hidden',
                          textOverflow:   'ellipsis',
                          whiteSpace:     'nowrap',
                          flex:           1,
                          minWidth:       0,
                        }}
                      >
                        {task.title}
                      </span>
                      {/* Assignee avatar — only when task is assigned to someone else */}
                      {task.assigned_to && task.assigned_to !== currentUserId && (
                        <div
                          title="Assigned to someone else"
                          style={{
                            width:          'var(--space-5)',
                            height:         'var(--space-5)',
                            borderRadius:   'var(--radius-xs)',
                            background:     'var(--theme-accent-surface)',
                            border:         '1px solid var(--theme-paper-border)',
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            flexShrink:     0,
                          }}
                        >
                          <User
                            style={{
                              width:       10,
                              height:      10,
                              strokeWidth: 1.5,
                              color:       'var(--theme-accent)',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Due date chip */}
                    {task.due_at && (
                      <span
                        style={{
                          fontFamily:  'var(--font-mono)',
                          fontSize:    'var(--text-xs)',
                          color:       dueDateColor,
                          fontWeight:  overdue ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                          flexShrink:  0,
                          whiteSpace:  'nowrap',
                        }}
                      >
                        {overdue ? 'Overdue' : formatRelativeTime(task.due_at)}
                      </span>
                    )}

                    {/* Arrow → open TaskModal */}
                    <button
                      type="button"
                      onClick={() => handleRowClick(task)}
                      aria-label="Open task details"
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          'var(--space-6)',
                        height:         'var(--space-6)',
                        borderRadius:   'var(--radius-xs)',
                        border:         '1px solid var(--theme-paper-border)',
                        background:     'transparent',
                        color:          'var(--theme-text-tertiary)',
                        cursor:         'pointer',
                        flexShrink:     0,
                        transition:     'var(--transition-hover)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-accent)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-paper-border)';
                      }}
                    >
                      <ArrowRight style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                    </button>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasAnyActive = totalActive > 0;
  const hasVisibleInSections = ACTIVE_PRIORITIES.some((p) => tasksByPriority[p].length > 0);
  const showMainEmpty = !hasVisibleInSections && (totalActive === 0 || hasActiveFilters);

  return (
    // Key on sectionRenderKey forces header chevron re-render without collapsing body
    <div key={`tab-${sectionRenderKey}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

      {/* Quick-add row */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div
            key="quick-add"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          'var(--space-3)',
                padding:      'var(--space-3) var(--space-4)',
                background:   'var(--theme-accent-surface)',
                border:       '1px solid var(--theme-paper-border)',
                borderLeft:   '3px solid var(--theme-accent)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {/* Title input */}
              <input
                ref={quickTitleRef}
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={handleQuickAddKeyDown}
                placeholder="Task title…"
                disabled={isPending}
                style={{
                  flex:       1,
                  border:     'none',
                  outline:    'none',
                  background: 'transparent',
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-primary)',
                  caretColor: 'var(--theme-accent)',
                  opacity:    isPending ? 0.6 : 1,
                  cursor:     isPending ? 'not-allowed' : 'text',
                  transition: 'opacity var(--duration-fast) var(--ease-in-out)',
                }}
              />

              {/* Due date */}
              <DatePicker
                value={quickDueAt}
                onChange={setQuickDueAt}
                placeholder="Due date…"
                disabled={isPending}
                aria-label="Due date"
                style={{ flexShrink: 0 }}
              />

              {/* Assignee picker button (manager+ only) */}
              {['manager', 'admin', 'founder'].includes(callerRole) && (
                <button
                  type="button"
                  onClick={() => setShowAssigneePicker(true)}
                  aria-label="Pick assignee"
                  title={quickAssignee?.full_name ?? `${currentUserName} (you)`}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    width:          'var(--space-7)',
                    height:         'var(--space-7)',
                    borderRadius:   'var(--radius-sm)',
                    border:         '1px solid var(--theme-paper-border)',
                    background:     quickAssignee ? 'var(--theme-accent-surface)' : 'transparent',
                    color:          quickAssignee ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                    cursor:         'pointer',
                    transition:     'var(--transition-hover)',
                    flexShrink:     0,
                  }}
                >
                  <Avatar
                    name={(quickAssignee ?? { full_name: currentUserName }).full_name}
                    size="xs"
                    style={{ width: 18, height: 18, minWidth: 18 }}
                  />
                </button>
              )}

              {/* Save */}
              <button
                type="button"
                onClick={handleQuickAddSave}
                disabled={isPending || !quickTitle.trim()}
                style={{
                  padding:      'var(--space-1) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border:       'none',
                  background:   quickTitle.trim() ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
                  color:        quickTitle.trim() ? 'var(--theme-accent-fg)' : 'var(--theme-text-tertiary)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   'var(--weight-semibold)',
                  cursor:       isPending || !quickTitle.trim() ? 'not-allowed' : 'pointer',
                  opacity:      isPending ? 0.6 : 1,
                  transition:   'var(--transition-interactive)',
                  flexShrink:   0,
                }}
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>

              {/* Cancel */}
              <button
                type="button"
                onClick={() => { setShowQuickAdd(false); setQuickTitle(''); }}
                aria-label="Cancel"
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  width:          'var(--space-6)',
                  height:         'var(--space-6)',
                  borderRadius:   'var(--radius-sm)',
                  border:         'none',
                  background:     'transparent',
                  color:          'var(--theme-text-tertiary)',
                  cursor:         'pointer',
                  flexShrink:     0,
                }}
              >
                <X style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard hint */}
      {showQuickAdd && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-xs)',
            color:      'var(--theme-text-tertiary)',
            margin:     0,
          }}
        >
          <UserCircle style={{ display: 'inline', width: 12, height: 12, strokeWidth: 1.5, marginRight: 4 }} />
          Press Enter to save · Esc to cancel
        </p>
      )}

      {/* Priority sections — only rendered when tasks exist */}
      {ACTIVE_PRIORITIES.map((priority) =>
        renderSection(
          priority,
          PRIORITY_CONFIG[priority].label,
          tasksByPriority[priority],
          PRIORITY_CONFIG[priority],
          false,
        ),
      )}

      {/* Empty state — no visible tasks (cleared roster or filters hide everything) */}
      {showMainEmpty && (
        <div
          style={{
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-md)',
            padding:      'var(--space-16) var(--space-8)',
            textAlign:    'center',
            boxShadow:    'var(--shadow-1)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle:  'italic',
              fontSize:   'var(--text-lg)',
              color:      'var(--theme-text-tertiary)',
              margin:     0,
            }}
          >
            {hasActiveFilters ? 'Nothing matches your filters.' : 'All clear for now.'}
          </p>
          <p
            style={{
              fontFamily:   'var(--font-sans)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-tertiary)',
              marginTop:    'var(--space-2)',
              marginBottom: 0,
            }}
          >
            {hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Create your first task with the button above.'}
          </p>
        </div>
      )}

      {/* Completed section — collapsed by default; tasks load lazily on first expand */}
      <div
        style={{
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          overflow:     'hidden',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        {/* Section header — always rendered so the accordion is always accessible */}
        <button
          type="button"
          onClick={() => toggleSection('completed')}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-2)',
            width:          '100%',
            padding:        'var(--space-2) var(--space-4)',
            background:     isSectionOpen('completed') ? 'var(--color-success-light)' : 'var(--theme-paper-subtle)',
            border:         'none',
            borderBottom:   isSectionOpen('completed') ? '1px solid var(--theme-paper-border)' : 'none',
            cursor:         'pointer',
            transition:     'background var(--duration-fast) var(--ease-in-out)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(0.97)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ''; }}
        >
          <span
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color:         isSectionOpen('completed') ? 'var(--color-success-text)' : 'var(--theme-text-secondary)',
              flex:          1,
              textAlign:     'left',
            }}
          >
            COMPLETED
          </span>
          {/* Count pill — shows actual count when loaded, placeholder when not yet */}
          {(hasActiveFilters ? filteredCompleted.length : completedTasks.length) > 0 && (
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      'var(--space-px) var(--space-2)',
                borderRadius: 'var(--radius-full)',
                background:   'var(--color-success-light)',
                color:        'var(--color-success-text)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-2xs)',
                fontWeight:   'var(--weight-semibold)',
              }}
            >
              {hasActiveFilters ? filteredCompleted.length : completedTasks.length}
            </span>
          )}
          <ChevronDown
            style={{
              width:      14,
              height:     14,
              strokeWidth: 1.5,
              color:      isSectionOpen('completed') ? 'var(--color-success-text)' : 'var(--theme-text-secondary)',
              transform:  isSectionOpen('completed') ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform var(--duration-base) var(--ease-out-expo)',
              flexShrink: 0,
            }}
          />
        </button>

        {/* Body — only shown when expanded */}
        {isSectionOpen('completed') && (
          isLoadingCompleted ? (
            /* Loading state — shown while completed tasks fetch resolves */
            <div
              style={{
                padding:    'var(--space-6)',
                textAlign:  'center',
                background: 'var(--theme-paper)',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontStyle:  'italic',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-tertiary)',
                  margin:     0,
                }}
              >
                Loading completed tasks…
              </p>
            </div>
          ) : filteredCompleted.length > 0 ? (
            /* Completed task rows rendered via existing renderSection helper */
            <div>
              {filteredCompleted.map((task, idx) => {
                const effectiveStatus = optimisticStatus[task.id] ?? task.status;
                const isComplete      = true;
                const canComplete     = canToggleTaskComplete(task, caller);
                const dueDateColor    = getDueDateColor(task.due_at, effectiveStatus);
                const overdue         = false; // completed tasks are never overdue

                return (
                  <div
                    key={task.id}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          'var(--space-3)',
                      padding:      'var(--space-3) var(--space-4)',
                      borderBottom: idx < filteredCompleted.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                      background:   'var(--theme-paper)',
                      borderLeft:   '3px solid var(--color-success)',
                    }}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                  >
                    <TaskCompletionCircle
                      checked
                      disabled={!canComplete}
                      highlighted={hoveredTaskId === task.id}
                      onToggle={(e) => handleToggle(e, task)}
                    />

                    {/* Title */}
                    <div
                      style={{
                        flex:       1,
                        display:    'flex',
                        alignItems: 'center',
                        gap:        'var(--space-2)',
                        minWidth:   0,
                        cursor:     'pointer',
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowClick(task)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(task); }}
                    >
                      <span
                        style={{
                          fontFamily:     'var(--font-sans)',
                          fontSize:       'var(--text-sm)',
                          fontWeight:     'var(--weight-medium)',
                          color:          'var(--theme-text-tertiary)',
                          textDecoration: 'line-through',
                          overflow:       'hidden',
                          textOverflow:   'ellipsis',
                          whiteSpace:     'nowrap',
                          flex:           1,
                          minWidth:       0,
                        }}
                      >
                        {task.title}
                      </span>
                    </div>

                    {/* Due date chip */}
                    {task.due_at && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize:   'var(--text-xs)',
                          color:      dueDateColor,
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {overdue ? 'Overdue' : formatRelativeTime(task.due_at)}
                      </span>
                    )}

                    {/* Arrow */}
                    <button
                      type="button"
                      onClick={() => handleRowClick(task)}
                      aria-label="Open task details"
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          'var(--space-6)',
                        height:         'var(--space-6)',
                        borderRadius:   'var(--radius-xs)',
                        border:         '1px solid var(--theme-paper-border)',
                        background:     'transparent',
                        color:          'var(--theme-text-tertiary)',
                        cursor:         'pointer',
                        flexShrink:     0,
                        transition:     'var(--transition-hover)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-accent)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-paper-border)';
                      }}
                    >
                      <ArrowRight style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : !hasLoadedCompleted.current ? (
            /* Not yet triggered — accordion just opened but fetch hasn't fired yet (edge case) */
            null
          ) : (
            /* Empty — no completed tasks */
            <div
              style={{
                padding:    'var(--space-6)',
                textAlign:  'center',
                background: 'var(--theme-paper)',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontStyle:  'italic',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-tertiary)',
                  margin:     0,
                }}
              >
                Nothing completed yet.
              </p>
            </div>
          )
        )}
      </div>

      {/* Load more — active tasks pagination */}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoadingMore}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-2)',
            margin:       'var(--space-4) auto 0',
            padding:      'var(--space-2) var(--space-4)',
            background:   'transparent',
            border:       '1px solid var(--theme-paper-border)',
            borderRadius: 'var(--radius-sm)',
            color:        'var(--theme-text-secondary)',
            fontSize:     'var(--text-sm)',
            fontWeight:   'var(--weight-medium)',
            cursor:       isLoadingMore ? 'not-allowed' : 'pointer',
            opacity:      isLoadingMore ? 0.5 : 1,
            transition:   'opacity 150ms, border-color 150ms',
          }}
        >
          {isLoadingMore ? <Spinner size="sm" /> : null}
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {/* Create Personal Task Modal */}
      <CreatePersonalTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(task) => {
          // Prepend to the correct priority section in local state — no refetch needed.
          setActiveTasks((prev) => [task, ...prev]);
          setCreateModalOpen(false);
          if (task.tags.length > 0) {
            onTagsMayHaveChanged?.();
          }
        }}
      />

      {/* Task Modal */}
      <AnimatePresence>
        {selectedTask && taskModalOpen && selectedTaskRemarks !== null && (
          <SubTaskModal
            open={taskModalOpen}
            onClose={() => { setTaskModalOpen(false); setSelectedTask(null); setSelectedTaskRemarks(null); }}
            task={selectedTask}
            assignee={resolvePersonalTaskAssignee(
              selectedTask,
              { id: currentUserId, full_name: currentUserName },
              assignableUsers,
            )}
            initialRemarks={selectedTaskRemarks}
            callerProfile={{ id: currentUserId, role: callerRole, domain: callerDomain }}
            currentUserName={currentUserName}
            onTaskUpdated={handlePersonalTaskUpdated}
          />
        )}
      </AnimatePresence>

      {/* Assignee Picker — portaled to document.body to avoid z-index clipping */}
      {typeof window !== 'undefined' &&
        createPortal(
          <AssigneePickerModal
            open={showAssigneePicker}
            onClose={() => setShowAssigneePicker(false)}
            onConfirm={(_userId, user) => {
              setQuickAssignee(user);
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
