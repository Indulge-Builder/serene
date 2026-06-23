// Task mutation cores — THE shared, context-free body of the six action-shaped
// task writes. SERVER ONLY.
//
// Why this file exists (R-01 / Q-13): the six task-write actions in
// src/lib/actions/tasks.ts begin with requireProfile()/getCurrentProfile() (a
// SESSION) + a session Supabase client. Elaya's write tools (Brief 3) must run
// the SAME mutations from a context with NO session (in-app the identity must be
// the Elaya principal, not re-derived from cookies). So the mutation body — the
// raw insert/update/delete + every context-free side-effect (Trigger.dev
// reminder schedule/cancel, createNotification fan-out, the awaited Redis
// invalidations) — lives here, taking an explicit actor. Both the action
// (session caller) and the write tool (Elaya principal) are thin callers.
//
// These are DIRECT table writes (no SECURITY DEFINER RPC, unlike the lead cores):
// the `tasks` / `task_groups` inserts/updates/deletes go through the admin client,
// which bypasses RLS — so the CALLER is the trust boundary (Q-13). Each caller
// verifies access BEFORE calling a core: the action runs requireProfile()/
// getCurrentProfile() + canMutateTask(); the future tool resolves the Elaya
// principal + canMutateTask(). The cores do NOT re-fetch for access — exactly as
// the actions trust their own pre-checks today.
//
// What deliberately does NOT live here (request/action-context only — cannot run
// in the Elaya WhatsApp after()/webhook context):
//   • revalidatePath — stays in the action wrapper; off-channel there is no RSC
//     page to revalidate and the awaited Redis dels below are what guarantee
//     freshness on the next in-app read.
//   • canMutateTask — the per-resource access GATE, run by the caller BEFORE a
//     core (it lives here only so a non-action caller can import it; it is never
//     called from inside a core).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/constants/redis-keys";
import { createNotification } from "@/lib/services/notifications-service";
import {
  scheduleTaskReminder,
  cancelTaskReminder,
} from "@/trigger/task-reminders";
import { emitTaskEvent, resolveTaskDomain } from "@/lib/services/task-events";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  AppDomain,
} from "@/lib/types/database";
import type { SubtaskWithAssignee } from "@/lib/services/tasks-service";

// MutationActor (principal-derived identity, never a session) is reused verbatim
// from lead-mutations.ts — do NOT redefine it (R-01). Re-exported here so task
// callers have one import for the actor type alongside the cores.
export type { MutationActor };

// Terminal statuses — no reminders needed beyond these. Mirrors tasks.ts.
const TERMINAL_STATUSES: TaskStatus[] = ["completed", "cancelled", "error"];

// ─────────────────────────────────────────────
// Authorization GATE — canMutateTask (A-09) — CALLER-SIDE, never inside a core.
//
// Moved verbatim from actions/tasks.ts so a non-action caller (an Elaya write
// tool, Brief 3) can import it. The only change vs the old in-action version:
// it takes the Supabase client to run the manager→group-domain lookup, instead
// of calling createClient() internally. The action passes its SESSION client
// (byte-identical behaviour); a future tool passes the admin client. Keeping
// createClient() inside would have hard-bound this to a request with cookies.
//
// adminClient bypasses RLS, so the application layer must enforce the same access
// rules RLS would. Never skip this. Rules (mirror the tasks RLS UPDATE policy +
// task_groups domain scope):
//   agent     → assigned_to = caller.id OR created_by = caller.id
//   manager   → same as agent, OR group_subtask in caller's domain
//   admin/founder → always allowed
// ─────────────────────────────────────────────
export type CallerProfile = { id: string; role: string; domain: string };
export type TaskMutationTarget = {
  assigned_to: string | null;
  created_by: string | null;
  group_id: string | null;
};

