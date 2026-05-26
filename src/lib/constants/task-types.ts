import type { TaskType, TaskStatus } from "@/lib/types/database";

export const TASK_TYPES: TaskType[] = [
  'call',
  'whatsapp_message',
  'email',
  'general_follow_up',
];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call:              'Call',
  whatsapp_message:  'WhatsApp Message',
  email:             'Email',
  general_follow_up: 'General Follow-up',
};

export const TASK_STATUSES: TaskStatus[] = ['pending', 'done', 'cancelled'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending:   'Pending',
  done:      'Done',
  cancelled: 'Cancelled',
};
