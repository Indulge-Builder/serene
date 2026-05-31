import type { TaskType, TaskStatus } from "@/lib/types/database";

export const TASK_TYPES: TaskType[] = [
  'call',
  'whatsapp_message',
  'other',
];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call:              'Call',
  whatsapp_message:  'WhatsApp',
  other:             'Other',
};

export const TASK_STATUSES: TaskStatus[] = ['to_do', 'in_progress', 'in_review', 'completed', 'error', 'cancelled'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  to_do:       'To Do',
  in_progress: 'In Progress',
  in_review:   'In Review',
  completed:   'Completed',
  error:       'Error',
  cancelled:   'Cancelled',
};
