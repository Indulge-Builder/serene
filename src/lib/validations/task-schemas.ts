import { z } from 'zod';
import { sanitizeText } from '@/lib/utils/sanitize';

// ─────────────────────────────────────────────
// Shared enums (inline — no magic strings in actions)
// ─────────────────────────────────────────────
const PriorityEnum = z.enum(['urgent', 'high', 'normal']);
const StatusEnum   = z.enum(['to_do', 'in_progress', 'in_review', 'completed', 'error', 'cancelled']);

// ─────────────────────────────────────────────
// Create personal task
// ─────────────────────────────────────────────
export const CreatePersonalTaskSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(255).transform(sanitizeText),
  description: z.string().optional().transform((v) => (v ? sanitizeText(v) : null)),
  priority:    PriorityEnum.default('normal'),
  due_at:      z.string().datetime({ offset: true }).optional().nullable(),
  assigned_to: z.string().uuid('Invalid assignee ID').optional(),
  tags:        z.array(
    z.string().min(1).max(50).transform(sanitizeText),
  ).max(10).default([]),
});

export type CreatePersonalTaskInput = z.infer<typeof CreatePersonalTaskSchema>;

// ─────────────────────────────────────────────
// Update task tags (standalone action — called from task detail/edit)
// ─────────────────────────────────────────────
export const UpdateTaskTagsSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  tags:   z.array(
    z.string().min(1).max(50).transform(sanitizeText),
  ).max(10),
});

export type UpdateTaskTagsInput = z.infer<typeof UpdateTaskTagsSchema>;

// ─────────────────────────────────────────────
// Create task group
// ─────────────────────────────────────────────
export const CreateGroupTaskSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(255).transform(sanitizeText),
  description: z.string().optional().transform((v) => (v ? sanitizeText(v) : null)),
  priority:    PriorityEnum.default('normal'),
  due_at:      z.string().datetime({ offset: true }).optional().nullable(),
  domain:      z.string().min(1, 'Domain is required'),
});

export type CreateGroupTaskInput = z.infer<typeof CreateGroupTaskSchema>;

// ─────────────────────────────────────────────
// Create group subtask
// ─────────────────────────────────────────────
export const CreateSubtaskSchema = z.object({
  group_id:    z.string().uuid('Invalid group ID'),
  title:       z.string().min(1, 'Title is required').max(255).transform(sanitizeText),
  description: z.string().optional().transform((v) => (v ? sanitizeText(v) : null)),
  priority:    PriorityEnum.default('normal'),
  due_at:      z.string().datetime({ offset: true }).optional().nullable(),
  assigned_to: z.string().uuid('Invalid assignee ID'),
});

export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;

// ─────────────────────────────────────────────
// Update task (full update — partial fields allowed)
// ─────────────────────────────────────────────
export const UpdateTaskSchema = z.object({
  taskId:      z.string().uuid('Invalid task ID'),
  title:       z.string().min(1).max(255).transform(sanitizeText).optional(),
  description: z.string().optional().transform((v) => (v ? sanitizeText(v) : undefined)),
  priority:    PriorityEnum.optional(),
  status:      StatusEnum.optional(),
  due_at:      z.string().datetime({ offset: true }).optional().nullable(),
  assigned_to: z.string().uuid('Invalid assignee ID').optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// ─────────────────────────────────────────────
// Update task status only (targeted action)
// ─────────────────────────────────────────────
export const UpdateTaskStatusSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  status: StatusEnum,
});

export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>;

// ─────────────────────────────────────────────
// Add task remark
// ─────────────────────────────────────────────
export const AddTaskRemarkSchema = z.object({
  taskId:       z.string().uuid('Invalid task ID'),
  content:      z.string().min(1, 'Remark cannot be empty').max(2000, 'Remark cannot exceed 2000 characters').transform(sanitizeText),
  statusChange: StatusEnum.optional(),
});

export type AddTaskRemarkInput = z.infer<typeof AddTaskRemarkSchema>;

// ─────────────────────────────────────────────
// Delete task (taskId only — authorization in action)
// ─────────────────────────────────────────────
export const DeleteTaskSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
});

export type DeleteTaskInput = z.infer<typeof DeleteTaskSchema>;

// ─────────────────────────────────────────────
// Suppress task remark (admin/founder only)
// ─────────────────────────────────────────────
export const SuppressTaskRemarkSchema = z.object({
  messageId: z.string().uuid('Invalid remark ID'),
});

export type SuppressTaskRemarkInput = z.infer<typeof SuppressTaskRemarkSchema>;

// ─────────────────────────────────────────────
// Update checklist (attachments column)
// ─────────────────────────────────────────────
const ChecklistItemSchema = z.object({
  id:      z.string().min(1),
  text:    z.string().min(1).max(500),
  checked: z.boolean(),
});

export const UpdateChecklistSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  items:  z.array(ChecklistItemSchema),
});

export type UpdateChecklistInput = z.infer<typeof UpdateChecklistSchema>;