export async function canMutateTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  caller: CallerProfile,
  task: TaskMutationTarget,
): Promise<boolean> {
  // admin and founder are unrestricted
  if (caller.role === "admin" || caller.role === "founder") return true;

  // Direct ownership — applies to every role
  if (task.assigned_to === caller.id || task.created_by === caller.id)
    return true;

  // Manager: additionally permitted on group subtasks in their own domain
  if (caller.role === "manager" && task.group_id) {
    const { data: group } = await client
      .from("task_groups")
      .select("domain")
      .eq("id", task.group_id)
      .single();
    if (group?.domain === caller.domain) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// createPersonalTaskCore — personal task insert.
// Mirrors createPersonalTaskAction. Notifies the assignee if different from the
// actor; schedules a Trigger.dev reminder if due_at is set. Owns BOTH Redis dels
// (assignee's page-1 personal list + actor's dashboard agent-tasks widget) —
// converted to awaited try/catch per P-08.
//
// Caller contract: the caller has already verified the actor may assign to
// `assignedTo` (manager+ for a cross-user assignment) — the core trusts it.
// ─────────────────────────────────────────────
export async function createPersonalTaskCore(
  actor: MutationActor,
  input: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueAt: string | null;
    assignedTo: string | null;
    tags: string[];
  },
): Promise<
  | { ok: true; taskId: string; assignedTo: string; createdBy: string }
  | { ok: false }
> {
  const resolvedAssignedTo = input.assignedTo ?? actor.userId;

  const admin = createAdminClient();

  const { data: task, error: insertError } = await admin
    .from("tasks")
    .insert({
      assigned_to: resolvedAssignedTo,
      created_by: actor.userId,
      module: "core", // a plain personal task belongs to the core module
      task_type: "other",
      task_category: "personal",
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "to_do",
      due_at: input.dueAt,
      group_id: null,
      tags: input.tags,
    })
    .select("id")
    .single();

  if (insertError || !task) return { ok: false };

  const taskId = task.id as string;

  // Notify assignee — fire-and-forget, non-fatal (if different from the actor).
  if (resolvedAssignedTo !== actor.userId) {
    createNotification({
      recipient_id: resolvedAssignedTo,
      type: "task_assigned",
      notificationKey: "task_assigned",  // SEAM A — per-user control plane (0133)
      title: `New task: ${input.title}`,
      body: `Assigned to you by ${actor.fullName}`,
      action_url: `/tasks`,
    }).catch(() => {});
  }

  // Schedule reminder if due_at is set — fire-and-forget, never blocks.
  if (input.dueAt) {
    scheduleTaskReminder(
      taskId,
      new Date(input.dueAt),
      resolvedAssignedTo,
    ).catch(() => {});
  }

  // Awaited Redis dels (P-08). Two branches, both kept:
  //   • assignee's page-1 personal list — the person who now owns the task.
  //   • actor's dashboard agent-tasks widget (30s TTL) — actor.userId is the
  //     server-verified caller, never a client-supplied value.
  try {
    await Promise.all([
      redis.del(REDIS_KEYS.task.personalPage1(resolvedAssignedTo)),
      redis.del(REDIS_KEYS.dashboardAgentTasks(actor.userId)),
    ]);
  } catch (e) {
    console.warn("[task-mutations] redis del failed on createPersonalTaskCore", e);
  }

  // Oversight event (best-effort, non-fatal). Personal task → no group, so the
  // derived domain is the assignee's. resolveTaskDomain owns that lookup (R-01).
  const admin2 = createAdminClient();
  const domain = await resolveTaskDomain(admin2, {
    groupId: null,
    assignedTo: resolvedAssignedTo,
  });
  await emitTaskEvent({
    taskId,
    domain,
    actorId: actor.userId,
    subjectId: resolvedAssignedTo,
    eventType: "created",
    taskTitle: input.title,
    meta: { priority: input.priority, task_type: "other" },
  });

  return {
    ok: true,
    taskId,
    assignedTo: resolvedAssignedTo,
    createdBy: actor.userId,
  };
}

// ─────────────────────────────────────────────
// createGroupTaskCore — task_group insert (no subtasks).
// Mirrors createGroupTaskAction. Domain locked to the actor's domain except for
// admin/founder. Owns the creator's group-list Redis del (awaited, P-08).
// ─────────────────────────────────────────────
export async function createGroupTaskCore(
  actor: MutationActor,
  input: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueAt: string | null;
    domain: string;
  },
): Promise<{ ok: true; groupId: string } | { ok: false }> {
  // Domain enforcement — non-privileged actors locked to own domain.
  // input.domain is Zod-validated only as a non-empty string (not the enum); the
  // task_groups.domain app_domain CHECK is the backstop on an invalid value.
  const resolvedDomain = (
    ["admin", "founder"].includes(actor.role) ? input.domain : actor.domain
  ) as AppDomain;

  const admin = createAdminClient();

  const { data: group, error: insertError } = await admin
    .from("task_groups")
    .insert({
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "to_do",
      due_at: input.dueAt,
      created_by: actor.userId,
      domain: resolvedDomain,
    })
    .select("id")
    .single();

  if (insertError || !group) return { ok: false };

  // Creator's group list cache (user-scoped key per migration 0058). Awaited (P-08).
  try {
    await redis.del(REDIS_KEYS.task.groupList(actor.userId));
  } catch (e) {
    console.warn("[task-mutations] redis del failed on createGroupTaskCore", e);
  }

  return { ok: true, groupId: group.id as string };
}

