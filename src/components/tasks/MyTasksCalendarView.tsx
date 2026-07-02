'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  User,
  UserCircle,
  X,
  CalendarDays,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Calendar } from '@/components/ui/Calendar';
import { CollapseReveal } from '@/components/ui/CollapseReveal';
import type { TaskDotMeta } from '@/components/ui/Calendar';
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
import { formatDate } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { AssigneePickerModal } from '@/components/tasks/AssigneePickerModal';
import type { AssignableUser } from '@/lib/types';
import { CreatePersonalTaskModal } from '@/components/tasks/CreatePersonalTaskModal';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import type { PersonalTaskRow, PersonalTasksResult, TaskRemarkWithAuthor } from '@/lib/services/tasks-service';
import type { Task, TaskStatus, UserRole, AppDomain } from '@/lib/types/database';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';
import {
  resolvePersonalTaskAssignee,
  type PersonalTaskFiltersState,
} from '@/lib/utils/task-client-filters';

// Load-on-intent (perf audit G-1): SubTaskModal (1,672 lines) stays out of the
// /tasks route chunk until a task row is first opened (the call site already
// conditional-renders it behind the remarks fetch).
const SubTaskModal = dynamic(
  () => import('@/components/tasks/SubTaskModal').then((m) => m.SubTaskModal),
  { ssr: false },
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MyTasksCalendarViewProps {
  initialResult:          PersonalTasksResult;
  currentUserId:          string;
  currentUserName:        string;
  callerRole:             UserRole;
  callerDomain:           AppDomain;
  initialAgents:          AssignableUser[];
  createTrigger?:         number;
  filters:                PersonalTaskFiltersState;
  onFilteredCountChange?: (count: number) => void;
  onTagsMayHaveChanged?:  () => void;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function localKey(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayKey(): string { return localKey(new Date()); }
function tomorrowKey(): string {
  const t = new Date(); t.setDate(t.getDate() + 1); return localKey(t);
}
function taskLocalKey(dueAt: string): string { return localKey(new Date(dueAt)); }
function isOverdueDate(dueAt: string | null): boolean {
  if (!dueAt) return false; return taskLocalKey(dueAt) < todayKey();
}

function sectionLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  const diffDays = Math.round(
    (d.getTime() - new Date(todayKey() + 'T00:00:00').getTime()) / 86_400_000,
  );
  // Both halves render the SAME instant through IST-pinned formatDate so the
  // weekday can never disagree with the date beside it (pre-2026-07-02 the
  // weekday came from the browser's local TZ while the date was IST).
  const dayName  = formatDate(d, 'EEEE');
  const dayMonth = formatDate(d, 'd MMM');
  if (diffDays < 7) return `${dayName}, ${dayMonth}`;
  return formatDate(d, 'EEE, d MMM yyyy');
}

// A task is "actionable" — something still to do — when its effective status
// is neither completed nor cancelled. This is the single source of truth shared
// by buildTaskDots and groupTasksByDate so a calendar dot can never disagree
// with what clicking that day lists: a dot means at least one actionable task,
// and a day whose tasks are all done/cancelled shows no dot. Effective status
// honours an optimistic toggle so a just-completed task drops its dot at once.
function isTaskActionable(task: Task, optimisticStatus: Record<string, TaskStatus>): boolean {
  const effective = optimisticStatus[task.id] ?? task.status;
  return effective !== 'completed' && effective !== 'cancelled';
}

function buildTaskDots(
  tasks: Task[],
  optimisticStatus: Record<string, TaskStatus>,
): Record<string, TaskDotMeta> {
  const map: Record<string, TaskDotMeta> = {};
  for (const t of tasks) {
    if (!t.due_at) continue;
    if (!isTaskActionable(t, optimisticStatus)) continue;
    // Scope note: dots reflect only the tasks loaded into this view, not the
    // full DB set (pagination blindness) — out of scope for the phantom-dot fix.
    const k = taskLocalKey(t.due_at);
    if (!map[k]) map[k] = { count: 0, hasUrgent: false };
    map[k].count++;
    if (t.priority === 'urgent') map[k].hasUrgent = true;
  }
  return map;
}

// ─── Section grouping ──────────────────────────────────────────────────────────

interface DateSection {
  key:       string;   // 'today' | 'overdue' | 'no-date' | YYYY-MM-DD
  label:     string;
  tasks:     PersonalTaskRow[];
  isToday?:   boolean;
  isOverdue?: boolean;
  isNoDate?:  boolean;
}

function groupTasksByDate(tasks: PersonalTaskRow[], optimisticStatus: Record<string, TaskStatus>): DateSection[] {
  const today    = todayKey();
  const tomorrow = tomorrowKey();

  const buckets: { today: PersonalTaskRow[]; overdue: PersonalTaskRow[]; noDate: PersonalTaskRow[]; future: Record<string, PersonalTaskRow[]> } =
    { today: [], overdue: [], noDate: [], future: {} };

  for (const task of tasks) {
    if (!isTaskActionable(task, optimisticStatus)) continue;
    if (!task.due_at) { buckets.noDate.push(task); continue; }
    const k = taskLocalKey(task.due_at);
    if (k < today)       buckets.overdue.push(task);
    else if (k === today) buckets.today.push(task);
    else {
      if (!buckets.future[k]) buckets.future[k] = [];
      buckets.future[k].push(task);
    }
  }

  const sections: DateSection[] = [];
  sections.push({ key: 'today', label: 'Today', tasks: buckets.today, isToday: true });

  for (const k of Object.keys(buckets.future).sort()) {
    const label = k === tomorrow
      ? `Tomorrow, ${formatDate(new Date(k + 'T00:00:00'), 'd MMM')}`
      : sectionLabel(k);
    sections.push({ key: k, label, tasks: buckets.future[k] });
  }
  if (buckets.overdue.length > 0)
    sections.push({ key: 'overdue', label: 'Overdue', tasks: buckets.overdue, isOverdue: true });
  if (buckets.noDate.length > 0)
    sections.push({ key: 'no-date', label: 'No Due Date', tasks: buckets.noDate, isNoDate: true });

  return sections;
}

function getDueDateColor(dueAt: string | null, status: TaskStatus): string {
  if (!dueAt || status === 'completed' || status === 'cancelled') return 'var(--theme-text-tertiary)';
  const k = taskLocalKey(dueAt); const t = todayKey();
  if (k < t) return 'var(--color-danger-text)';
  if (k === t) return 'var(--color-warning-text)';
  return 'var(--theme-text-tertiary)';
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MyTasksCalendarView({
  initialResult,
  currentUserId,
  currentUserName,
  callerRole,
  callerDomain,
  initialAgents,
  createTrigger = 0,
  filters,
  onFilteredCountChange,
  onTagsMayHaveChanged,
}: MyTasksCalendarViewProps) {
  // ── Task data ─────────────────────────────────────────────────────────────
  const [activeTasks,   setActiveTasks]   = useState<PersonalTaskRow[]>(initialResult.tasks);
  const [hasMore,       setHasMore]       = useState(initialResult.hasMore);
  const [nextCursor,    setNextCursor]    = useState(initialResult.nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // ── Optimistic complete ────────────────────────────────────────────────────
  const { optimisticStatus, handleToggle } = useTaskCompletionToggle();
  const caller = { id: currentUserId, role: callerRole, domain: callerDomain };

  // ── Calendar: null = "all sections" mode, a Date = single-date filter mode ─
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);
  const isAllMode = calendarDate === null;

  // ── Collapsed sections ─────────────────────────────────────────────────────
  // All sections start expanded
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  function toggleCollapse(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ── Task modal ─────────────────────────────────────────────────────────────
  const [selectedTask,        setSelectedTask]        = useState<PersonalTaskRow | null>(null);
  const [selectedTaskRemarks, setSelectedTaskRemarks] = useState<TaskRemarkWithAuthor[] | null>(null);
  const [taskModalOpen,       setTaskModalOpen]       = useState(false);

  // ── Create modal ───────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false);
  useCreateTriggerModal(createTrigger, () => setCreateModalOpen(true));

  // ── Quick-add ──────────────────────────────────────────────────────────────
  const [showQuickAdd,       setShowQuickAdd]       = useState(false);
  const [quickTitle,         setQuickTitle]         = useState('');
  const [quickDueAt,         setQuickDueAt]         = useState<Date | null>(null);
  const [quickAssignee,      setQuickAssignee]      = useState<AssignableUser | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  // Agents are pre-fetched by TasksAsync (SSR) and passed as initialAgents.
  // No mount-time action call needed.
  const assignableUsers: AssignableUser[] = initialAgents;
  const quickTitleRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (showQuickAdd) setTimeout(() => quickTitleRef.current?.focus(), 50);
  }, [showQuickAdd]);

  const handleQuickAddSave = useCallback(() => {
    if (isPending || !quickTitle.trim()) { quickTitleRef.current?.focus(); return; }
    startTransition(async () => {
      const result = await createPersonalTaskAction({
        title:       quickTitle.trim(),
        priority:    'normal',
        due_at:      quickDueAt ? quickDueAt.toISOString() : null,
        assigned_to: quickAssignee?.id ?? undefined,
      });
      if (result.error) { toast.danger('Failed to create task', { message: result.error }); return; }
      toast.success('Task created');
      setShowQuickAdd(false); setQuickTitle(''); setQuickDueAt(null); setQuickAssignee(null);
      const now = new Date().toISOString();
      // Quick-add always creates a standalone personal task (module='core'),
      // never a lead follow-up — the lead-identity fields are always null here.
      const syntheticTask: PersonalTaskRow = {
        id: result.data!.taskId, title: quickTitle.trim(), description: null,
        priority: 'normal', status: 'to_do',
        due_at: quickDueAt ? quickDueAt.toISOString() : null,
        assigned_to: result.data!.assignedTo,
        created_by:  result.data!.createdBy,
        group_id:    null,
        task_category: 'personal', task_type: 'other', module: 'core',
        completed_at: null, overdue_at: null, attachments: [], tags: [], created_at: now, updated_at: now,
        lead_id: null, lead_first_name: null, lead_last_name: null, lead_slug: null,
      };
      setActiveTasks((prev) => [syntheticTask, ...prev]);
    });
  }, [isPending, quickTitle, quickDueAt, quickAssignee, startTransition]);

  // ── Auto-load every page ──────────────────────────────────────────────────
  // My Tasks is a CALENDAR, not a paged list — a dot/section must reflect the
  // user's whole active schedule, so a far-future task beyond page 1 cannot be
  // hidden behind a "Load more" click. The paged RPC stays (LIMIT 51/page,
  // composite cursor); we drain every page: each fetch advances nextCursor,
  // which re-fires this effect until hasMore is false.
  //
  // The effect depends ONLY on the cursor — NEVER on isLoadingMore. A flag the
  // effect both sets and depends on cancels its own in-flight fetch on the
  // re-run (cleanup), so the page result never commits and the drain spins
  // forever (the "stuck on loading" bug). A ref guards against the same cursor
  // being fetched twice; the cursor advancing is the only thing that drives it.
  const drainingCursorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasMore || !nextCursor) return;
    if (drainingCursorRef.current === nextCursor.id) return; // already fetching this page
    drainingCursorRef.current = nextCursor.id;
    setIsLoadingMore(true);
    getPersonalTasksAction({ cursor: nextCursor, status: ['to_do', 'in_progress', 'in_review', 'error', 'cancelled'] })
      .then((r) => {
        if (!r.data) return;
        setActiveTasks((prev) => [...prev, ...r.data!.tasks]);
        setHasMore(r.data.hasMore);
        setNextCursor(r.data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [hasMore, nextCursor]);

  // ── Row click → pre-fetch remarks then open modal ──────────────────────────
  // Stable identity so memo(CalendarTaskRow) skips untouched rows (G-4)
  const handleRowClick = useCallback((task: PersonalTaskRow) => {
    setSelectedTask(task);
    setSelectedTaskRemarks(null);
    getTaskRemarksAction(task.id)
      .then((r) => setSelectedTaskRemarks(r.data ?? []))
      .catch(() => setSelectedTaskRemarks([]));
    setTaskModalOpen(true);
  }, []);

  // ── Calendar date click ────────────────────────────────────────────────────
  function handleCalendarSelect(date: Date) {
    const key = localKey(date);
    if (calendarDate && localKey(calendarDate) === key) {
      // clicking the same date again → go back to all mode
      setCalendarDate(null);
    } else {
      setCalendarDate(date);
    }
  }

  function goToToday() {
    setCalendarDate(null);
  }

  // ── Filter tasks ────────────────────────────────────────────────────────────
  function taskPassesFilters(task: PersonalTaskRow): boolean {
    if (filters.search.trim()) {
      // Include the linked lead's name so searching a lead finds its follow-up
      // task (lead tasks carry a type-derived title like "Call", not the name).
      const leadName = `${task.lead_first_name ?? ''} ${task.lead_last_name ?? ''}`;
      const hay = `${task.title} ${task.description ?? ''} ${leadName}`.toLowerCase();
      if (!hay.includes(filters.search.trim().toLowerCase())) return false;
    }
    if (filters.tags.length > 0 && !filters.tags.every((t) => task.tags.includes(t))) return false;
    const eff = optimisticStatus[task.id] ?? task.status;
    if (filters.statuses.length > 0 && !filters.statuses.includes(eff)) return false;
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false;
    return true;
  }

  const filteredTasks  = activeTasks.filter(taskPassesFilters);
  const allSections    = groupTasksByDate(filteredTasks, optimisticStatus);
  const taskDots       = buildTaskDots(filteredTasks, optimisticStatus);

  // In single-date mode, narrow to just tasks matching the selected date
  const visibleSections: DateSection[] = (() => {
    if (isAllMode) return allSections;
    const selKey = localKey(calendarDate!);
    const today  = todayKey();
    // Map the selected calendar date to the right section key
    const sectionKey = selKey === today ? 'today' : selKey < today ? 'overdue' : selKey;
    // For overdue mode we show ALL overdue tasks, for a specific future date we filter
    if (sectionKey === 'overdue') {
      const overdueSec = allSections.find((s) => s.isOverdue);
      return overdueSec ? [overdueSec] : [];
    }
    const found = allSections.find((s) => s.key === sectionKey);
    if (found) return [found];
    // The selected date exists on the calendar but has no tasks
    return [{
      key:    sectionKey,
      label:  sectionKey === today ? 'Today' : sectionLabel(selKey),
      tasks:  [],
      isToday: sectionKey === today,
    }];
  })();

  // Match the count to the rows the sections actually render — isTaskActionable
  // (the shared predicate buildTaskDots / groupTasksByDate gate on) excludes
  // completed AND cancelled. Counting only !== 'completed' here over-reported by
  // any cancelled task that passed the filters but was hidden from the list.
  const visibleCount = filteredTasks.filter((t) =>
    isTaskActionable(t, optimisticStatus),
  ).length;

  useEffect(() => { onFilteredCountChange?.(visibleCount); }, [visibleCount, onFilteredCountChange]);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.tags.length > 0 ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0;

  // ─── Section card ──────────────────────────────────────────────────────────

  function renderSection(section: DateSection) {
    const sIsToday   = !!section.isToday;
    const sIsOverdue = !!section.isOverdue;
    const isCollapsed = collapsedKeys.has(section.key);

    const headerBg = sIsOverdue
      ? 'var(--color-danger-light)'
      : sIsToday
      ? 'var(--theme-accent-surface)'
      : 'var(--theme-paper-subtle)';

    const headerColor = sIsOverdue
      ? 'var(--color-danger-text)'
      : sIsToday
      ? 'var(--theme-accent)'
      : 'var(--theme-text-secondary)';

    const dotColor = sIsOverdue
      ? 'var(--color-danger)'
      : sIsToday
      ? 'var(--theme-accent)'
      : 'var(--theme-text-tertiary)';

    const isEmpty = section.tasks.length === 0;

    return (
      <div
        key={section.key}
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        {/* Section header — always clickable to collapse */}
        <button
          type="button"
          onClick={() => { if (!isEmpty) toggleCollapse(section.key); }}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            'var(--space-2)',
            width:          '100%',
            padding:        'var(--space-3) var(--space-4)',
            background:     headerBg,
            border:         'none',
            borderBottom:   (!isEmpty && !isCollapsed) ? '1px solid var(--theme-paper-border)' : 'none',
            cursor:         isEmpty ? 'default' : 'pointer',
            textAlign:      'left',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 'var(--radius-full)',
            background: dotColor, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase', color: headerColor, flex: 1,
          }}>
            {section.label}
          </span>
          {!isEmpty && (
            <>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '1px var(--space-2)',
                borderRadius: 'var(--radius-full)',
                background: sIsOverdue
                  ? 'color-mix(in srgb, var(--color-danger) 14%, transparent)'
                  : sIsToday
                  ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)'
                  : 'var(--theme-paper-border)',
                color: sIsOverdue ? 'var(--color-danger-text)' : sIsToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
              }}>
                {section.tasks.length}
              </span>
              <motion.span
                animate={{ rotate: isCollapsed ? -90 : 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                style={{ display: 'flex', alignItems: 'center', color: headerColor, flexShrink: 0 }}
              >
                <ChevronDown style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
              </motion.span>
            </>
          )}
        </button>

        {/* Body: task rows or empty state */}
        <AnimatePresence initial={false}>
          {(!isCollapsed) && (
            <CollapseReveal key="body">
              {isEmpty ? (
                /* Empty state — for today or a selected date with no tasks */
                <div style={{
                  padding: 'var(--space-8) var(--space-6)',
                  textAlign: 'center',
                  background: 'var(--theme-paper)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
                    <Sparkles style={{ width: 28, height: 28, strokeWidth: 1, color: 'var(--theme-accent)', opacity: 0.5 }} />
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                    fontSize: 'var(--text-lg)', color: 'var(--theme-text-secondary)', margin: 0,
                  }}>
                    Hooray<span className="page-title-dot">.</span>
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                    color: 'var(--theme-text-tertiary)', marginTop: 'var(--space-1)', marginBottom: 0,
                  }}>
                    {sIsToday ? 'Nothing due today.' : 'Nothing scheduled for this day.'}
                  </p>
                </div>
              ) : (
                section.tasks.map((task, idx) => (
                  <CalendarTaskRow
                    key={task.id}
                    task={task}
                    idx={idx}
                    isLast={idx === section.tasks.length - 1}
                    effectiveStatus={optimisticStatus[task.id] ?? task.status}
                    canComplete={canToggleTaskComplete(task, caller)}
                    highlighted={hoveredTaskId === task.id}
                    showDue={!sIsToday}
                    currentUserId={currentUserId}
                    onHoverChange={setHoveredTaskId}
                    onToggle={handleToggle}
                    onOpen={handleRowClick}
                  />
                ))
              )}
            </CollapseReveal>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col items-stretch md:flex-row md:items-start"
      style={{ gap: 'var(--space-5)' }}
    >

      {/* ── Left: Calendar panel — full-width above the list <md, 280px sticky column md+ */}
      <div className="w-full md:w-70 md:sticky" style={{
        flexShrink: 0, top: 'var(--space-4)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
      }}>
        {/* Calendar card */}
        <div style={{
          background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-1)', overflow: 'hidden',
        }}>
          <Calendar
            value={calendarDate ?? new Date()}
            onSelect={handleCalendarSelect}
            taskDots={taskDots}
            style={{ width: '100%', borderRadius: 0, border: 'none', boxShadow: 'none', padding: 'var(--space-4)' }}
          />
          {/* Today button — bottom of calendar, inside the card */}
          {!isAllMode && (
            <div style={{ borderTop: '1px solid var(--theme-paper-border)', padding: 'var(--space-2) var(--space-4)' }}>
              <button
                type="button"
                onClick={goToToday}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', padding: 'var(--space-2) 0',
                  background: 'transparent', border: 'none',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-wide)',
                  color: 'var(--theme-accent)', cursor: 'pointer',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                Back To Present
              </button>
            </div>
          )}
        </div>

        {/* Quick stats strip */}
        <div style={{
          background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-1)',
          padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        }}>
          <p className="label-micro" style={{ margin: 0 }}>Summary</p>
          {(() => {
            const todaySec      = allSections.find((s) => s.isToday);
            const overdueSec    = allSections.find((s) => s.isOverdue);
            const totalUpcoming = allSections
              .filter((s) => !s.isToday && !s.isOverdue && !s.isNoDate)
              .reduce((sum, s) => sum + s.tasks.length, 0);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <StatRow color="var(--theme-accent)"         label="Due today" count={todaySec?.tasks.length ?? 0} />
                <StatRow color="var(--color-danger)"         label="Overdue"   count={overdueSec?.tasks.length ?? 0} />
                <StatRow color="var(--theme-text-tertiary)"  label="Upcoming"  count={totalUpcoming} />
              </div>
            );
          })()}
        </div>

        {/* Quick-add trigger */}
        <button
          type="button"
          onClick={() => setShowQuickAdd((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'var(--space-2)', width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--theme-paper-border)',
            background:   showQuickAdd ? 'var(--theme-accent-surface)' : 'transparent',
            color:        showQuickAdd ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
            cursor: 'pointer', transition: 'var(--transition-hover)',
          }}
          onMouseEnter={(e) => {
            if (!showQuickAdd) {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-accent)';
              (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showQuickAdd) {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-paper-border)';
              (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-tertiary)';
            }
          }}
        >
          <CalendarDays style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
          Quick add task
        </button>
      </div>

      {/* ── Right: Date-grouped task list ─────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>

        {/* Quick-add row */}
        <AnimatePresence>
          {showQuickAdd && (
            <CollapseReveal key="quick-add" style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                flexWrap: 'wrap',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--theme-accent-surface)',
                border: '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-md)',
              }}>
                <input
                  ref={quickTitleRef}
                  type="text" value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickAddSave();
                    if (e.key === 'Escape') { setShowQuickAdd(false); setQuickTitle(''); }
                  }}
                  placeholder="Task title…" disabled={isPending}
                  style={{
                    flex: '1 1 160px', minWidth: 0, border: 'none', outline: 'none',
                    background: 'transparent', fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)',
                    caretColor: 'var(--theme-accent)',
                    opacity: isPending ? 0.6 : 1, cursor: isPending ? 'not-allowed' : 'text',
                  }}
                />
                <DatePicker
                  value={quickDueAt} onChange={setQuickDueAt}
                  placeholder="Due date…" disabled={isPending}
                  aria-label="Due date" style={{ flexShrink: 0 }}
                />
                {['manager', 'admin', 'founder'].includes(callerRole) && (
                  <button
                    type="button" onClick={() => setShowAssigneePicker(true)}
                    aria-label="Pick assignee"
                    title={quickAssignee?.full_name ?? `${currentUserName} (you)`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 'var(--space-7)', height: 'var(--space-7)',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--theme-paper-border)',
                      background: quickAssignee ? 'var(--theme-accent-surface)' : 'transparent',
                      color: quickAssignee ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                      cursor: 'pointer', transition: 'var(--transition-hover)', flexShrink: 0,
                    }}
                  >
                    <Avatar
                      name={(quickAssignee ?? { full_name: currentUserName }).full_name}
                      size="xs"
                      style={{ width: 18, height: 18, minWidth: 18 }}
                    />
                  </button>
                )}
                <button
                  type="button" onClick={handleQuickAddSave}
                  disabled={isPending || !quickTitle.trim()}
                  style={{
                    padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: quickTitle.trim() ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
                    color: quickTitle.trim() ? 'var(--theme-accent-fg)' : 'var(--theme-text-tertiary)',
                    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
                    cursor: isPending || !quickTitle.trim() ? 'not-allowed' : 'pointer',
                    opacity: isPending ? 0.6 : 1, transition: 'var(--transition-interactive)', flexShrink: 0,
                  }}
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button" onClick={() => { setShowQuickAdd(false); setQuickTitle(''); }}
                  aria-label="Cancel"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 'var(--space-6)', height: 'var(--space-6)',
                    borderRadius: 'var(--radius-sm)', border: 'none',
                    background: 'transparent', color: 'var(--theme-text-tertiary)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <X style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
                </button>
              </div>
              <p style={{
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                color: 'var(--theme-text-tertiary)', margin: 'var(--space-1) 0 0 var(--space-4)',
              }}>
                <UserCircle style={{ display: 'inline', width: 12, height: 12, strokeWidth: 1.5, marginRight: 4 }} />
                Press Enter to save · Esc to cancel
              </p>
            </CollapseReveal>
          )}
        </AnimatePresence>

        {/* Date sections — each in its own card with gap between */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {visibleSections.map((section) => renderSection(section))}

          {/* Global empty state — only when filters hide everything in all-mode */}
          {isAllMode && visibleSections.every((s) => s.tasks.length === 0 && !s.isToday) && hasActiveFilters && (
            <div style={{
              padding: 'var(--space-16) var(--space-8)', textAlign: 'center',
              background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-1)',
            }}>
              <p style={{
                fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                fontSize: 'var(--text-lg)', color: 'var(--theme-text-tertiary)', margin: 0,
              }}>
                Nothing matches your filters.
              </p>
              <p style={{
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                color: 'var(--theme-text-tertiary)', marginTop: 'var(--space-2)', marginBottom: 0,
              }}>
                Try adjusting your search or filters.
              </p>
            </div>
          )}
        </div>

        {/* Auto-loading the rest of the schedule — no manual "Load more" (the
            calendar must reflect every active task; pages drain on mount). */}
        {(hasMore || isLoadingMore) && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--space-2)', margin: 'var(--space-4) auto 0',
              color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-sm)',
            }}
          >
            <Spinner size="sm" />
            Loading your tasks…
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <CreatePersonalTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(task) => {
          // A standalone personal task — never a lead follow-up, so the
          // lead-identity fields are null (PersonalTaskRow shape, 0145).
          setActiveTasks((prev) => [
            { ...task, lead_id: null, lead_first_name: null, lead_last_name: null, lead_slug: null },
            ...prev,
          ]);
          setCreateModalOpen(false);
          if (task.tags.length > 0) onTagsMayHaveChanged?.();
        }}
      />

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
          />
        )}
      </AnimatePresence>

      {typeof window !== 'undefined' && createPortal(
        <AssigneePickerModal
          open={showAssigneePicker}
          onClose={() => setShowAssigneePicker(false)}
          onConfirm={(_uid, user) => { setQuickAssignee(user); setShowAssigneePicker(false); }}
          users={assignableUsers}
          initialDomain={callerDomain}
        />,
        document.body,
      )}
    </div>
  );
}

