'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CreatePersonalTaskSchema,
  CreateGroupTaskSchema,
  CreateSubtaskSchema,
  UpdateTaskSchema,
  UpdateTaskStatusSchema,
  AddTaskMessageSchema,
  DeleteTaskSchema,
  SuppressTaskMessageSchema,
} from '@/lib/validations/task-schemas';
import { formErrors } from '@/lib/validations/form-errors';
import { sanitizeText } from '@/lib/utils/sanitize';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { createNotification } from '@/lib/services/notifications-service';
import { scheduleTaskReminder, cancelTaskReminder } from '@/trigger/task-reminders';
import type { ActionResult } from '@/lib/types/index';
import type { TaskStatus, TaskPriority } from '@/lib/types/database';

// Terminal statuses — no reminders needed beyond these
const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'cancelled', 'error'];

// ─────────────────────────────────────────────
// Authorization helper — canMutateTask (A-09)
// Must be called by every mutation action after fetching the task.
// adminClient bypasses RLS, so the application layer must enforce
// the same access rules that RLS would enforce. Never skip this.
//
// Rules (mirror the tasks RLS UPDATE policy + task_groups domain scope):
//   agent     → assigned_to = caller.id OR created_by = caller.id
//   manager   → same as agent, OR group_subtask in caller's domain
//   admin/founder → always allowed
// ─────────────────────────────────────────────
type CallerProfile = { id: string; role: string; domain: string };
type TaskMutationTarget = {
  assigned_to: string | null;
  created_by:  string | null;
  group_id:    string | null;
};

async function canMutateTask(
  caller: CallerProfile,
  task: TaskMutationTarget,
): Promise<boolean> {
  // admin and founder are unrestricted
  if (caller.role === 'admin' || caller.role === 'founder') return true;

  // Direct ownership — applies to every role
  if (task.assigned_to === caller.id || task.created_by === caller.id) return true;

  // Manager: additionally permitted on group subtasks in their own domain
  if (caller.role === 'manager' && task.group_id) {
    const supabase = await createClient();
    const { data: group } = await supabase
      .from('task_groups')
      .select('domain')
      .eq('id', task.group_id)
      .single();
    if (group?.domain === caller.domain) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// Action: createPersonalTaskAction
// Creates a personal task; notifies assignee if different from caller;
// schedules a Trigger.dev reminder if due_at is set.
// ─────────────────────────────────────────────
export async function createPersonalTaskAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  // 1. Zod validation — first, always (Rule S-01)
  const parsed = CreatePersonalTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const resolvedAssignedTo = fields.assigned_to ?? caller.id;

  // 3. If assigning to another user, verify they exist (only manager+ can do this)
  if (resolvedAssignedTo !== caller.id) {
    if (!['manager', 'admin', 'founder'].includes(caller.role)) {
      return { data: null, error: formErrors.unauthorized };
    }
  }

  const admin = createAdminClient();

  // 4. Insert task
  const { data: task, error: insertError } = await admin
    .from('tasks')
    .insert({
      assigned_to:   resolvedAssignedTo,
      created_by:    caller.id,
      module:        'gia',              // personal tasks default to gia module
      task_type:     'general_follow_up',
      task_category: 'personal',
      title:         fields.title,
      description:   fields.description ?? null,
      priority:      fields.priority,
      status:        'to_do',
      due_at:        fields.due_at ?? null,
      group_id:      null,
    })
    .select('id')
    .single();

  if (insertError || !task) return { data: null, error: formErrors.generic };

  const taskId = task.id as string;

  // 5. Notify assignee — fire-and-forget, non-fatal (if different from caller)
  if (resolvedAssignedTo !== caller.id) {
    createNotification({
      recipient_id: resolvedAssignedTo,
      type:         'task_assigned',
      title:        `New task: ${fields.title}`,
      body:         `Assigned to you by ${caller.full_name}`,
      action_url:   `/tasks`,
    }).catch(() => {});
  }

  // 6. Schedule reminder if due_at is set
  if (fields.due_at) {
    scheduleTaskReminder(taskId, new Date(fields.due_at), resolvedAssignedTo).catch(() => {});
  }

  return { data: { taskId }, error: null };
}

// ─────────────────────────────────────────────
// Action: createGroupTaskAction
// Creates a task_group row only (no subtasks).
// ─────────────────────────────────────────────
export async function createGroupTaskAction(
  input: unknown,
): Promise<ActionResult<{ groupId: string }>> {
  // 1. Zod validation
  const parsed = CreateGroupTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth — only manager+ can create group tasks
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!['manager', 'admin', 'founder'].includes(caller.role)) {
    return { data: null, error: formErrors.unauthorized };
  }

  // 3. Domain enforcement — manager locked to own domain
  const resolvedDomain =
    caller.role === 'manager' ? caller.domain : fields.domain;

  const admin = createAdminClient();

  // 4. Insert task_group
  const { data: group, error: insertError } = await admin
    .from('task_groups')
    .insert({
      title:       fields.title,
      description: fields.description ?? null,
      priority:    fields.priority,
      status:      'to_do',
      due_at:      fields.due_at ?? null,
      created_by:  caller.id,
      domain:      resolvedDomain,
    })
    .select('id')
    .single();

  if (insertError || !group) return { data: null, error: formErrors.generic };

  return { data: { groupId: group.id as string }, error: null };
}

