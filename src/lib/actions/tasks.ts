"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CreatePersonalTaskSchema,
  CreateGroupTaskSchema,
  CreateSubtaskSchema,
  UpdateTaskSchema,
  UpdateTaskStatusSchema,
  AddTaskRemarkSchema,
  DeleteTaskSchema,
  DeleteGroupTaskSchema,
  SuppressTaskRemarkSchema,
  UpdateChecklistSchema,
  UpdateTaskTagsSchema,
  CompletedTasksQuerySchema,
} from "@/lib/validations/task-schemas";
import { formErrors } from "@/lib/validations/form-errors";
import { sanitizeText } from "@/lib/utils/sanitize";
import { getCurrentProfile, getProfileById } from "@/lib/services/profiles-service";
import { requireProfile } from "@/lib/actions/_auth";
import { getTaskRemarks, getCompletedTasks } from "@/lib/services/tasks-service";
import type { CompletedTasksResult } from "@/lib/services/tasks-service";
import { emitTaskEvent, resolveTaskDomain } from "@/lib/services/task-events";
import {
  canMutateTask,
  createPersonalTaskCore,
  createGroupTaskCore,
  createSubtaskCore,
  updateTaskStatusCore,
  updateTaskCore,
  deleteTaskCore,
  type MutationActor,
  type TaskMutationTarget,
} from "@/lib/services/task-mutations";
import type { ActionResult } from "@/lib/types/index";
import type {
  TaskStatus,
  TaskPriority,
  TaskRemark,
  ChecklistItem,
  Profile,
} from "@/lib/types/database";
import type {
  TaskRemarkWithAuthor,
  SubtaskWithAssignee,
} from "@/lib/services/tasks-service";

// Map a verified session profile to the principal-derived MutationActor the
// task cores take. The session caller IS the principal here — the future Elaya
// write tool (Brief 3) builds the same actor shape from the Elaya principal.
function actorFromProfile(p: Profile): MutationActor {
  return {
    userId: p.id,
    role: p.role,
    domain: p.domain,
    fullName: p.full_name ?? "A teammate",
  };
}

// Validate that a cross-user task assignee exists and is ACTIVE before the write
// (audit #5). Cross-DOMAIN assignment is intentionally allowed (any active user
// may be assigned to anyone), so this checks existence + is_active only — never
// domain. Returns null when ok, or the error ActionResult to bail with. The
// caller already gated WHO may assign (manager+); this guards WHOM they assign to.
async function assertAssigneeActive(
  assigneeId: string,
): Promise<{ data: null; error: string } | null> {
  const admin = createAdminClient();
  const { data: assignee } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("id", assigneeId)
    .single();

  if (!assignee || !assignee.is_active) {
    return { data: null, error: "The selected user is not available." };
  }
  return null;
}

// ─────────────────────────────────────────────
// Action: createPersonalTaskAction
// Creates a personal task; notifies assignee if different from caller;
// schedules a Trigger.dev reminder if due_at is set.
// ─────────────────────────────────────────────
export async function createPersonalTaskAction(
  input: unknown,
): Promise<
  ActionResult<{ taskId: string; assignedTo: string; createdBy: string }>
> {
  // 1. Zod validation — first, always (Rule S-01)
  const parsed = CreatePersonalTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth check
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const resolvedAssignedTo = fields.assigned_to ?? caller.id;

  // 3. If assigning to another user, only manager+ may do so (the per-resource
  //    gate; the core trusts this — Q-13), and that user must exist + be active
  //    (audit #5 — cross-domain assignment is allowed, inactive users are not).
  if (resolvedAssignedTo !== caller.id) {
    if (!["manager", "admin", "founder"].includes(caller.role)) {
      return { data: null, error: formErrors.unauthorized };
    }
    const inactive = await assertAssigneeActive(resolvedAssignedTo);
    if (inactive) return inactive;
  }

  // 4. Write body + side-effects (insert, notify, reminder, cache) → core.
  const result = await createPersonalTaskCore(actorFromProfile(caller), {
    title: fields.title,
    description: fields.description ?? null,
    priority: fields.priority,
    dueAt: fields.due_at ?? null,
    assignedTo: fields.assigned_to ?? null,
    tags: fields.tags ?? [],
  });

  if (!result.ok) return { data: null, error: formErrors.generic };

  return {
    data: {
      taskId: result.taskId,
      assignedTo: result.assignedTo,
      createdBy: result.createdBy,
    },
    error: null,
  };
}

