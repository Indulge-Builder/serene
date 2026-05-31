import type { Task, TaskStatus, TaskPriority, TaskType, AppDomain } from '@/lib/types/database';
import type { TaskGroupRow, GiaTask } from '@/lib/services/tasks-service';
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/constants/task-types';
import { TASK_PRIORITY } from '@/lib/constants/task-constants';

/** Client-side filters for My Tasks — no server round trip */
export type PersonalTaskFiltersState = {
  search:     string;
  tags:       string[];
  statuses:   TaskStatus[];
  priorities: TaskPriority[];
};

/** Client-side filters for Gia Tasks tab */
export type GiaTaskFiltersState = {
  search:    string;
  taskTypes: TaskType[];
  dateFrom:  string; // ISO date string YYYY-MM-DD, '' = no lower bound
  dateTo:    string; // ISO date string YYYY-MM-DD, '' = no upper bound
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

export const EMPTY_GIA_TASK_FILTERS: GiaTaskFiltersState = {
  search:    '',
  taskTypes: [],
  dateFrom:  '',
  dateTo:    '',
};

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

export function filterGiaTasks(
  tasks: GiaTask[],
  optimisticStatus: Record<string, TaskStatus>,
  filters: GiaTaskFiltersState,
): GiaTask[] {
  return tasks.filter((task) => {
    const effectiveStatus = optimisticStatus[task.id] ?? task.status;
    // Always hide completed tasks from date sections (same rule as MyTasksCalendarView)
    if (effectiveStatus === 'completed') return false;

    if (filters.search.trim()) {
      const leadName = [task.lead_first_name, task.lead_last_name].filter(Boolean).join(' ');
      const haystack = `${leadName} ${task.title} ${task.description ?? ''}`;
      if (!matchesSearch(haystack, filters.search)) return false;
    }

    if (filters.taskTypes.length > 0 && !filters.taskTypes.includes(task.task_type as TaskType)) {
      return false;
    }

    if (filters.dateFrom && task.due_at) {
      if (task.due_at.slice(0, 10) < filters.dateFrom) return false;
    }
    if (filters.dateTo && task.due_at) {
      if (task.due_at.slice(0, 10) > filters.dateTo) return false;
    }
    // Tasks with no due_at pass date filters (same as MyTasksCalendarView "No Due Date" bucket)
    // UNLESS a dateFrom/dateTo is set — then no-date tasks are hidden since they don't match.
    if ((filters.dateFrom || filters.dateTo) && !task.due_at) return false;

    return true;
  });
}

export function giaFiltersActiveCount(filters: GiaTaskFiltersState): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    (filters.taskTypes.length > 0 ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}