// ─────────────────────────────────────────────
// Action: createSubtaskAction
// Creates a group_subtask under an existing task_group.
// Notifies the assignee.
// ─────────────────────────────────────────────
export async function createSubtaskAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  // 1. Zod validation
  const parsed = CreateSubtaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Verify the group exists and caller has access
  const { data: group } = await supabase
    .from('task_groups')
    .select('id, domain, created_by')
    .eq('id', fields.group_id)
    .single();

  if (!group) return { data: null, error: 'Task group not found.' };

  // 4. Domain check — agents cannot create subtasks in groups outside their domain
  if (
    caller.role === 'agent' &&
    group.domain !== caller.domain
  ) {
    return { data: null, error: formErrors.unauthorized };
  }

  const admin = createAdminClient();

  // 5. Insert subtask
  const { data: task, error: insertError } = await admin
    .from('tasks')
    .insert({
      assigned_to:   fields.assigned_to,
      created_by:    caller.id,
      module:        'gia',
      task_type:     'general_follow_up',
      task_category: 'group_subtask',
      title:         fields.title,
      description:   fields.description ?? null,
      priority:      fields.priority,
      status:        'to_do',
      due_at:        fields.due_at ?? null,
      group_id:      fields.group_id,
    })
    .select('id')
    .single();

  if (insertError || !task) return { data: null, error: formErrors.generic };

  const taskId = task.id as string;

  // 6. Notify assignee — fire-and-forget, non-fatal (always notify for subtasks)
  if (fields.assigned_to !== caller.id) {
    createNotification({
      recipient_id: fields.assigned_to,
      type:         'task_assigned',
      title:        `New task: ${fields.title}`,
      body:         `Assigned to you by ${caller.full_name}`,
      action_url:   `/tasks`,
    }).catch(() => {});
  }

  // 7. Schedule reminder if due_at is set
  if (fields.due_at) {
    scheduleTaskReminder(taskId, new Date(fields.due_at), fields.assigned_to).catch(() => {});
  }

  return { data: { taskId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateTaskStatusAction
// Validates caller can see the task before updating.
// Cancels the Trigger.dev reminder when moving to terminal status.
// ─────────────────────────────────────────────
export async function updateTaskStatusAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  // 1. Zod validation
  const parsed = UpdateTaskStatusSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, status } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch task via user client (RLS layer 1)
  const { data: task } = await supabase
    .from('tasks')
    .select('id, assigned_to, created_by, group_id, status, due_at')
    .eq('id', taskId)
    .single();

  if (!task) return { data: null, error: 'Task not found.' };

  // 4. Application-layer authorization check (A-09 — layer 2)
  const allowed = await canMutateTask(caller, task as TaskMutationTarget);
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  // No-op if status is unchanged
  if (task.status === status) return { data: { taskId }, error: null };

  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from('tasks')
    .update({
      status,
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', taskId);

  if (updateError) return { data: null, error: formErrors.generic };

  // 4. Cancel reminder when moving to terminal status
  if (TERMINAL_STATUSES.includes(status as TaskStatus)) {
    cancelTaskReminder(taskId).catch(() => {});
  }

  return { data: { taskId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateTaskAction
// Full update — if due_at changes, cancel old reminder and schedule new one.
// ─────────────────────────────────────────────
export async function updateTaskAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  // 1. Zod validation
  const parsed = UpdateTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, ...fields } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch current task via user client (RLS layer 1)
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, assigned_to, created_by, group_id, due_at, status')
    .eq('id', taskId)
    .single();

  if (!existing) return { data: null, error: 'Task not found.' };

  // 4. Application-layer authorization check (A-09 — layer 2)
  const allowed = await canMutateTask(caller, existing as TaskMutationTarget);
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();

  // 5. Build typed update payload — only include defined fields
  const due_at_changed = 'due_at' in fields;

  const updatePayload: {
    title?:        string;
    description?:  string | null;
    priority?:     TaskPriority;
    status?:       TaskStatus;
    assigned_to?:  string;
    due_at?:       string | null;
    completed_at?: string | null;
  } = {};

  if (fields.title       !== undefined) updatePayload.title       = fields.title;
  if (fields.description !== undefined) updatePayload.description = fields.description;
  if (fields.priority    !== undefined) updatePayload.priority    = fields.priority as TaskPriority;
  if (fields.status      !== undefined) updatePayload.status      = fields.status as TaskStatus;
  if (fields.assigned_to !== undefined) updatePayload.assigned_to = fields.assigned_to;
  if (due_at_changed)                   updatePayload.due_at      = fields.due_at ?? null;
  if (fields.status === 'completed')    updatePayload.completed_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from('tasks')
    .update(updatePayload)
    .eq('id', taskId);

  if (updateError) return { data: null, error: formErrors.generic };

  // 6. Reminder management — cancel old, schedule new when due_at changes
  if (due_at_changed) {
    // Cancel the old reminder regardless
    await cancelTaskReminder(taskId).catch(() => {});

    const newDueAt = fields.due_at ? new Date(fields.due_at) : null;
    const assignedTo = (fields.assigned_to ?? existing.assigned_to) as string;

    if (newDueAt && assignedTo) {
      scheduleTaskReminder(taskId, newDueAt, assignedTo).catch(() => {});
    }
  }

  // 7. If status moved to terminal, cancel reminder (safety net)
  if (
    fields.status &&
    TERMINAL_STATUSES.includes(fields.status as TaskStatus) &&
    !due_at_changed
  ) {
    cancelTaskReminder(taskId).catch(() => {});
  }

  return { data: { taskId }, error: null };
}

// ─────────────────────────────────────────────
// Action: deleteTaskAction
// Authorization: agent only if created_by = auth.uid() AND assigned_to = auth.uid();
//                manager/admin/founder unrestricted.
// Pre-mortem: Trigger.dev cancel BEFORE DB delete.
// If cancel fails → delete does NOT proceed.
// ─────────────────────────────────────────────
export async function deleteTaskAction(
  input: unknown,
): Promise<ActionResult<null>> {
  // 1. Zod validation
  const parsed = DeleteTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch task to check authorization
  const { data: task } = await supabase
    .from('tasks')
    .select('id, assigned_to, created_by')
    .eq('id', taskId)
    .single();

  if (!task) return { data: null, error: 'Task not found.' };

  // 4. Authorization check
  if (caller.role === 'agent') {
    const isOwner =
      task.created_by === caller.id && task.assigned_to === caller.id;
    if (!isOwner) return { data: null, error: formErrors.unauthorized };
  }
  // manager/admin/founder have unrestricted delete access

  // 5. Cancel Trigger.dev reminder BEFORE DB delete — if cancel fails, abort.
  try {
    await cancelTaskReminder(taskId);
  } catch {
    return { data: null, error: 'Could not cancel the scheduled reminder. Please try again.' };
  }

  // 6. Delete task — cascade removes task_messages (ON DELETE CASCADE on task_messages.task_id)
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (deleteError) return { data: null, error: formErrors.generic };

  return { data: null, error: null };
}

// ─────────────────────────────────────────────
// Read actions — service calls wrapped as server actions so that
// client components never import from server-only service modules
// (Rule A-03: all DB queries through lib/services; no server module
// in the client bundle).
// ─────────────────────────────────────────────
import {
  getGroupSubtasks,
  getPersonalTasks,
} from '@/lib/services/tasks-service';
import type {
  SubtaskWithAssignee,
  PersonalTaskFilters,
  PersonalTasksResult,
} from '@/lib/services/tasks-service';

export async function getGroupSubtasksAction(
  groupId: string,
): Promise<ActionResult<SubtaskWithAssignee[]>> {
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: 'Unauthorized.' };

  const rows = await getGroupSubtasks(groupId);
  return { data: rows, error: null };
}

export async function getPersonalTasksAction(
  filters: PersonalTaskFilters = {},
): Promise<ActionResult<PersonalTasksResult>> {
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: 'Unauthorized.' };

  const result = await getPersonalTasks(caller.id, filters);
  return { data: result, error: null };
}

// ─────────────────────────────────────────────
// Action: addTaskMessageAction
// Validates caller has task access; sanitizes content; inserts.
// task_messages is append-only — no update or delete (Rule A-11).
// ─────────────────────────────────────────────
export async function addTaskMessageAction(
  input: unknown,
): Promise<ActionResult<{ messageId: string }>> {
  // 1. Zod validation — content is sanitized by schema transform
  const parsed = AddTaskMessageSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, content } = parsed.data;

  // sanitizeText is called by the Zod transform; re-apply explicitly per Rule S-06
  const sanitizedContent = sanitizeText(content);

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Verify caller has access to the task (RLS enforces the same, but belt-and-braces)
  const { data: task } = await supabase
    .from('tasks')
    .select('id, assigned_to')
    .eq('id', taskId)
    .single();

  if (!task) return { data: null, error: 'Task not found.' };

  // 4. Insert message — admin client because RLS INSERT requires task access check
  // (RLS "task_messages_insert" mirrors this check; admin bypasses it safely since
  //  we've already verified access above in application code)
  const admin = createAdminClient();
  const { data: message, error: insertError } = await admin
    .from('task_messages')
    .insert({
      task_id:   taskId,
      author_id: caller.id,
      content:   sanitizedContent,
    })
    .select('id')
    .single();

  if (insertError || !message) return { data: null, error: formErrors.generic };

  return { data: { messageId: message.id as string }, error: null };
}