// ─────────────────────────────────────────────
// Action: createGroupTaskAction
// Creates a task_group row only (no subtasks).
// Any authenticated non-guest user may create a group task.
// Domain locked to caller's domain except for admin/founder.
// ─────────────────────────────────────────────
export async function createGroupTaskAction(
  input: unknown,
): Promise<ActionResult<{ groupId: string }>> {
  // 1. Zod validation
  const parsed = CreateGroupTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth — any non-guest authenticated user may create a group task
  const auth = await requireProfile(["agent", "manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // 3. Write body + side-effects (domain enforcement, insert, cache) → core.
  const result = await createGroupTaskCore(actorFromProfile(caller), {
    title: fields.title,
    description: fields.description ?? null,
    priority: fields.priority,
    dueAt: fields.due_at ?? null,
    domain: fields.domain,
  });

  if (!result.ok) return { data: null, error: formErrors.generic };

  revalidatePath("/tasks");

  return { data: { groupId: result.groupId }, error: null };
}

// ─────────────────────────────────────────────
// Action: createSubtaskAction
// Creates a group_subtask under an existing task_group.
// Notifies the assignee.
// ─────────────────────────────────────────────
export async function createSubtaskAction(
  input: unknown,
): Promise<ActionResult<SubtaskWithAssignee>> {
  // 1. Zod validation
  const parsed = CreateSubtaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const fields = parsed.data;

  // 2. Auth check
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const supabase = await createClient();

  // 3. Verify the group exists and caller has access (the per-resource gate;
  //    the core trusts this — Q-13).
  const { data: group } = await supabase
    .from("task_groups")
    .select("id, domain, created_by")
    .eq("id", fields.group_id)
    .single();

  if (!group) return { data: null, error: "Task group not found." };

  // 4. Domain check — agents cannot create subtasks in groups outside their domain
  if (caller.role === "agent" && group.domain !== caller.domain) {
    return { data: null, error: formErrors.unauthorized };
  }

  // 4b. Assignee must exist + be active when assigning to someone else (audit #5).
  //     Group subtasks are cross-domain by design (any member from any domain can
  //     be pulled into a group) — so this checks existence + is_active only.
  if (fields.assigned_to && fields.assigned_to !== caller.id) {
    const inactive = await assertAssigneeActive(fields.assigned_to);
    if (inactive) return inactive;
  }

  // 5. Write body + side-effects (insert, assignee resolve, cache, notify,
  //    reminder) → core.
  const result = await createSubtaskCore(actorFromProfile(caller), {
    groupId: fields.group_id,
    title: fields.title,
    description: fields.description ?? null,
    priority: fields.priority,
    dueAt: fields.due_at ?? null,
    assignedTo: fields.assigned_to,
  });

  if (!result.ok) return { data: null, error: formErrors.generic };

  revalidatePath("/tasks");

  return { data: result.subtask, error: null };
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

  // 2. Auth + task fetch — independent, run in parallel
  const supabase = await createClient();

  const [caller, { data: task }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("tasks")
      .select(
        "id, assigned_to, created_by, group_id, status, due_at, title, task_category, task_gia_meta(task_id)",
      )
      .eq("id", taskId)
      .single(),
  ]);

  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!task) return { data: null, error: "Task not found." };

  // 3. Application-layer authorization check (A-09 — layer 2). Session client
  //    runs the manager→group-domain lookup; the core stays ungated.
  const allowed = await canMutateTask(
    supabase,
    caller,
    task as TaskMutationTarget,
  );
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  // No-op if status is unchanged
  if (task.status === status) return { data: { taskId }, error: null };

  // 4. Write body + side-effects (update, reminder cancel, cache) → core. The
  //    category cache branch keys on actor.userId deliberately (pre-mortem note).
  //    eventCtx carries the already-fetched snapshot so the oversight event
  //    (status_changed) resolves domain/subject + old→new without a re-fetch.
  const result = await updateTaskStatusCore(
    actorFromProfile(caller),
    { taskId, status: status as TaskStatus },
    {
      taskCategory: task.task_category,
      hasGiaMeta: Array.isArray(task.task_gia_meta)
        ? task.task_gia_meta.length > 0
        : !!task.task_gia_meta,
    },
    {
      groupId: task.group_id,
      assignedTo: task.assigned_to,
      title: task.title,
      fromStatus: task.status,
    },
  );

  if (!result.ok) return { data: null, error: formErrors.generic };

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

  // 2. Auth + task fetch — independent, run in parallel
  const supabase = await createClient();

  const [caller, { data: existing }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("tasks")
      .select("id, assigned_to, created_by, group_id, due_at, status, title")
      .eq("id", taskId)
      .single(),
  ]);

  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!existing) return { data: null, error: "Task not found." };

  // 3. Application-layer authorization check (A-09 — layer 2). Session client
  //    runs the manager→group-domain lookup; the core stays ungated.
  const allowed = await canMutateTask(
    supabase,
    caller,
    existing as TaskMutationTarget,
  );
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  // 4. Write body + side-effects (update, reminder reschedule/cancel) → core.
  //    `due_at` presence in the parsed payload (not its value) decides a reschedule.
  const result = await updateTaskCore(
    actorFromProfile(caller),
    {
      taskId,
      title: fields.title,
      description: fields.description,
      priority: fields.priority as TaskPriority | undefined,
      status: fields.status as TaskStatus | undefined,
      assignedTo: fields.assigned_to,
      dueAt: fields.due_at,
      dueAtChanged: "due_at" in fields,
    },
    {
      assignedTo: existing.assigned_to,
      groupId: existing.group_id,
      title: existing.title,
      fromStatus: existing.status,
    },
  );

  if (!result.ok) return { data: null, error: formErrors.generic };

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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const supabase = await createClient();

  // 3. Fetch task to check authorization
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, assigned_to, created_by, group_id, task_category, task_gia_meta(task_id)",
    )
    .eq("id", taskId)
    .single();

  if (!task) return { data: null, error: "Task not found." };

  // 4. Authorization check
  if (caller.role === "agent") {
    const isOwner =
      task.created_by === caller.id && task.assigned_to === caller.id;
    if (!isOwner) return { data: null, error: formErrors.unauthorized };
  }
  // manager/admin/founder have unrestricted delete access

  console.log(
    `[deleteTaskAction] task_category=${task.task_category} taskId=${taskId} caller=${caller.id}`,
  );

  // 5. Write body + side-effects → core. NAMED INVARIANT (preserved in the core):
  //    cancel the Trigger.dev reminder BEFORE the DB delete, cancel failure is
  //    non-fatal. The category cache branch keys on actor.userId (pre-mortem note).
  const result = await deleteTaskCore(
    actorFromProfile(caller),
    { taskId },
    {
      taskCategory: task.task_category,
      hasGiaMeta: Array.isArray(task.task_gia_meta)
        ? task.task_gia_meta.length > 0
        : !!task.task_gia_meta,
    },
  );

  if (!result.ok) return { data: null, error: formErrors.generic };

  return { data: null, error: null };
}

