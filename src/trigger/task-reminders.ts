/**
 * task-reminders.ts
 * One-time Trigger.dev reminder jobs for OS Tasks.
 *
 * Exports:
 *   scheduleTaskReminder(taskId, dueAt, assignedTo) — arms the at-due reminder
 *                                                     AND the -30m due-soon
 *                                                     WhatsApp; no-op if dueAt
 *                                                     is in the past
 *   cancelTaskReminder(taskId)                      — cancels any pending run for this task
 *                                                     (due-soon, due reminder AND
 *                                                     overdue check — same tag)
 *   sendTaskDueSoonTask   — at due − 30 min: TASK-01A WhatsApp "due soon" to the
 *                           assigned agent for EVERY still-open task (lead or
 *                           not), via getTaskWithAssignee
 *   sendTaskReminderTask  — at due: task_due in-app for every category; the
 *                           TASK-01A agent overdue WhatsApp for EVERY still-open
 *                           task (lead-agnostic, getTaskWithAssignee); plus for
 *                           lead-linked tasks (a task_gia_meta row exists) the
 *                           lead-shaped TASK-01A reminder and arming of the
 *                           TASK-01B overdue check
 *   checkTaskOverdueTask  — at due + TASK-01B threshold: clearing-event checks,
 *                           exactly-once tasks.overdue_at stamp, domain-manager
 *                           escalation (in-app + WhatsApp)
 *
 * Both task definitions must be exported so Trigger.dev discovers them during
 * the build scan. Policy rows (TASK-01A/B in sla_policies) are read per run.
 *
 * ── Idempotency key deduplication guarantee (race window analysis) ──────────
 *
 * scheduleTaskReminder passes `idempotencyKey: 'task-reminder-${taskId}'` to
 * tasks.trigger(). Trigger.dev v3 deduplicates by idempotency key for all
 * non-terminal run states, including DELAYED.
 *
 * Evidence from SDK source (v4.4.6):
 *   - apiClient.triggerTask() returns `{ id, isCached?: boolean }` where
 *     isCached: true means the existing run was returned — no new run created.
 *     Source: @trigger.dev/core dist/esm/v3/apiClient/index.d.ts line 55.
 *   - trigger_internal (the function backing tasks.trigger()) calls triggerTask
 *     with the processed idempotencyKey and returns the handle directly.
 *     Source: @trigger.dev/sdk dist/esm/v3/shared.js lines 1063–1110.
 *
 * Consequence for the concurrent update scenario:
 *   - Agent A updates due_at → cancelTaskReminder runs → calls runs.cancel(run-123) ✓
 *   - Agent B simultaneously updates due_at → scheduleTaskReminder fires while
 *     run-123 is still DELAYED with key 'task-reminder-${taskId}'
 *   - Trigger.dev returns run-123 handle with isCached: true → no run-456 is created
 *   - Agent A's cancel correctly cancels run-123
 *   - There is no orphaned run: the race window is closed by the SDK guarantee.
 *
 * When cancelTaskReminder is called AFTER the old run is already CANCELLED:
 *   - runs.list returns an empty array → the function returns early (no-op).
 *   - A subsequent scheduleTaskReminder call creates a new run with the same
 *     idempotency key (the old run is terminal, so the key is no longer active).
 *
 * No run ID storage in the DB is required. The tag-based cancel in
 * cancelTaskReminder is safe: it only has a list-snapshot race if two
 * DISTINCT DELAYED runs can exist simultaneously — which the idempotency
 * guarantee above makes impossible.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Pattern: tag each run with `task-reminder-${taskId}` so cancelTaskReminder
 * can find and cancel without needing to store the run ID.
 */

import { task, tasks } from "@trigger.dev/sdk/v3";

// ─────────────────────────────────────────────
// Oversight overdue event — emit ONE task_events 'overdue' row after the
// once-only overdue_at stamp (checkTaskOverdueTask). System actor (no human).
// Server-only deps are dynamic-imported so they stay out of the Trigger.dev
// build scan (the file's convention). Best-effort: emitTaskEvent never throws.
// Domain is the ASSIGNEE's (work-ownership axis), via resolveTaskDomain — lead
// overdue tasks are personal (no group), so groupId: null falls to the assignee.
// ─────────────────────────────────────────────
async function emitOverdueEvent(
  taskId: string,
  assignedTo: string | null,
  title: string | null,
  dueAt: string | null,
): Promise<void> {
  const { emitTaskEvent, resolveTaskDomain } = await import(
    "@/lib/services/task-events"
  );
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const domain = await resolveTaskDomain(createAdminClient(), {
    groupId: null,
    assignedTo,
  });
  await emitTaskEvent({
    taskId,
    domain,
    actorId: null,
    subjectId: assignedTo,
    eventType: "overdue",
    taskTitle: title,
    meta: { due_at: dueAt },
  });
}