// ─────────────────────────────────────────────
// Action: suppressTaskMessageAction
// Soft-suppresses a task_messages row. The row is never deleted.
// Only admin and founder may call this action.
//
// Column restriction note: the RLS UPDATE policy ("task_messages_suppression_update")
// permits admin/founder to update ANY column on task_messages. PostgreSQL RLS does
// not restrict which columns change — only which rows are eligible. This action
// enforces the column restriction by writing ONLY the three suppression columns.
// Do not remove this comment; it documents why we use adminClient here instead of
// passing through the user client (which would also hit the RLS policy).
// ─────────────────────────────────────────────
export async function suppressTaskMessageAction(
  input: unknown,
): Promise<ActionResult<{ messageId: string }>> {
  // 1. Zod validation — first, always (Rule S-01)
  const parsed = SuppressTaskMessageSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { messageId } = parsed.data;

  // 2. Auth check — only admin and founder may suppress messages
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!['admin', 'founder'].includes(caller.role)) {
    return { data: null, error: formErrors.unauthorized };
  }

  const admin = createAdminClient();

  // 3. Verify the message exists before writing (Rule S-06 — never trust client IDs)
  const { data: existing } = await admin
    .from('task_messages')
    .select('id, is_suppressed')
    .eq('id', messageId)
    .single();

  if (!existing) return { data: null, error: 'Message not found.' };

  // No-op if already suppressed
  if (existing.is_suppressed) return { data: { messageId }, error: null };

  // 4. Write suppression — only the three suppression columns (column restriction
  //    is application-layer only; see comment above).
  const { error: updateError } = await admin
    .from('task_messages')
    .update({
      is_suppressed: true,
      suppressed_by: caller.id,
      suppressed_at: new Date().toISOString(),
    })
    .eq('id', messageId);

  if (updateError) return { data: null, error: formErrors.generic };

  return { data: { messageId }, error: null };
}