// ─────────────────────────────────────────────
// Action: updateChecklistAction
// Replaces tasks.attachments with a new checklist items array.
// Checklist updates are intentionally excluded from log_task_changes —
// the trigger only watches title/description/status/priority/due_at/assigned_to.
// High-frequency checklist toggles must NOT flood task_audit_log.
// ─────────────────────────────────────────────
export async function updateChecklistAction(
  input: unknown,
): Promise<ActionResult<ChecklistItem[]>> {
  // 1. Zod validation first (Rule S-01)
  const parsed = UpdateChecklistSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, items } = parsed.data;

  // 2. Auth + task fetch — independent, run in parallel
  const supabase = await createClient();

  const [caller, { data: task }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("tasks")
      .select("id, assigned_to, created_by, group_id")
      .eq("id", taskId)
      .single(),
  ]);

  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!task) return { data: null, error: "Task not found." };

  // 3. Application-layer authorization check (A-09 — layer 2)
  const allowed = await canMutateTask(
    supabase,
    caller,
    task as TaskMutationTarget,
  );
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  // 4. Write new checklist — adminClient bypasses RLS UPDATE
  //    (application-layer access check above provides the security equivalent)
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("tasks")
    .update({ attachments: items })
    .eq("id", taskId);

  if (updateError) return { data: null, error: formErrors.generic };

  return { data: items as ChecklistItem[], error: null };
}