// ─────────────────────────────────────────────
// Task definition — must be exported for Trigger.dev scan
// ─────────────────────────────────────────────

export const sendTaskReminderTask = task({
  id: "send-task-reminder",
  retry: { maxAttempts: 3 },
  run: async (payload: { taskId: string; assignedTo: string }) => {
    // Dynamic import to avoid SSR import of server-only modules at module level.
    // The notification is fire-and-forget — a failed reminder never fails the job.
    const { createNotification } =
      await import("@/lib/services/notifications-service");
    await createNotification({
      recipient_id: payload.assignedTo,
      type: "task_due",
      notificationKey: "task_due",  // SEAM A — per-user control plane (0133)
      title: "Task due now",
      body: "A task assigned to you is due.",
      action_url: `/tasks`,
    }).catch((err: unknown) => {
      console.error("[send-task-reminder] notification failed:", err);
    });

    // ── Agent overdue WhatsApp — EVERY task (lead or not), at the due moment ──
    // This is the agent's own "your task just went overdue" ping. It fires for
    // any still-open task via getTaskWithAssignee (no task_gia_meta dependency).
    // The lead manager escalation below (TASK-01B) is separate and unchanged.
    // Gated by TASK-01A.active + the 'whatsapp' channel so it shares the same
    // on/off switch as the due-soon reminder.
    try {
      const { getSlaPolicy, getTaskWithAssignee } =
        await import("@/lib/services/sla-service");

      const duePolicy = await getSlaPolicy("TASK-01A");
      if (duePolicy?.active && duePolicy.channels.includes("whatsapp")) {
        const actx = await getTaskWithAssignee(payload.taskId);
        // Only ping if the task is still open at its due time.
        if (
          actx?.assignee &&
          actx.task.due_at &&
          ["to_do", "in_progress", "in_review"].includes(actx.task.status)
        ) {
          const dueTimeIst = new Date(actx.task.due_at).toLocaleTimeString("en-US", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          const { sendTaskOverdueAgentNotification } =
            await import("@/lib/services/whatsapp-api");
          // Awaited so the Gupshup send settles before the run completes.
          await sendTaskOverdueAgentNotification(
            actx.assignee.id,
            actx.assignee.phone,
            actx.assignee.first_name,
            actx.task.title,
            dueTimeIst,
          );
        }
      }
    } catch (err) {
      console.error("[send-task-reminder] agent overdue WhatsApp failed:", err);
    }

    // ── Overdue check arming — EVERY task (lead or not) ──────────────────────
    // TASK-01B fires at due + threshold and escalates to a manager. For lead
    // tasks the manager pool is the lead's domain; for non-lead tasks it is the
    // assignee's manager (reports_to → domain). The check itself branches; here
    // we just arm it for any still-open task with a due date.
    try {
      const { getSlaPolicy, getTaskWithAssignee } =
        await import("@/lib/services/sla-service");

      const actx = await getTaskWithAssignee(payload.taskId);
      const overduePolicy = await getSlaPolicy("TASK-01B");
      if (
        overduePolicy?.active &&
        actx?.task.due_at &&
        ["to_do", "in_progress", "in_review"].includes(actx.task.status)
      ) {
        await scheduleTaskOverdueCheck(
          payload.taskId,
          new Date(actx.task.due_at),
          overduePolicy.threshold_minutes,
        );
      }
    } catch (err) {
      console.error("[send-task-reminder] overdue-check arming failed:", err);
    }

    // ── Phase 2 (config-driven engine): lead-linked due-time extension ───────
    // TASK-01A: lead-shaped WhatsApp reminder to the assigned agent — lead-linked
    // tasks (a task_gia_meta row exists) ONLY (the template carries lead name +
    // phone; non-lead tasks already got the task-shaped agent ping above).
    // Policies are read PER RUN — never cached at module scope.
    try {
      const { getSlaPolicy, getTaskWithGiaContext } =
        await import("@/lib/services/sla-service");

      const ctx = await getTaskWithGiaContext(payload.taskId);
      if (!ctx || !ctx.lead) return;
      if (!ctx.task.due_at) return;
      if (!["to_do", "in_progress", "in_review"].includes(ctx.task.status)) return;

      const leadFirst = ctx.lead.first_name ?? "A lead";
      const leadName = ctx.lead.last_name
        ? `${leadFirst} ${ctx.lead.last_name}`
        : leadFirst;

      const duePolicy = await getSlaPolicy("TASK-01A");
      if (duePolicy?.active && duePolicy.channels.includes("whatsapp")) {
        const { sendTaskDueReminderNotification } =
          await import("@/lib/services/whatsapp-api");
        // Awaited so the Gupshup send settles before the run completes
        // (same contract as the SLA breach sends). Swallows its own errors.
        await sendTaskDueReminderNotification(
          ctx.task.assigned_to, // fresh from DB — payload.assignedTo may predate a reassign
          leadName,
          ctx.lead.phone ?? "",
          ctx.task.title,
          ctx.lead.id,
        );
      }
    } catch (err) {
      console.error("[send-task-reminder] gia due-time extension failed:", err);
    }
  },
});

// ─────────────────────────────────────────────
// Overdue escalation — check-task-overdue (Phase 2, policy TASK-01B)
// Fires at due_at + threshold for EVERY task. Clearing events (any one exits
// silently): task completed/cancelled · due_at moved · (lead tasks only) a lead
// activity logged after due. Otherwise stamps tasks.overdue_at EXACTLY ONCE
// (UPDATE … WHERE overdue_at IS NULL — the losing racer gets zero rows and must
// not notify), then escalates to a manager:
//   • lead task     → the lead's domain managers, lead-shaped template
//   • non-lead task → the assignee's manager (reports_to → domain), task-shaped
// ─────────────────────────────────────────────

export const checkTaskOverdueTask = task({
  id: "check-task-overdue",
  retry: { maxAttempts: 3 },
  run: async (payload: { taskId: string; dueAt: string }) => {
    const {
      getSlaPolicy,
      getTaskWithGiaContext,
      getTaskWithAssignee,
      getAssigneeManagers,
      hasLeadActivityAfter,
      markTaskOverdueOnce,
      getManagersByDomain,
      getProfileFullName,
    } = await import("@/lib/services/sla-service");

    // Policy per run — a deactivated TASK-01B silences pending checks too.
    const policy = await getSlaPolicy("TASK-01B");
    if (!policy?.active) return;

    const ctx = await getTaskWithGiaContext(payload.taskId);
    if (!ctx) return;

    // Clearing event 1: task closed.
    if (["completed", "cancelled"].includes(ctx.task.status)) return;

    // Due date moved since this check was armed — the new due's own reminder
    // chain owns the task now. (Numeric compare: PG and JS render ISO differently.)
    if (
      !ctx.task.due_at ||
      new Date(ctx.task.due_at).getTime() !== new Date(payload.dueAt).getTime()
    ) {
      return;
    }

    // IST human time, "4:00 PM" — never UTC, never ISO (template due-time contract).
    const dueTimeIst = new Date(ctx.task.due_at).toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const agentName =
      (await getProfileFullName(ctx.task.assigned_to)) ?? "Unassigned";

    // ── Lead task path — byte-identical to the original behaviour ────────────
    if (ctx.lead) {
      const lead = ctx.lead; // capture — narrowing doesn't survive into closures

      // Clearing event 2 (lead only): the agent did something on this lead after due.
      if (await hasLeadActivityAfter(lead.id, ctx.task.due_at)) return;

      // Exactly-once stamp — losing a race (or a retry after a crash mid-notify
      // already stamped) exits without a duplicate escalation.
      const stamped = await markTaskOverdueOnce(payload.taskId, new Date());
      if (!stamped) return;

      // Oversight event — emitted ONCE, right after the once-only stamp (a retry
      // that lost the stamp returns above, so no duplicate event). System actor
      // (no human caused it); domain = the assignee's (work-ownership axis), not
      // the lead's — resolveTaskDomain owns that derivation (R-01).
      await emitOverdueEvent(payload.taskId, ctx.task.assigned_to, ctx.task.title, ctx.task.due_at);

      const managers = await getManagersByDomain(lead.domain);
      if (managers.length === 0) {
        console.error(
          `[check-task-overdue] no escalation target: task=${payload.taskId} domain=${lead.domain}`,
        );
        return;
      }
      const managerIds = managers.map((m) => m.id);

      const leadFirst = lead.first_name ?? "A lead";
      const leadName = lead.last_name ? `${leadFirst} ${lead.last_name}` : leadFirst;

      if (policy.channels.includes("in_app")) {
        const { createNotification } =
          await import("@/lib/services/notifications-service");
        await Promise.allSettled(
          managerIds.map((managerId) =>
            createNotification({
              recipient_id: managerId,
              type: "task_overdue_manager",
              notificationKey: "task_overdue_manager",  // SEAM A — per-user control plane (0133)
              title: `Task overdue — ${leadName}`,
              body: `${agentName}'s task "${ctx.task.title}" was due at ${dueTimeIst} IST with no activity since.`,
              action_url: `/leads/${lead.id}`,
            }),
          ),
        );
      }

      if (policy.channels.includes("whatsapp")) {
        const { sendTaskOverdueManagerNotification } =
          await import("@/lib/services/whatsapp-api");
        // Awaited — the run must outlive the Gupshup sends. Swallows its own errors.
        await sendTaskOverdueManagerNotification(
          managerIds,
          agentName,
          leadName,
          ctx.task.title,
          dueTimeIst,
          lead.id,
        );
      }
      return;
    }

    // ── Non-lead task path — escalate to the assignee's manager ──────────────
    const actx = await getTaskWithAssignee(payload.taskId);
    if (!actx?.assignee) return; // no assignee → no manager to resolve

    // Exactly-once stamp (same guard as the lead path).
    const stamped = await markTaskOverdueOnce(payload.taskId, new Date());
    if (!stamped) return;

    // Oversight event — once, after the once-only stamp (same guard).
    await emitOverdueEvent(payload.taskId, ctx.task.assigned_to, ctx.task.title, ctx.task.due_at);

    const managers = await getAssigneeManagers(actx.assignee);
    if (managers.length === 0) {
      console.error(
        `[check-task-overdue] no escalation target: non-lead task=${payload.taskId} assignee=${actx.assignee.id}`,
      );
      return;
    }
    const managerIds = managers.map((m) => m.id);

    if (policy.channels.includes("in_app")) {
      const { createNotification } =
        await import("@/lib/services/notifications-service");
      await Promise.allSettled(
        managerIds.map((managerId) =>
          createNotification({
            recipient_id: managerId,
            type: "task_overdue_manager",
            notificationKey: "task_overdue_manager",  // SEAM A — per-user control plane (0133)
            title: `Task overdue — ${ctx.task.title}`,
            body: `${agentName}'s task "${ctx.task.title}" was due at ${dueTimeIst} IST and is still open.`,
            action_url: `/tasks`,
          }),
        ),
      );
    }

    if (policy.channels.includes("whatsapp")) {
      const { sendTaskOverdueManagerGenericNotification } =
        await import("@/lib/services/whatsapp-api");
      // Awaited — the run must outlive the Gupshup sends. Swallows its own errors.
      await sendTaskOverdueManagerGenericNotification(
        managerIds,
        agentName,
        ctx.task.title,
        dueTimeIst,
      );
    }
  },
});

// ─────────────────────────────────────────────
// Arm the overdue check at dueAt + thresholdMinutes (clock time — TASK-01B is
// hours_mode 'clock'; "+30 min of silence" means 30 real minutes).
// Idempotency key embeds the due timestamp: a re-fire after a due_at edit gets
// its own key, while retries of the same chain dedupe. Tagged with the same
// task-reminder-${taskId} tag so cancelTaskReminder (delete / due edit /
// terminal status) sweeps pending checks too.
// ─────────────────────────────────────────────

async function scheduleTaskOverdueCheck(
  taskId: string,
  dueAt: Date,
  thresholdMinutes: number,
): Promise<void> {
  const fireAt = new Date(dueAt.getTime() + thresholdMinutes * 60_000);

  await tasks.trigger(
    "check-task-overdue",
    { taskId, dueAt: dueAt.toISOString() },
    {
      ...(fireAt > new Date() ? { delay: fireAt } : {}),
      idempotencyKey: `task-overdue-${taskId}-${dueAt.toISOString()}`,
      tags: [`task-reminder-${taskId}`],
    },
  );
}

// ─────────────────────────────────────────────
// "Due soon" reminder — WhatsApp to the assigned agent 30 min BEFORE the
// deadline, for EVERY task (lead or not). Lead-agnostic + task-shaped, via
// getTaskWithAssignee. Exits silently if the task is already closed, the due
// date moved, or the agent has no phone. Gated by TASK-01A.active + 'whatsapp'.
// Must be exported for the Trigger.dev build scan.
// ─────────────────────────────────────────────

export const sendTaskDueSoonTask = task({
  id: "send-task-due-soon",
  retry: { maxAttempts: 3 },
  run: async (payload: { taskId: string; dueAt: string }) => {
    const { getSlaPolicy, getTaskWithAssignee } =
      await import("@/lib/services/sla-service");

    // Policy per run — a deactivated TASK-01A silences pending due-soon jobs too.
    const policy = await getSlaPolicy("TASK-01A");
    if (!policy?.active || !policy.channels.includes("whatsapp")) return;

    const ctx = await getTaskWithAssignee(payload.taskId);
    if (!ctx?.assignee || !ctx.task.due_at) return;

    // Due date moved since this job was armed — the new due's own chain owns it.
    if (new Date(ctx.task.due_at).getTime() !== new Date(payload.dueAt).getTime()) {
      return;
    }

    // Only remind for still-open tasks.
    if (!["to_do", "in_progress", "in_review"].includes(ctx.task.status)) return;

    const dueTimeIst = new Date(ctx.task.due_at).toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const { sendTaskDueSoonAgentNotification } =
      await import("@/lib/services/whatsapp-api");
    await sendTaskDueSoonAgentNotification(
      ctx.assignee.id,
      ctx.assignee.phone,
      ctx.assignee.first_name,
      ctx.task.title,
      dueTimeIst,
    );
  },
});

// Minutes before the deadline that the due-soon WhatsApp fires.
const DUE_SOON_LEAD_MINUTES = 30;

// ─────────────────────────────────────────────
// Arm the due-soon WhatsApp at dueAt − 30 min. If less than 30 min remains
// (or the deadline is already past but still in the future for the main
// reminder), fire immediately (no delay). The due timestamp is embedded in the
// idempotency key so a due_at edit gets its own job while retries dedupe.
// Tagged with the same task-reminder-${taskId} tag so cancelTaskReminder
// (delete / due edit / terminal status) sweeps it too.
// ─────────────────────────────────────────────

async function scheduleTaskDueSoon(taskId: string, dueAt: Date): Promise<void> {
  const fireAt = new Date(dueAt.getTime() - DUE_SOON_LEAD_MINUTES * 60_000);

  await tasks.trigger(
    "send-task-due-soon",
    { taskId, dueAt: dueAt.toISOString() },
    {
      // <30 min to deadline → fire immediately (no delay key).
      ...(fireAt > new Date() ? { delay: fireAt } : {}),
      idempotencyKey: `task-due-soon-${taskId}-${dueAt.toISOString()}`,
      tags: [`task-reminder-${taskId}`],
    },
  );
}

// ─────────────────────────────────────────────
// Schedule a one-time reminder at dueAt
// Pre-mortem: if dueAt <= now(), this is a no-op (never errors).
// ─────────────────────────────────────────────

export async function scheduleTaskReminder(
  taskId: string,
  dueAt: Date,
  assignedTo: string,
): Promise<void> {
  if (dueAt <= new Date()) {
    // Due date is in the past — skip scheduling, do not error.
    return;
  }

  // The -30m "due soon" WhatsApp rides alongside the at-due reminder. Armed
  // here (rather than at each call site) so every scheduleTaskReminder caller
  // gets it for free; the shared task-reminder-${taskId} tag means
  // cancelTaskReminder sweeps it on delete / due edit / terminal status.
  await scheduleTaskDueSoon(taskId, dueAt).catch((err) => {
    console.error("[scheduleTaskReminder] due-soon arm failed (non-fatal):", err);
  });

  await tasks.trigger(
    "send-task-reminder",
    { taskId, assignedTo },
    {
      delay: dueAt,
      idempotencyKey: `task-reminder-${taskId}`,
      tags: [`task-reminder-${taskId}`],
    },
  );
}

// ─────────────────────────────────────────────
// Cancel any pending reminder for a task
// Uses the tag index to locate runs without storing run IDs.
// ─────────────────────────────────────────────

export async function cancelTaskReminder(taskId: string): Promise<void> {
  const { cancelRunsByTag } = await import("@/lib/trigger/cancel-runs");
  await cancelRunsByTag(`task-reminder-${taskId}`);
}