// ─────────────────────────────────────────────
// createSubtaskCore — group_subtask insert under an existing task_group.
// Mirrors createSubtaskAction. BOTH side-effects kept (failure mode b):
//   • notifies the assignee (when different from the actor);
//   • touches the group-list cache for creator AND assignee.
// Resolves the assignee profile for the client's local prepend. Schedules a
// reminder if due_at is set.
//
// Caller contract: the caller has already verified the group exists and the actor
// may create a subtask in it (the agent→same-domain check). The core trusts it.
// ─────────────────────────────────────────────
export async function createSubtaskCore(
  actor: MutationActor,
  input: {
    groupId: string;
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueAt: string | null;
    assignedTo: string;
  },
): Promise<{ ok: true; subtask: SubtaskWithAssignee } | { ok: false }> {
  const admin = createAdminClient();

  // Insert subtask — select the full row for the client's local prepend.
  const { data: task, error: insertError } = await admin
    .from("tasks")
    .insert({
      assigned_to: input.assignedTo,
      created_by: actor.userId,
      module: "core", // a group subtask is core, not gia
      task_type: "other",
      task_category: "group_subtask",
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "to_do",
      due_at: input.dueAt,
      group_id: input.groupId,
    })
    .select("*")
    .single();

  if (insertError || !task) return { ok: false };

  const taskId = task.id as string;

  // Resolve assignee profile — one extra query, zero extra client round-trips.
  // Failure is non-fatal; assignee renders null (avatar falls back).
  let assignee: SubtaskWithAssignee["assignee"] = null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", input.assignedTo)
    .single();
  if (profile) {
    assignee = {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    };
  }

  // Group-list cache for creator AND assignee (migration 0058: user-scoped key).
  // Assignee's cache must refresh so they see the parent group they were just
  // assigned in; creator's refreshes the updated subtask count. Awaited (P-08).
  const keysToInvalidate = [REDIS_KEYS.task.groupList(actor.userId)];
  if (input.assignedTo !== actor.userId) {
    keysToInvalidate.push(REDIS_KEYS.task.groupList(input.assignedTo));
  }
  try {
    await Promise.all(keysToInvalidate.map((k) => redis.del(k)));
  } catch (e) {
    console.warn(
      "[task-mutations] redis del failed on createSubtaskCore group lists",
      e,
    );
  }

  // Notify assignee — fire-and-forget, non-fatal (always notify for subtasks).
  if (input.assignedTo !== actor.userId) {
    createNotification({
      recipient_id: input.assignedTo,
      type: "task_assigned",
      notificationKey: "task_assigned",  // SEAM A — per-user control plane (0133)
      title: `New task: ${input.title}`,
      body: `Assigned to you by ${actor.fullName}`,
      action_url: `/tasks`,
    }).catch(() => {});
  }

  // Schedule reminder if due_at is set.
  if (input.dueAt) {
    scheduleTaskReminder(taskId, new Date(input.dueAt), input.assignedTo).catch(
      () => {},
    );
  }

  // Oversight event (best-effort, non-fatal). A subtask's domain is its group's
  // domain (resolveTaskDomain prefers the group path). subject = the assignee.
  const domain = await resolveTaskDomain(admin, {
    groupId: input.groupId,
    assignedTo: input.assignedTo,
  });
  await emitTaskEvent({
    taskId,
    domain,
    actorId: actor.userId,
    subjectId: input.assignedTo,
    eventType: "created",
    taskTitle: input.title,
    meta: { priority: input.priority, task_type: "other" },
  });

  return {
    ok: true,
    subtask: { ...(task as Task), assignee },
  };
}

