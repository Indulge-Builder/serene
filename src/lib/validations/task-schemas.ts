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
});

export type CreatePersonalTaskInput = z.infer<typeof CreatePersonalTaskSchema>;

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
// Add task message
// ─────────────────────────────────────────────
export const AddTaskMessageSchema = z.object({
  taskId:  z.string().uuid('Invalid task ID'),
  content: z.string().min(1, 'Message cannot be empty').transform(sanitizeText),
});

export type AddTaskMessageInput = z.infer<typeof AddTaskMessageSchema>;

// ─────────────────────────────────────────────
// Delete task (taskId only — authorization in action)
// ─────────────────────────────────────────────
export const DeleteTaskSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
});

export type DeleteTaskInput = z.infer<typeof DeleteTaskSchema>;

// ─────────────────────────────────────────────
// Suppress task message (admin/founder only)
// ─────────────────────────────────────────────
export const SuppressTaskMessageSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
});

export type SuppressTaskMessageInput = z.infer<typeof SuppressTaskMessageSchema>;
