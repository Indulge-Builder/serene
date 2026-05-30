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
 * - Filter bar removed entirely.
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
  CheckCircle2,
  ArrowRight,
  User,
  Circle,
} from 'lucide-react';
import {
  createPersonalTaskAction,
  getPersonalTasksAction,
  getPersonalTaskTagsAction,
  getTaskRemarksAction,
  updateTaskStatusAction,
} from '@/lib/actions/tasks';
import { formatRelativeTime } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { SubTaskModal } from '@/components/tasks/SubTaskModal';
import { AssigneePickerModal, type AssignableUser } from '@/components/tasks/AssigneePickerModal';
import { CreatePersonalTaskModal } from '@/components/tasks/CreatePersonalTaskModal';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import type { PersonalTasksResult, TaskRemarkWithAuthor, PersonalTaskCursor } from '@/lib/services/tasks-service';
import type { Task, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PersonalTasksTabProps {
  initialResult:   PersonalTasksResult;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
  /** Increments each time the parent header button is clicked — triggers modal open */
  createTrigger?:  number;
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
}: PersonalTasksTabProps) {
  // ── Task data ─────────────────────────────────────────────────────────────
  const [activeTasks,    setActiveTasks]    = useState<Task[]>(initialResult.tasks);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);

  // ── Optimistic status map — keyed by taskId ────────────────────────────────
  // Tracks in-flight optimistic completions/reopens without causing section collapse.
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, TaskStatus>>({});

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

  // ── Tag filter ────────────────────────────────────────────────────────────
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags,  setSelectedTags]  = useState<string[]>([]);

  // ── Create task modal ─────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Open modal when parent header button fires (createTrigger increments)
  useEffect(() => {
    if (createTrigger > 0) setCreateModalOpen(true);
  }, [createTrigger]);

  // ── Quick-add row state ──────────────────────────────────────────────────
  const [showQuickAdd,       setShowQuickAdd]       = useState(false);
  const [quickTitle,         setQuickTitle]         = useState('');
  const [quickDueAt,         setQuickDueAt]         = useState('');
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

  // ── Load tags on mount (not included in SSR initialResult) ─────────────────
  useEffect(() => {
    let cancelled = false;
    getPersonalTaskTagsAction().then((r) => {
      if (!cancelled && r.data) setAvailableTags(r.data);
    }).catch(() => {});
    return () => { cancelled = true; };
  // Only run on mount — no deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Optimistic complete / reopen ──────────────────────────────────────────

  function handleCircleClick(e: React.MouseEvent, task: Task) {
    e.stopPropagation(); // don't open the modal

    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    const newStatus: TaskStatus = effectiveStatus === 'completed' ? 'to_do' : 'completed';

    // Optimistic update
    setOptimisticStatus((prev) => ({ ...prev, [task.id]: newStatus }));

    startTransition(async () => {
      const result = await updateTaskStatusAction({ taskId: task.id, status: newStatus });
      if (result.error) {
        // Rollback
        setOptimisticStatus((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
        toast.danger("Couldn't update task", { message: result.error });
      }
      // On success, keep optimistic state. The list will be refreshed next
      // time the component mounts (or user triggers a refresh).
    });
  }

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
        due_at:      quickDueAt ? new Date(quickDueAt).toISOString() : null,
        assigned_to: quickAssignee?.id ?? undefined,
      });
      if (result.error) {
        toast.danger('Failed to create task', { message: result.error });
        return;
      }
      toast.success('Task created');
      setShowQuickAdd(false);
      setQuickTitle('');
      setQuickDueAt('');
      setQuickAssignee(null);

      // Prepend synthetic task — avoids a full 500-row re-fetch
      const now = new Date().toISOString();
      const syntheticTask: Task = {
        id:            result.data!.taskId,
        title:         quickTitle.trim(),
        description:   null,
        priority:      'normal',
        status:        'to_do',
        due_at:        quickDueAt ? new Date(quickDueAt).toISOString() : null,
        assigned_to:   quickAssignee?.id ?? '',
        created_by:    '',
        group_id:      null,
        task_category: 'personal',
        task_type:     'general_follow_up',
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

  // ── Group active tasks by priority (with optional tag filter) ────────────
  const tasksByPriority: Record<TaskPriority, Task[]> = {
    urgent: [],
    high:   [],
    normal: [],
  };

  for (const task of activeTasks) {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    if (effectiveStatus === 'completed') continue;
    // Tag filter — task must contain ALL selected tags
    if (selectedTags.length > 0 && !selectedTags.every((t) => task.tags.includes(t))) continue;
    tasksByPriority[task.priority]?.push(task);
  }

  const totalActive = activeTasks.filter(
    (t) => (optimisticStatus[t.id] ?? t.status) !== 'completed',
  ).length;

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
                const isOwn           = task.assigned_to === currentUserId || task.assigned_to === null;
                const canComplete     = isOwn;
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
                      transition:   'background var(--duration-fast) var(--ease-in-out)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper)';
                    }}
                  >
                    {/* Completion circle */}
                    <button
                      type="button"
                      onClick={(e) => handleCircleClick(e, task)}
                      disabled={!canComplete}
                      aria-label={isComplete ? 'Reopen task' : 'Complete task'}
                      style={{
                        width:          'var(--space-6)',
                        height:         'var(--space-6)',
                        borderRadius:   'var(--radius-full)',
                        border:         canComplete
                          ? (isComplete
                              ? 'none'
                              : '1.5px solid var(--theme-paper-border)')
                          : '1.5px dashed var(--theme-paper-border)',
                        background:     isComplete ? 'transparent' : 'transparent',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        cursor:         canComplete ? 'pointer' : 'default',
                        flexShrink:     0,
                        transition:     'border-color var(--duration-fast) var(--ease-in-out)',
                      }}
                      onMouseEnter={(e) => {
                        if (!canComplete || isComplete) return;
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-accent)';
                        (e.currentTarget as HTMLElement).style.background  = 'var(--theme-accent-surface)';
                      }}
                      onMouseLeave={(e) => {
                        if (!canComplete || isComplete) return;
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-paper-border)';
                        (e.currentTarget as HTMLElement).style.background  = 'transparent';
                      }}
                    >
                      {isComplete ? (
                        <CheckCircle2
                          style={{
                            width:       16,
                            height:      16,
                            strokeWidth: 1.5,
                            color:       'var(--theme-accent)',
                          }}
                        />
                      ) : !canComplete ? (
                        <Circle
                          style={{
                            width:       10,
                            height:      10,
                            strokeWidth: 1.5,
                            color:       'var(--theme-paper-border)',
                          }}
                        />
                      ) : null}
                    </button>

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

  return (
    // Key on sectionRenderKey forces header chevron re-render without collapsing body
    <div key={`tab-${sectionRenderKey}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

      {/* Tag filter bar — only rendered when at least one tag exists */}
      {availableTags.length > 0 && (
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-2)',
            flexWrap:   'wrap',
          }}
        >
          <span
            style={{
              fontFamily:    'var(--font-sans)',
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color:         'var(--theme-text-tertiary)',
              flexShrink:    0,
            }}
          >
            Filter by tag
          </span>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setSelectedTags((prev) =>
                    active ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  padding:      '3px var(--space-3)',
                  borderRadius: 'var(--radius-full)',
                  border:       active
                    ? '1.5px solid var(--theme-accent)'
                    : '1px solid var(--theme-paper-border)',
                  background:   active ? 'var(--theme-accent-surface)' : 'transparent',
                  color:        active ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  cursor:       'pointer',
                  transition:   'var(--transition-hover)',
                }}
              >
                {tag}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              style={{
                display:    'inline-flex',
                alignItems: 'center',
                gap:        'var(--space-1)',
                background: 'none',
                border:     'none',
                padding:    0,
                cursor:     'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              <X style={{ width: 10, height: 10, strokeWidth: 2 }} />
              Clear
            </button>
          )}
        </div>
      )}

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
              <input
                type="date"
                value={quickDueAt}
                onChange={(e) => setQuickDueAt(e.target.value)}
                aria-label="Due date"
                style={{
                  border:       '1px solid var(--theme-paper-border)',
                  borderRadius: 'var(--radius-sm)',
                  background:   'var(--theme-paper)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  color:        'var(--theme-text-primary)',
                  padding:      'var(--space-1) var(--space-2)',
                  outline:      'none',
                  caretColor:   'var(--theme-accent)',
                  flexShrink:   0,
                }}
              />

              {/* Assignee picker button (manager+ only) */}
              {['manager', 'admin', 'founder'].includes(callerRole) && (
                <button
                  type="button"
                  onClick={() => setShowAssigneePicker(true)}
                  aria-label="Pick assignee"
                  title={quickAssignee ? quickAssignee.full_name : 'Unassigned'}
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
                  {quickAssignee ? (
                    <Avatar name={quickAssignee.full_name} size="xs" style={{ width: 18, height: 18, minWidth: 18 }} />
                  ) : (
                    <User style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
                  )}
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

      {/* Empty state — only shown when no active tasks and not loading */}
      {!hasAnyActive && (
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
            {selectedTags.length > 0 ? 'Nothing tagged that way.' : 'All clear for now.'}
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
            {selectedTags.length > 0
              ? 'No tasks match the selected tags.'
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
          {completedTasks.length > 0 && (
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
              {completedTasks.length}
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
          ) : completedTasks.length > 0 ? (
            /* Completed task rows rendered via existing renderSection helper */
            <div>
              {completedTasks.map((task, idx) => {
                const effectiveStatus = optimisticStatus[task.id] ?? task.status;
                const isComplete      = true;
                const isOwn           = task.assigned_to === currentUserId || task.assigned_to === null;
                const canComplete     = isOwn;
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
                      borderBottom: idx < completedTasks.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                      background:   'var(--theme-paper)',
                      borderLeft:   '3px solid var(--color-success)',
                      transition:   'background var(--duration-fast) var(--ease-in-out)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper)';
                    }}
                  >
                    {/* Completion circle */}
                    <button
                      type="button"
                      onClick={(e) => handleCircleClick(e, task)}
                      disabled={!canComplete}
                      aria-label="Reopen task"
                      style={{
                        width:          'var(--space-6)',
                        height:         'var(--space-6)',
                        borderRadius:   'var(--radius-full)',
                        border:         'none',
                        background:     'transparent',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        cursor:         canComplete ? 'pointer' : 'default',
                        flexShrink:     0,
                      }}
                    >
                      <CheckCircle2
                        style={{
                          width:       16,
                          height:      16,
                          strokeWidth: 1.5,
                          color:       'var(--theme-accent)',
                        }}
                      />
                    </button>

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
          // Refresh available tags in case the new task introduced new ones
          if (task.tags.length > 0) {
            getPersonalTaskTagsAction().then((r) => {
              if (r.data) setAvailableTags(r.data);
            }).catch(() => {});
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
            initialRemarks={selectedTaskRemarks}
            callerProfile={{ id: currentUserId, role: callerRole, domain: callerDomain }}
            currentUserName={currentUserName}
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
