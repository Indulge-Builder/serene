'use client';

/**
 * PersonalTasksTab — personal task list with filter bar, quick-add row, and TaskModal.
 *
 * Pre-mortem addressed:
 * - AssigneePickerModal portals to document.body — avoids z-index clipping inside scroll.
 * - Quick-add row is inline at the top of the list — no separate page or full modal.
 * - Client-side filters only — no server round-trips on filter change.
 * - "Load more" cursor pagination via loadMoreAction — no unbounded SELECT.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  CalendarDays,
  ChevronDown,
  UserCircle,
  X,
  CheckCircle2,
  Clock,
  PlayCircle,
  RefreshCw,
  AlertCircle,
  XCircle,
  Loader,
  User,
} from 'lucide-react';
import { createPersonalTaskAction, getPersonalTasksAction } from '@/lib/actions/tasks';
import { formatRelativeTime, formatDate } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { TaskModal } from '@/components/tasks/TaskModal';
import { AssigneePickerModal, type AssignableUser } from '@/components/tasks/AssigneePickerModal';
import type { PersonalTasksResult, PersonalTaskCursor } from '@/lib/services/tasks-service';
import type { Task, TaskStatus, TaskPriority, UserRole, AppDomain } from '@/lib/types/database';
import { TASK_STATUS_LABELS } from '@/lib/constants/task-types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PersonalTasksTabProps {
  initialResult:   PersonalTasksResult;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
}

// ─── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; borderColor: string; bg: string; text: string }> = {
  urgent: {
    label:       'Urgent',
    borderColor: 'var(--color-danger-text)',
    bg:          'var(--color-danger)',
    text:        'var(--color-danger-text)',
  },
  high: {
    label:       'High',
    borderColor: 'var(--color-warning-text)',
    bg:          'var(--color-warning)',
    text:        'var(--color-warning-text)',
  },
  normal: {
    label:       'Normal',
    borderColor: 'var(--theme-paper-border)',
    bg:          'var(--theme-paper-subtle)',
    text:        'var(--theme-text-secondary)',
  },
};

const ALL_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal'];

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { bg: string; text: string }> = {
  to_do:       { bg: 'var(--theme-paper-border)',    text: 'var(--theme-text-secondary)' },
  in_progress: { bg: 'var(--theme-accent)',           text: 'var(--theme-accent-fg)' },
  in_review:   { bg: 'var(--color-info)',             text: 'var(--color-info-text)' },
  completed:   { bg: 'var(--color-success)',          text: 'var(--color-success-text)' },
  error:       { bg: 'var(--color-danger)',           text: 'var(--color-danger-text)' },
  cancelled:   { bg: 'var(--theme-text-tertiary)',    text: 'var(--theme-text-inverse)' },
};

const ALL_STATUSES: TaskStatus[] = ['to_do', 'in_progress', 'in_review', 'completed', 'error', 'cancelled'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 13 }: { status: TaskStatus; size?: number }) {
  const style = { width: size, height: size, strokeWidth: 1.5, flexShrink: 0 as const };
  switch (status) {
    case 'to_do':       return <Clock        style={style} />;
    case 'in_progress': return <PlayCircle   style={style} />;
    case 'in_review':   return <RefreshCw    style={style} />;
    case 'completed':   return <CheckCircle2 style={style} />;
    case 'error':       return <AlertCircle  style={style} />;
    case 'cancelled':   return <XCircle      style={style} />;
    default:            return <Loader       style={style} />;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PersonalTasksTab({
  initialResult,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
}: PersonalTasksTabProps) {
  const [tasks,        setTasks]        = useState<Task[]>(initialResult.tasks);
  const [hasMore,      setHasMore]      = useState(initialResult.hasMore);
  const [cursor,       setCursor]       = useState<PersonalTaskCursor | null>(initialResult.nextCursor);
  // Cursor stack for Previous-page navigation: each entry is the cursor that
  // was passed to fetch the current page, so popping it lets us re-fetch it.
  const [cursorStack,  setCursorStack]  = useState<(PersonalTaskCursor | null)[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);

  // ── Filters (client-side only) ───────────────────────────────────────────
  const [filterStatuses,   setFilterStatuses]   = useState<TaskStatus[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<TaskPriority[]>([]);
  const [filterDueFrom,    setFilterDueFrom]    = useState('');
  const [filterDueTo,      setFilterDueTo]      = useState('');

  // ── Quick-add row state ──────────────────────────────────────────────────
  const [showQuickAdd,      setShowQuickAdd]      = useState(false);
  const [quickTitle,        setQuickTitle]        = useState('');
  const [quickPriority,     setQuickPriority]     = useState<TaskPriority>('normal');
  const [quickDueAt,        setQuickDueAt]        = useState('');
  const [quickAssignee,     setQuickAssignee]     = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assignableUsers,   setAssignableUsers]   = useState<AssignableUser[]>([]);
  const quickTitleRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();

  // ── Task modal state ──────────────────────────────────────────────────────
  const [selectedTask,         setSelectedTask]         = useState<Task | null>(null);
  const [selectedTaskMessages, setSelectedTaskMessages] = useState<[]>([]);
  const [taskModalOpen,        setTaskModalOpen]        = useState(false);

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

  // ── Filtered tasks (client-side) ──────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatuses.length > 0 && !filterStatuses.includes(t.status)) return false;
      if (filterPriorities.length > 0 && !filterPriorities.includes(t.priority)) return false;
      if (filterDueFrom && t.due_at && t.due_at < filterDueFrom) return false;
      if (filterDueTo && t.due_at && t.due_at > filterDueTo + 'T23:59:59.999Z') return false;
      return true;
    });
  }, [tasks, filterStatuses, filterPriorities, filterDueFrom, filterDueTo]);

  const hasActiveFilters =
    filterStatuses.length > 0 ||
    filterPriorities.length > 0 ||
    !!filterDueFrom ||
    !!filterDueTo;

  // ── Reset to page 1 when filters change while beyond page 1 ─────────────
  // Client-side filters only search the current page's 50 rows; resetting
  // ensures the filter applies across the full dataset from the first page.
  useEffect(() => {
    if (cursorStack.length === 0) return; // already on page 1, no-op
    let cancelled = false;
    setIsLoading(true);
    getPersonalTasksAction().then((result) => {
      if (cancelled) return;
      if (result.data) {
        setCursorStack([]);
        setTasks(result.data.tasks);
        setHasMore(result.data.hasMore);
        setCursor(result.data.nextCursor);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatuses, filterPriorities, filterDueFrom, filterDueTo]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function toggleStatus(s: TaskStatus) {
    setFilterStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function togglePriority(p: TaskPriority) {
    setFilterPriorities((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function clearFilters() {
    setFilterStatuses([]);
    setFilterPriorities([]);
    setFilterDueFrom('');
    setFilterDueTo('');
  }

  // ── Page navigation (replace, never append — P-03: DOM ≤ 50 rows) ────────

  async function handleNextPage() {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const result = await getPersonalTasksAction({ cursor: cursor ?? undefined });
      if (result.error || !result.data) throw new Error(result.error ?? 'Unknown error');
      // Push the cursor that produced the *current* page so Previous can rewind.
      setCursorStack((prev) => [...prev, cursor]);
      setTasks(result.data.tasks);
      setHasMore(result.data.hasMore);
      setCursor(result.data.nextCursor);
    } catch {
      toast.danger('Failed to load next page');
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePrevPage() {
    if (isLoading || cursorStack.length === 0) return;
    setIsLoading(true);
    try {
      const stack      = [...cursorStack];
      const prevCursor = stack.pop() ?? null;
      const result     = await getPersonalTasksAction({ cursor: prevCursor ?? undefined });
      if (result.error || !result.data) throw new Error(result.error ?? 'Unknown error');
      setCursorStack(stack);
      setTasks(result.data.tasks);
      setHasMore(result.data.hasMore);
      setCursor(result.data.nextCursor);
    } catch {
      toast.danger('Failed to load previous page');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Quick-add confirm ─────────────────────────────────────────────────────
  const handleQuickAddSave = useCallback(() => {
    if (isPending) return;
    if (!quickTitle.trim()) {
      quickTitleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createPersonalTaskAction({
        title:       quickTitle.trim(),
        priority:    quickPriority,
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
      setQuickPriority('normal');
      setQuickDueAt('');
      setQuickAssignee(null);
    });
  }, [isPending, quickTitle, quickPriority, quickDueAt, quickAssignee, startTransition]);

  function handleQuickAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleQuickAddSave();
    if (e.key === 'Escape') {
      setShowQuickAdd(false);
      setQuickTitle('');
    }
  }

  // ── Row click → open modal ────────────────────────────────────────────────
  function handleRowClick(task: Task) {
    setSelectedTask(task);
    setSelectedTaskMessages([]);
    setTaskModalOpen(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Filter bar + New Task button */}
      <div
        style={{
          display:        'flex',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
          marginBottom:   'var(--space-4)',
          flexWrap:       'wrap',
        }}
      >
        {/* Filters */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status pills */}
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {ALL_STATUSES.map((s) => {
              const active = filterStatuses.includes(s);
              const cfg    = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    gap:            'var(--space-1)',
                    padding:        '4px var(--space-3)',
                    borderRadius:   'var(--radius-full)',
                    border:         active
                      ? `1px solid ${cfg.bg}`
                      : '1px solid var(--theme-paper-border)',
                    background:     active ? cfg.bg : 'transparent',
                    color:          active ? cfg.text : 'var(--theme-text-secondary)',
                    fontFamily:     'var(--font-sans)',
                    fontSize:       'var(--text-xs)',
                    fontWeight:     active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                    cursor:         'pointer',
                    transition:     'all var(--duration-fast) var(--ease-in-out)',
                    whiteSpace:     'nowrap',
                  }}
                >
                  <StatusIcon status={s} size={11} />
                  {TASK_STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>

          {/* Priority pills */}
          <div
            aria-hidden="true"
            style={{ width: '1px', height: '20px', background: 'var(--theme-paper-border)' }}
          />
          {ALL_PRIORITIES.map((p) => {
            const active = filterPriorities.includes(p);
            const cfg    = PRIORITY_CONFIG[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePriority(p)}
                style={{
                  padding:      '4px var(--space-3)',
                  borderRadius: 'var(--radius-full)',
                  border:       active
                    ? `1px solid ${cfg.borderColor}`
                    : '1px solid var(--theme-paper-border)',
                  background:   active ? cfg.bg : 'transparent',
                  color:        active ? cfg.text : 'var(--theme-text-secondary)',
                  fontFamily:   'var(--font-sans)',
                  fontSize:     'var(--text-xs)',
                  fontWeight:   active ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  cursor:       'pointer',
                  transition:   'all var(--duration-fast) var(--ease-in-out)',
                  whiteSpace:   'nowrap',
                }}
              >
                {cfg.label}
              </button>
            );
          })}

          {/* Due date range */}
          <div
            aria-hidden="true"
            style={{ width: '1px', height: '20px', background: 'var(--theme-paper-border)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <CalendarDays style={{ width: 14, height: 14, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)' }} />
            <input
              type="date"
              value={filterDueFrom}
              onChange={(e) => setFilterDueFrom(e.target.value)}
              aria-label="Due from"
              style={{
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper-subtle)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-xs)',
                color:        'var(--theme-text-primary)',
                padding:      '4px var(--space-2)',
                outline:      'none',
                caretColor:   'var(--theme-accent)',
              }}
            />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>—</span>
            <input
              type="date"
              value={filterDueTo}
              onChange={(e) => setFilterDueTo(e.target.value)}
              aria-label="Due to"
              style={{
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'var(--theme-paper-subtle)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-xs)',
                color:        'var(--theme-text-primary)',
                padding:      '4px var(--space-2)',
                outline:      'none',
                caretColor:   'var(--theme-accent)',
              }}
            />
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                display:     'inline-flex',
                alignItems:  'center',
                gap:         'var(--space-1)',
                padding:     '4px var(--space-2)',
                border:      'none',
                background:  'transparent',
                color:       'var(--theme-text-tertiary)',
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-xs)',
                cursor:      'pointer',
                transition:  'color var(--duration-fast) var(--ease-in-out)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-tertiary)'; }}
            >
              <X style={{ width: 12, height: 12, strokeWidth: 1.5 }} />
              Clear
            </button>
          )}
        </div>

        {/* New Task button */}
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            'var(--space-2)',
            padding:        'var(--space-2) var(--space-4)',
            borderRadius:   'var(--radius-md)',
            border:         'none',
            background:     'var(--theme-accent)',
            color:          'var(--theme-accent-fg)',
            fontFamily:     'var(--font-sans)',
            fontSize:       'var(--text-sm)',
            fontWeight:     'var(--weight-semibold)',
            cursor:         'pointer',
            transition:     'opacity var(--duration-fast) var(--ease-in-out)',
            flexShrink:     0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <Plus style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
          New Task
        </button>
      </div>

      {/* Task list container */}
      <div
        style={{
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          overflow:     'hidden',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        {/* Quick-add row */}
        <AnimatePresence>
          {showQuickAdd && (
            <motion.div
              key="quick-add"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          'var(--space-3)',
                  padding:      'var(--space-3) var(--space-4)',
                  background:   'var(--theme-accent-surface)',
                  borderBottom: '1px solid var(--theme-paper-border)',
                  borderLeft:   '3px solid var(--theme-accent)',
                }}
              >
                {/* Priority selector */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <select
                    value={quickPriority}
                    onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
                    aria-label="Priority"
                    style={{
                      appearance:   'none',
                      padding:      '2px var(--space-3) 2px var(--space-2)',
                      borderRadius: 'var(--radius-full)',
                      border:       `1px solid ${PRIORITY_CONFIG[quickPriority].borderColor}`,
                      background:   PRIORITY_CONFIG[quickPriority].bg,
                      color:        PRIORITY_CONFIG[quickPriority].text,
                      fontFamily:   'var(--font-sans)',
                      fontSize:     'var(--text-xs)',
                      fontWeight:   'var(--weight-semibold)',
                      cursor:       'pointer',
                      outline:      'none',
                    }}
                  >
                    {ALL_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                  <ChevronDown
                    style={{
                      position:     'absolute',
                      right:        4,
                      top:          '50%',
                      transform:    'translateY(-50%)',
                      width:        10,
                      height:       10,
                      strokeWidth:  1.5,
                      pointerEvents: 'none',
                      color:        PRIORITY_CONFIG[quickPriority].text,
                    }}
                  />
                </div>

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
                    flex:         1,
                    border:       'none',
                    outline:      'none',
                    background:   'transparent',
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    color:        'var(--theme-text-primary)',
                    caretColor:   'var(--theme-accent)',
                    opacity:      isPending ? 0.6 : 1,
                    cursor:       isPending ? 'not-allowed' : 'text',
                    transition:   'opacity var(--duration-fast) var(--ease-in-out)',
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
                    padding:      '3px var(--space-2)',
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
                      width:          '28px',
                      height:         '28px',
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
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '9px', fontWeight: 'var(--weight-semibold)', lineHeight: 1 }}>
                        {getInitials(quickAssignee.full_name)}
                      </span>
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
                    width:          '24px',
                    height:         '24px',
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

        {/* Task rows */}
        {filtered.length === 0 ? (
          <div
            style={{
              padding:   'var(--space-16) var(--space-8)',
              textAlign: 'center',
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
              {hasActiveFilters ? 'Nothing matches these filters.' : 'No tasks.'}
            </p>
            {!hasActiveFilters && (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize:   'var(--text-sm)',
                  color:      'var(--theme-text-tertiary)',
                  marginTop:  'var(--space-2)',
                  marginBottom: 0,
                }}
              >
                Create your first task with the button above.
              </p>
            )}
          </div>
        ) : (
          filtered.map((task, idx) => {
            const priorityCfg = PRIORITY_CONFIG[task.priority];
            const statusCfg   = STATUS_CONFIG[task.status];
            const isOverdue   = task.due_at && task.status !== 'completed' && task.status !== 'cancelled'
              ? new Date(task.due_at) < new Date()
              : false;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.32), ease: [0.16, 1, 0.3, 1] }}
                role="button"
                tabIndex={0}
                onClick={() => handleRowClick(task)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(task); }}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          'var(--space-4)',
                  padding:      'var(--space-3) var(--space-4)',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--theme-paper-border)' : 'none',
                  background:   'var(--theme-paper)',
                  borderLeft:   `3px solid ${priorityCfg.borderColor}`,
                  cursor:       'pointer',
                  transition:   `background var(--duration-fast) var(--ease-in-out)`,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper-subtle)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-paper)'; }}
              >
                {/* Title */}
                <span
                  style={{
                    flex:         1,
                    fontFamily:   'var(--font-sans)',
                    fontSize:     'var(--text-sm)',
                    fontWeight:   'var(--weight-medium)',
                    color:        task.status === 'completed' || task.status === 'cancelled'
                      ? 'var(--theme-text-tertiary)'
                      : 'var(--theme-text-primary)',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                    minWidth:     0,
                  }}
                >
                  {task.title}
                </span>

                {/* Due date */}
                {task.due_at && (
                  <span
                    style={{
                      fontFamily:  'var(--font-mono)',
                      fontSize:    'var(--text-xs)',
                      color:       isOverdue ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)',
                      flexShrink:  0,
                      whiteSpace:  'nowrap',
                    }}
                  >
                    {formatRelativeTime(task.due_at)}
                  </span>
                )}

                {/* Status pill */}
                <span
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          '4px',
                    padding:      '3px var(--space-2)',
                    borderRadius: 'var(--radius-full)',
                    background:   statusCfg.bg,
                    color:        statusCfg.text,
                    fontFamily:   'var(--font-sans)',
                    fontSize:     '11px',
                    fontWeight:   'var(--weight-semibold)',
                    flexShrink:   0,
                    whiteSpace:   'nowrap',
                  }}
                >
                  <StatusIcon status={task.status} size={11} />
                  {TASK_STATUS_LABELS[task.status]}
                </span>
              </motion.div>
            );
          })
        )}

        {/* Pagination — Previous / Next (replaces; DOM stays ≤ 50 rows, P-03) */}
        {(cursorStack.length > 0 || hasMore) && filtered.length > 0 && (
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        'var(--space-3) var(--space-4)',
              borderTop:      '1px solid var(--theme-paper-border)',
              background:     'var(--theme-paper-subtle)',
            }}
          >
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={isLoading || cursorStack.length === 0}
              style={{
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-xs)',
                color:       (isLoading || cursorStack.length === 0)
                  ? 'var(--theme-text-tertiary)'
                  : 'var(--theme-accent)',
                background:  'transparent',
                border:      'none',
                cursor:      (isLoading || cursorStack.length === 0) ? 'default' : 'pointer',
                opacity:     cursorStack.length === 0 ? 0.4 : 1,
                transition:  'opacity var(--duration-fast) var(--ease-in-out)',
              }}
            >
              ← Previous
            </button>

            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              {isLoading ? 'Loading…' : `Page ${cursorStack.length + 1}`}
            </span>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={isLoading || !hasMore}
              style={{
                fontFamily:  'var(--font-sans)',
                fontSize:    'var(--text-xs)',
                color:       (isLoading || !hasMore)
                  ? 'var(--theme-text-tertiary)'
                  : 'var(--theme-accent)',
                background:  'transparent',
                border:      'none',
                cursor:      (isLoading || !hasMore) ? 'default' : 'pointer',
                opacity:     !hasMore ? 0.4 : 1,
                transition:  'opacity var(--duration-fast) var(--ease-in-out)',
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Task Modal */}
      {selectedTask && (
        <TaskModal
          open={taskModalOpen}
          onClose={() => { setTaskModalOpen(false); setSelectedTask(null); }}
          task={selectedTask}
          assignee={null}
          initialMessages={selectedTaskMessages}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      )}

      {/* Assignee Picker — portaled to document.body to avoid z-index clipping */}
      {typeof window !== 'undefined' &&
        createPortal(
          <AssigneePickerModal
            open={showAssigneePicker}
            onClose={() => setShowAssigneePicker(false)}
            onConfirm={(userId, user) => {
              setQuickAssignee(user);
              setShowAssigneePicker(false);
            }}
            users={assignableUsers}
            initialDomain={callerDomain}
          />,
          document.body,
        )}

      {/* Assignee picker icon for sidebar hint row */}
      {showQuickAdd && (
        <p
          style={{
            fontFamily:  'var(--font-sans)',
            fontSize:    'var(--text-xs)',
            color:       'var(--theme-text-tertiary)',
            marginTop:   'var(--space-2)',
          }}
        >
          <UserCircle style={{ display: 'inline', width: 12, height: 12, strokeWidth: 1.5, marginRight: 4 }} />
          Press Enter to save · Esc to cancel
        </p>
      )}
    </div>
  );
}