// ─────────────────────────────────────────────
// Action: updateTaskTagsAction
// Replaces tasks.tags with a new tags array.
// Supports up to 10 tags, each up to 50 chars.
// Used by: personal task detail view, CreatePersonalTaskModal (on edit).
// ─────────────────────────────────────────────
export async function updateTaskTagsAction(
  input: unknown,
): Promise<ActionResult<{ taskId: string }>> {
  // 1. Zod validation first (Rule S-01)
  const parsed = UpdateTaskTagsSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, tags } = parsed.data;

  // 2. Auth + task fetch — independent, run in parallel
  const supabase = await createClient();

  const [caller, { data: task }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("tasks")
      .select("id, assigned_to, created_by, group_id")
      .eq("id", taskId)
      .single(),
  ]);

  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!task) return { data: null, error: "Task not found." };

  // 3. Application-layer authorization check (A-09 — layer 2)
  const allowed = await canMutateTask(
    supabase,
    caller,
    task as TaskMutationTarget,
  );
  if (!allowed) return { data: null, error: formErrors.unauthorized };

  // 4. Write new tags array
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("tasks")
    .update({ tags })
    .eq("id", taskId);

  if (updateError) return { data: null, error: formErrors.generic };

  return { data: { taskId }, error: null };
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
  getPersonalTaskTags,
  getTaskGroupById,
} from "@/lib/services/tasks-service";
import type {
  PersonalTaskFilters,
  PersonalTasksResult,
} from "@/lib/services/tasks-service";
import type { TaskGroup } from "@/lib/types/database";

export async function getGroupSubtasksAction(
  groupId: string,
): Promise<ActionResult<SubtaskWithAssignee[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const rows = await getGroupSubtasks(groupId, caller.id);
  return { data: rows, error: null };
}

export async function getPersonalTasksAction(
  filters: PersonalTaskFilters = {},
): Promise<ActionResult<PersonalTasksResult>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const result = await getPersonalTasks(caller.id, filters);
  return { data: result, error: null };
}

export async function getPersonalTaskTagsAction(): Promise<
  ActionResult<string[]>
> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const tags = await getPersonalTaskTags(caller.id);
  return { data: tags, error: null };
}

export async function getTaskGroupByIdAction(
  groupId: string,
): Promise<ActionResult<TaskGroup>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const group = await getTaskGroupById(groupId);
  if (!group) return { data: null, error: "Group not found." };
  return { data: group, error: null };
}

// ─────────────────────────────────────────────
// Action: addTaskRemarkAction
// Inserts a task_remarks row via the add_task_remark_with_status RPC.
//
// When statusChange is present, the RPC handles both the tasks UPDATE and the
// task_remarks INSERT in a single transaction — 1 round-trip instead of 6
// sequential awaits (perf-02 pattern from migrations 0030/0031).
//
// Access control: if the user-scoped client can SELECT the task (RLS), they may
// post. RPC is SECURITY DEFINER via service role — no auth.uid() inside (00051).
//
// task_remarks is append-only — the RPC only INSERTs (Rule A-11).
// ─────────────────────────────────────────────
export async function addTaskRemarkAction(
  input: unknown,
): Promise<ActionResult<TaskRemark>> {
  // 1. Zod validation first (Rule S-01) — content sanitized by schema transform
  const parsed = AddTaskRemarkSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { taskId, content, statusChange } = parsed.data;

  // sanitizeText is called by the Zod transform; re-apply explicitly (Rule S-06)
  const sanitizedContent = sanitizeText(content);

  // 2. Auth — session required; task must be visible under tasks RLS (view = post)
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, group_id, assigned_to, title")
    .eq("id", taskId)
    .single();

  if (!task) return { data: null, error: formErrors.unauthorized };

  // 3. RPC — atomic optional status UPDATE + task_remarks INSERT
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: remark, error: rpcError } = await (admin as any).rpc(
    "add_task_remark_with_status",
    {
      p_task_id: taskId,
      p_author_id: caller.id,
      p_content: sanitizedContent,
      p_status_change: statusChange ?? null,
    },
  );

  if (rpcError) {
    if (rpcError.message?.includes("task_not_found"))
      return { data: null, error: "Task not found." };
    if (rpcError.message?.includes("unauthorized"))
      return { data: null, error: formErrors.unauthorized };
    return { data: null, error: formErrors.generic };
  }

  if (!remark) return { data: null, error: formErrors.generic };

  // Oversight event (best-effort, non-fatal). A remark's optional status change
  // rides the RPC (not updateTaskStatusCore), so the rail only learns of it via
  // this remark_added event — meta carries the status_change when present.
  const eventDomain = await resolveTaskDomain(admin, {
    groupId: task.group_id,
    assignedTo: task.assigned_to,
  });
  if (eventDomain) {
    await emitTaskEvent({
      taskId,
      domain: eventDomain,
      actorId: caller.id,
      subjectId: task.assigned_to,
      eventType: "remark_added",
      taskTitle: task.title,
      meta: statusChange ? { status_change: statusChange } : {},
    });
  }

  return { data: remark as TaskRemark, error: null };
}

