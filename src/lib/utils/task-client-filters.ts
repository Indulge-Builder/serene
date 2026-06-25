import type { Task, TaskStatus, TaskPriority, AppDomain } from '@/lib/types/database';
import type { TaskGroupRow } from '@/lib/services/tasks-service';
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { TASK_PRIORITY } from '@/lib/constants/task-constants';

/** Client-side filters for My Tasks — no server round trip */
export type PersonalTaskFiltersState = {
  search:     string;
  tags:       string[];
  statuses:   TaskStatus[];
  priorities: TaskPriority[];
};

/** Client-side filters for Group Tasks list */
export type GroupTaskFiltersState = {
  search:     string;
  statuses:   TaskStatus[];
  priorities: TaskPriority[];
  domain:     string;
  progress:   'all' | 'in_progress' | 'complete' | 'empty';
};

/** Resolve assignee profile for SubTaskModal from task.assigned_to */
export function resolvePersonalTaskAssignee(
  task: Pick<Task, 'assigned_to'>,
  currentUser: { id: string; full_name: string },
  roster: { id: string; full_name: string; avatar_url: string | null }[] = [],
): { id: string; full_name: string; avatar_url: string | null } | undefined {
  if (!task.assigned_to) return undefined;
  if (task.assigned_to === currentUser.id) {
    return { id: currentUser.id, full_name: currentUser.full_name, avatar_url: null };
  }
  const match = roster.find((u) => u.id === task.assigned_to);
  return match
    ? { id: match.id, full_name: match.full_name, avatar_url: match.avatar_url }
    : undefined;
}

export const TASK_TYPE_FILTER_ITEMS = TASK_TYPES.map((t) => ({
  id:    t,
  label: TASK_TYPE_LABELS[t],
}));

export const EMPTY_PERSONAL_TASK_FILTERS: PersonalTaskFiltersState = {
  search:     '',
  tags:       [],
  statuses:   [],
  priorities: [],
};

export const EMPTY_GROUP_TASK_FILTERS: GroupTaskFiltersState = {
  search:     '',
  statuses:   [],
  priorities: [],
  domain:     'all',
  progress:   'all',
};

export const TASK_STATUS_FILTER_ITEMS = TASK_STATUSES.map((s) => ({
  id:    s,
  label: TASK_STATUS_LABELS[s],
}));

// My Tasks holds only ACTIONABLE tasks — MyTasksCalendarView renders via
// isTaskActionable (effective status neither completed nor cancelled) and never
// even pages in completed rows. Offering Completed/Cancelled in the personal
// Status filter is a dead option (selecting them yields an empty list). Restrict
// the personal Status dropdown to the statuses the view can actually show.
const MY_TASKS_VISIBLE_STATUSES: TaskStatus[] = TASK_STATUSES.filter(
  (s) => s !== 'completed' && s !== 'cancelled',
);

export const MY_TASKS_STATUS_FILTER_ITEMS = MY_TASKS_VISIBLE_STATUSES.map((s) => ({
  id:    s,
  label: TASK_STATUS_LABELS[s],
}));

export const TASK_PRIORITY_FILTER_ITEMS = (['urgent', 'high', 'normal'] as const).map((p) => ({
  id:    p,
  label: TASK_PRIORITY[p].label,
}));

export const GROUP_PROGRESS_FILTER_ITEMS = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'complete',    label: 'Complete' },
  { id: 'empty',       label: 'No subtasks' },
] as const;

function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function personalTaskPasses(
  task: Task,
  effectiveStatus: TaskStatus,
  filters: PersonalTaskFiltersState,
): boolean {
  if (filters.search.trim()) {
    const haystack = `${task.title} ${task.description ?? ''}`;
    if (!matchesSearch(haystack, filters.search)) return false;
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

export function countVisiblePersonalTasks(
  activeTasks: Task[],
  completedTasks: Task[],
  optimisticStatus: Record<string, TaskStatus>,
  filters: PersonalTaskFiltersState,
): number {
  let n = 0;
  for (const task of activeTasks) {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    if (effectiveStatus === 'completed') continue;
    if (personalTaskPasses(task, effectiveStatus, filters)) n++;
  }
  for (const task of completedTasks) {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    if (personalTaskPasses(task, effectiveStatus, filters)) n++;
  }
  return n;
}

export function filterGroupRows(
  rows: TaskGroupRow[],
  filters: GroupTaskFiltersState,
): TaskGroupRow[] {
  return rows.filter((row) => {
    if (filters.search.trim() && !matchesSearch(row.title, filters.search)) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.status)) {
      return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(row.priority)) {
      return false;
    }
    if (filters.domain !== 'all' && row.domain !== filters.domain) {
      return false;
    }
    if (filters.progress !== 'all') {
      const { subtask_count: total, completed_count: done } = row;
      if (filters.progress === 'empty' && total > 0) return false;
      if (filters.progress === 'in_progress' && !(total > 0 && done < total)) return false;
      if (filters.progress === 'complete' && !(total > 0 && done >= total)) return false;
    }
    return true;
  });
}

export function personalFiltersActiveCount(filters: PersonalTaskFiltersState): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0)
  );
}

export function groupFiltersActiveCount(filters: GroupTaskFiltersState): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.domain !== 'all' ? 1 : 0) +
    (filters.progress !== 'all' ? 1 : 0)
  );
}

export function domainsInGroupRows(rows: TaskGroupRow[]): AppDomain[] {
  return Array.from(new Set(rows.map((r) => r.domain as AppDomain)));
}