// ─────────────────────────────────────────────
// updateTaskStatusCore — targeted status change.
// Mirrors updateTaskStatusAction. Cancels the Trigger.dev reminder on terminal
// status; the cache branches key on actor.userId DELIBERATELY (the pre-mortem
// note in actions/tasks.ts — the giaList del targets the ACTOR's Gia list, NOT
// task.assigned_to). actor.userId/role/domain preserve that exact keying; do NOT
// "fix" it to assigned_to. The giaList del now triggers on hasGiaMeta
// (meta-presence) — a lead follow-up IFF a task_gia_meta row exists, never via a
// (deleted) task_category check. A lead follow-up is BOTH personal AND hasGiaMeta,
// so it dels personalPage1 AND giaList (correct). Plus the actor's dashboard
// widget del.
//
// Caller contract: the caller has fetched the task, confirmed it exists, and run
// canMutateTask. The core trusts it — and never queries task_gia_meta itself; the
// caller fetches the meta-presence flag and passes it in (hard invariant for Elaya
// reuse — the cores stay context-free). Takes the task's current category +
// hasGiaMeta so it can pick the right cache branches without re-fetching.
// ─────────────────────────────────────────────
export async function updateTaskStatusCore(
  actor: MutationActor,
  input: { taskId: string; status: TaskStatus },
  taskCtx: { taskCategory: string | null; hasGiaMeta: boolean },
  // The caller already fetched the task — pass its snapshot so the oversight
  // event can resolve domain/subject + the old→new status WITHOUT a re-fetch
  // (the core stays context-free, same discipline as taskCtx). Optional so any
  // legacy caller still compiles; absent → the event is skipped.
  eventCtx?: {
    groupId: string | null;
    assignedTo: string | null;
    title: string | null;
    fromStatus: string | null;
  },
): Promise<{ ok: true } | { ok: false }> {
  const admin = createAdminClient();

  const { error: updateError } = await admin
    .from("tasks")
    .update({
      status: input.status,
      ...(input.status === "completed"
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", input.taskId);

  if (updateError) return { ok: false };

  // Cancel reminder when moving to terminal status.
  if (TERMINAL_STATUSES.includes(input.status)) {
    cancelTaskReminder(input.taskId).catch(() => {});
  }

  // Awaited Redis dels (P-08). Cache branches + dashboard widget collapsed into
  // one awaited Promise.all, all keyed on actor.userId/role/domain — the
  // deliberate pre-mortem keying, preserved exactly. A lead follow-up is BOTH a
  // personal task AND hasGiaMeta, so it dels personalPage1 AND giaList (correct).
  const dels = [redis.del(REDIS_KEYS.dashboardAgentTasks(actor.userId))];
  if (taskCtx.taskCategory === "personal") {
    dels.push(redis.del(REDIS_KEYS.task.personalPage1(actor.userId)));
  }
  if (taskCtx.hasGiaMeta) {
    dels.push(
      redis.del(REDIS_KEYS.task.giaList(actor.userId, actor.role, actor.domain)),
    );
  }
  try {
    await Promise.all(dels);
  } catch (e) {
    console.warn("[task-mutations] redis del failed on updateTaskStatusCore", e);
  }

  // Oversight event (best-effort, non-fatal) — proves the live rail without a
  // remark (the sign-off case: a status change that writes NO remark row).
  if (eventCtx) {
    const domain = await resolveTaskDomain(admin, {
      groupId: eventCtx.groupId,
      assignedTo: eventCtx.assignedTo,
    });
    await emitTaskEvent({
      taskId: input.taskId,
      domain,
      actorId: actor.userId,
      subjectId: eventCtx.assignedTo,
      eventType: "status_changed",
      taskTitle: eventCtx.title,
      meta: { from: eventCtx.fromStatus, to: input.status },
    });
  }

  return { ok: true };
}

// ─────────────────────────────────────────────
// updateTaskCore — full update (partial fields). Mirrors updateTaskAction.
// On a due_at change: cancel the old reminder, schedule a new one for the
// (possibly new) assignee. On a terminal status with no due_at change: cancel as
// a safety net. No Redis del branch — matches updateTaskAction (it never had one).
//
// Caller contract: the caller has fetched the existing task, confirmed it exists,
// and run canMutateTask. The core takes the existing assigned_to so it can
// resolve the reminder's recipient when the patch doesn't change it.
// ─────────────────────────────────────────────
export async function updateTaskCore(
  actor: MutationActor,
  input: {
    taskId: string;
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    assignedTo?: string;
    dueAt?: string | null;
    dueAtChanged: boolean;
  },
  // `groupId`/`title`/`fromStatus` are optional so the existing single-field
  // callers still compile; when present the oversight event(s) fire (a
  // reassigned and/or status_changed). The caller already fetched the task.
  existing: {
    assignedTo: string | null;
    groupId?: string | null;
    title?: string | null;
    fromStatus?: string | null;
  },
): Promise<{ ok: true } | { ok: false }> {
  const admin = createAdminClient();

  const updatePayload: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    assigned_to?: string;
    due_at?: string | null;
    completed_at?: string | null;
  } = {};

  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.description !== undefined)
    updatePayload.description = input.description;
  if (input.priority !== undefined) updatePayload.priority = input.priority;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.assignedTo !== undefined)
    updatePayload.assigned_to = input.assignedTo;
  if (input.dueAtChanged) updatePayload.due_at = input.dueAt ?? null;
  if (input.status === "completed")
    updatePayload.completed_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("tasks")
    .update(updatePayload)
    .eq("id", input.taskId);

  if (updateError) return { ok: false };

  // Reminder management — cancel old, schedule new when due_at changes.
  if (input.dueAtChanged) {
    await cancelTaskReminder(input.taskId).catch(() => {});

    const newDueAt = input.dueAt ? new Date(input.dueAt) : null;
    const assignedTo = (input.assignedTo ?? existing.assignedTo) as string;

    if (newDueAt && assignedTo) {
      scheduleTaskReminder(input.taskId, newDueAt, assignedTo).catch(() => {});
    }
  }

  // Terminal status with no due_at change — cancel reminder (safety net).
  if (
    input.status &&
    TERMINAL_STATUSES.includes(input.status) &&
    !input.dueAtChanged
  ) {
    cancelTaskReminder(input.taskId).catch(() => {});
  }

  // Oversight events (best-effort, non-fatal). One full update can carry both a
  // reassign and a status change — emit each that actually happened. Domain is
  // resolved against the NEW assignee (a cross-team reassignment legitimately
  // moves the task's events to the new team — docs/oversight.md §4c, correct).
  if (existing.groupId !== undefined) {
    const newAssignee = input.assignedTo ?? existing.assignedTo;
    const reassigned =
      input.assignedTo !== undefined &&
      input.assignedTo !== existing.assignedTo;
    const statusChanged =
      input.status !== undefined && input.status !== existing.fromStatus;

    if (reassigned || statusChanged) {
      const domain = await resolveTaskDomain(admin, {
        groupId: existing.groupId,
        assignedTo: newAssignee,
      });
      if (reassigned) {
        await emitTaskEvent({
          taskId: input.taskId,
          domain,
          actorId: actor.userId,
          subjectId: newAssignee,
          eventType: "reassigned",
          taskTitle: input.title ?? existing.title ?? null,
          meta: { from: existing.assignedTo, to: newAssignee },
        });
      }
      if (statusChanged) {
        await emitTaskEvent({
          taskId: input.taskId,
          domain,
          actorId: actor.userId,
          subjectId: newAssignee,
          eventType: "status_changed",
          taskTitle: input.title ?? existing.title ?? null,
          meta: { from: existing.fromStatus, to: input.status },
        });
      }
    }
  }

  return { ok: true };
}