// ─────────────────────────────────────────────
// Action: suppressTaskRemarkAction
// Soft-suppresses a task_remarks row. The row is never deleted.
// Only admin and founder may call this action.
//
// Column restriction note: the RLS UPDATE policy ("task_remarks_suppression_update")
// permits admin/founder to update ANY column on task_remarks. PostgreSQL RLS does
// not restrict which columns change — only which rows are eligible. This action
// enforces the restriction by writing ONLY the three suppression columns.
// Do not remove this comment; it documents why we use adminClient here.
// ─────────────────────────────────────────────
export async function suppressTaskRemarkAction(
  input: unknown,
): Promise<ActionResult<{ remarkId: string }>> {
  // 1. Zod validation first (Rule S-01)
  const parsed = SuppressTaskRemarkSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { messageId: remarkId } = parsed.data;

  // 2. Auth — admin and founder only
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const admin = createAdminClient();

  // 3. Verify remark exists (Rule S-06 — never trust client IDs)
  const { data: existing } = await admin
    .from("task_remarks")
    .select("id, task_id, is_suppressed")
    .eq("id", remarkId)
    .single();

  if (!existing) return { data: null, error: "Remark not found." };

  // Idempotent — no-op if already suppressed
  if (existing.is_suppressed) return { data: { remarkId }, error: null };

  // 4. Write only the three suppression columns (column restriction at action layer)
  const { error: updateError } = await admin
    .from("task_remarks")
    .update({
      is_suppressed: true,
      suppressed_by: caller.id,
      suppressed_at: new Date().toISOString(),
    })
    .eq("id", remarkId);

  if (updateError) return { data: null, error: formErrors.generic };

  return { data: { remarkId }, error: null };
}

// ─────────────────────────────────────────────
// Action: getTaskRemarksAction
// Client-callable read action for fetching task_remarks.
// Used when opening a SubTaskModal from a client component that cannot
// call the service layer directly (e.g. GroupTaskWorkspace, MyTasksCalendarView).
// ─────────────────────────────────────────────
export async function getTaskRemarksAction(
  taskId: string,
): Promise<ActionResult<TaskRemarkWithAuthor[]>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const remarks = await getTaskRemarks(taskId);
  return { data: remarks, error: null };
}

// ─────────────────────────────────────────────
// Action: deleteGroupTaskAction
// Authorization: admin/founder only — RLS enforces this at DB level.
//   Deleting a group cascades: tasks (ON DELETE CASCADE) → task_remarks.
// ─────────────────────────────────────────────
export async function deleteGroupTaskAction(
  input: unknown,
): Promise<ActionResult<null>> {
  // 1. Zod validation
  const parsed = DeleteGroupTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { groupId } = parsed.data;

  // 2. Auth — admin/founder only
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;

  // 3. Fetch group to verify it exists and get domain for cache invalidation
  const supabase = await createClient();
  const { data: group } = await supabase
    .from("task_groups")
    .select("id, domain")
    .eq("id", groupId)
    .single();

  if (!group) return { data: null, error: "Group task not found." };

  // 4. Delete — ON DELETE CASCADE removes all tasks (and their task_remarks) in this group
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("task_groups")
    .delete()
    .eq("id", groupId);

  if (deleteError) return { data: null, error: formErrors.generic };

  revalidatePath("/tasks");

  return { data: null, error: null };
}

// ─────────────────────────────────────────────
// getCompletedTasksAction — completed-tasks history modal
//
// Returns a target user's completed tasks (personal + group subtasks),
// recent-first, keyset-paginated. THE role/domain trust boundary:
//   - agent           → may only view themselves
//   - manager         → self, or anyone in their OWN domain
//   - admin / founder  → anyone
// The tasks SELECT RLS is permissive for manager+ (not domain-scoped), so this
// gate — not RLS — is what enforces the domain isolation. Agents are still
// RLS-restricted to their own rows as a second layer.
// ─────────────────────────────────────────────
export async function getCompletedTasksAction(
  input: unknown,
): Promise<ActionResult<CompletedTasksResult>> {
  const parsed = CompletedTasksQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const { targetUserId, cursor } = parsed.data;

  // Authorization gate.
  if (targetUserId !== caller.id) {
    if (caller.role === "agent") {
      return { data: null, error: formErrors.unauthorized };
    }
    if (caller.role === "manager") {
      // Manager may only reach into their own domain.
      const target = await getProfileById(targetUserId);
      if (!target || target.domain !== caller.domain) {
        return { data: null, error: formErrors.unauthorized };
      }
    }
    // admin / founder → any target, no further check.
  }

  const result = await getCompletedTasks(targetUserId, cursor ?? null);
  return { data: result, error: null };
}
