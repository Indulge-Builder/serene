import type { TaskStatus, TaskPriority, TaskCategory } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Task priority config
// color values are CSS token names — never hex
// ─────────────────────────────────────────────
export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; color: string; order: number }
> = {
  urgent: { label: 'Urgent', color: 'var(--color-danger)',  order: 1 },
  high:   { label: 'High',   color: 'var(--theme-warning)', order: 2 },
  normal: { label: 'Normal', color: 'var(--theme-text-tertiary)', order: 3 },
};

// ─────────────────────────────────────────────
// Task status config
// ─────────────────────────────────────────────
export const TASK_STATUS: Record<
  TaskStatus,
  { label: string; color: string; order: number }
> = {
  to_do:       { label: 'To Do',       color: 'var(--theme-text-secondary)', order: 1 },
  in_progress: { label: 'In Progress', color: 'var(--theme-accent)',         order: 2 },
  in_review:   { label: 'In Review',   color: 'var(--theme-warning)',        order: 3 },
  completed:   { label: 'Completed',   color: 'var(--color-success)',        order: 4 },
  error:       { label: 'Error',       color: 'var(--color-danger)',         order: 5 },
  cancelled:   { label: 'Cancelled',   color: 'var(--theme-text-tertiary)',  order: 6 },
};

// ─────────────────────────────────────────────
// Task category config
// ─────────────────────────────────────────────
export const TASK_CATEGORY: Record<
  TaskCategory,
  { label: string; color: string }
> = {
  personal:      { label: 'Personal',    color: 'var(--theme-accent)'       },
  group_subtask: { label: 'Group Task',  color: 'var(--theme-text-primary)' },
  gia_followup:  { label: 'Gia Follow-up', color: 'var(--color-info)'       },
};