// ─── Single task row ───────────────────────────────────────────────────────────
// memo (G-4): hover state lives in the parent (`hoveredTaskId`), so without
// memo every mouseenter re-rendered every row in every section. All props are
// primitives, the stable task object, or useCallback'd handlers — only the two
// rows whose `highlighted` flag changes re-render on hover.

interface CalendarTaskRowProps {
  task:            PersonalTaskRow;
  idx:             number;
  isLast:          boolean;
  effectiveStatus: TaskStatus;
  canComplete:     boolean;
  highlighted:     boolean;
  showDue:         boolean;   // due chip hidden in the Today section
  currentUserId:   string;
  onHoverChange:   (taskId: string | null) => void;
  onToggle:        (e: React.MouseEvent, task: { id: string; status: TaskStatus }) => void;
  onOpen:          (task: PersonalTaskRow) => void;
}

const CalendarTaskRow = memo(function CalendarTaskRow({
  task,
  idx,
  isLast,
  effectiveStatus,
  canComplete,
  highlighted,
  showDue,
  currentUserId,
  onHoverChange,
  onToggle,
  onOpen,
}: CalendarTaskRowProps) {
  const isComplete   = effectiveStatus === 'completed';
  const dueDateColor = getDueDateColor(task.due_at, effectiveStatus);
  const overdue      = isOverdueDate(task.due_at) && !isComplete;

  // A lead follow-up (module='gia') carries the linked lead's identity (0145);
  // its title is a type label ("Call"), so surface WHICH lead beside it as a
  // dossier link. The slug is the canonical dossier route, id is the fallback.
  const leadName = task.lead_id
    ? `${task.lead_first_name ?? ''} ${task.lead_last_name ?? ''}`.trim()
    : '';
  const leadHref = task.lead_id ? `/leads/${task.lead_slug ?? task.lead_id}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(idx * 40, 200) / 1000, ease: EASE_OUT_EXPO }}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
        padding:      'var(--space-3) var(--space-4)',
        borderBottom: !isLast ? '1px solid var(--theme-paper-border)' : 'none',
        background:   'var(--theme-paper)',
      }}
      onMouseEnter={() => onHoverChange(task.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <TaskCompletionCircle
        checked={isComplete}
        disabled={!canComplete}
        highlighted={highlighted}
        onToggle={(e) => onToggle(e, task)}
      />

      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, cursor: 'pointer' }}
        role="button" tabIndex={0}
        onClick={() => onOpen(task)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(task); }}
      >
        <span style={{
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color:      isComplete ? 'var(--theme-text-tertiary)' : 'var(--theme-text-primary)',
          textDecoration: isComplete ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          // When a lead chip follows, keep the type label intact and let the
          // lead name take the remaining width; otherwise the title flexes.
          flex: leadHref ? '0 0 auto' : '1', minWidth: 0,
        }}>
          {task.title}
        </span>
        {leadHref && (
          <>
            <span aria-hidden style={{
              color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-sm)', flexShrink: 0,
            }}>·</span>
            <Link
              href={leadHref}
              onClick={(e) => e.stopPropagation()}
              title={`Open ${leadName}'s lead`}
              style={{
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                color: 'var(--theme-accent)', textDecoration: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: '1 1 auto', minWidth: 0,
              }}
            >
              {leadName || 'Lead'}
            </Link>
          </>
        )}
        {task.assigned_to && task.assigned_to !== currentUserId && (
          <div title="Assigned to someone else" style={{
            width: 'var(--space-5)', height: 'var(--space-5)',
            borderRadius: 'var(--radius-xs)',
            background: 'var(--theme-accent-surface)',
            border: '1px solid var(--theme-paper-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User style={{ width: 10, height: 10, strokeWidth: 1.5, color: 'var(--theme-accent)' }} />
          </div>
        )}
      </div>

      {task.due_at && showDue && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color:      dueDateColor,
          fontWeight: overdue ? 'var(--weight-semibold)' : 'var(--weight-normal)',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {overdue ? 'Overdue' : formatDate(new Date(task.due_at), 'd MMM')}
        </span>
      )}

      <button
        type="button"
        onClick={() => onOpen(task)}
        aria-label="Open task details"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 'var(--space-6)', height: 'var(--space-6)',
          borderRadius: 'var(--radius-xs)',
          border: '1px solid var(--theme-paper-border)',
          background: 'transparent', color: 'var(--theme-text-tertiary)',
          cursor: 'pointer', flexShrink: 0, transition: 'var(--transition-hover)',
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
    </motion.div>
  );
});

// ─── Small stat row helper ─────────────────────────────────────────────────────

function StatRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{
        width: 6, height: 6, borderRadius: 'var(--radius-full)',
        background: count > 0 ? color : 'var(--theme-paper-border)', flexShrink: 0,
      }} />
      <span style={{
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
        color: count > 0 ? 'var(--theme-text-secondary)' : 'var(--theme-text-tertiary)', flex: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
        color: count > 0 ? color : 'var(--theme-text-tertiary)',
      }}>
        {count}
      </span>
    </div>
  );
}