// ─────────────────────────────────────────────
// deleteTaskCore — task delete. Mirrors deleteTaskAction.
//
// NAMED INVARIANT (failure mode c): the Trigger.dev reminder is cancelled BEFORE
// the DB delete, and a cancel FAILURE is non-fatal (logged, then proceed) — a
// missed reminder cancel is recoverable, a broken delete UX is not. The ordering
// is preserved exactly: cancel → delete. Same cache branches as
// updateTaskStatusCore, keyed on actor.userId (the deliberate pre-mortem keying).
// The giaList del now triggers on hasGiaMeta (meta-presence) — a lead follow-up
// IFF a task_gia_meta row exists, never via a (deleted) task_category check; a
// lead follow-up is BOTH personal AND hasGiaMeta, so it dels both keys.
//
// Caller contract: the caller has fetched the task, confirmed it exists, and run
// the delete-authorization check. The core trusts it — and never queries
// task_gia_meta itself; the caller fetches the meta-presence flag and passes it in
// (hard invariant for Elaya reuse — the cores stay context-free). The core takes
// the task's category + hasGiaMeta for the cache branches.
// ─────────────────────────────────────────────
export async function deleteTaskCore(
  actor: MutationActor,
  input: { taskId: string },
  taskCtx: { taskCategory: string | null; hasGiaMeta: boolean },
): Promise<{ ok: true } | { ok: false }> {
  // Cancel Trigger.dev reminder BEFORE the DB delete. A cancel failure (no runs
  // found, SDK error, network) is non-fatal — log and continue.
  try {
    await cancelTaskReminder(input.taskId);
  } catch (e) {
    console.error("[task-mutations] cancelTaskReminder failed (non-fatal):", e);
  }

  // Delete task — cascade removes task_remarks (ON DELETE CASCADE on task_id).
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("tasks")
    .delete()
    .eq("id", input.taskId);

  if (deleteError) return { ok: false };

  // Awaited Redis del (P-08). Cache branches keyed on actor.userId — the
  // deliberate pre-mortem keying, preserved exactly (NOT task.assigned_to). A lead
  // follow-up is BOTH personal AND hasGiaMeta, so it dels both keys (correct).
  if (taskCtx.taskCategory === "personal") {
    try {
      await redis.del(REDIS_KEYS.task.personalPage1(actor.userId));
    } catch (e) {
      console.warn("[task-mutations] redis del failed on deleteTaskCore", e);
    }
  }
  if (taskCtx.hasGiaMeta) {
    try {
      await redis.del(
        REDIS_KEYS.task.giaList(actor.userId, actor.role, actor.domain),
      );
    } catch (e) {
      console.warn("[task-mutations] redis del failed on deleteTaskCore", e);
    }
  }

  return { ok: true };
}
