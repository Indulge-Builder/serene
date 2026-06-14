/**
 * task-reminders.ts
 * One-time Trigger.dev reminder jobs for OS Tasks.
 *
 * Exports:
 *   scheduleTaskReminder(taskId, dueAt, assignedTo) — fires at dueAt; no-op if dueAt is in the past
 *   cancelTaskReminder(taskId)                      — cancels any pending run for this task
 *                                                     (due reminder AND overdue check — same tag)
 *   sendTaskReminderTask  — at due: task_due in-app for every category; for
 *                           gia_followup additionally the TASK-01A WhatsApp
 *                           reminder and arming of the TASK-01B overdue check
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

import { task, tasks, runs } from "@trigger.dev/sdk/v3";

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
      title: "Task due now",
      body: "A task assigned to you is due.",
      action_url: `/tasks`,
    }).catch((err: unknown) => {
      console.error("[send-task-reminder] notification failed:", err);
    });

    // ── Phase 2 (config-driven engine): gia_followup due-time extension ──────
    // TASK-01A: WhatsApp reminder to the assigned agent — gia tasks ONLY (the
    // template is lead-shaped; personal/group tasks stay in-app only, above).
    // TASK-01B: arm the overdue check at due + threshold.
    // Policies are read PER RUN — never cached at module scope.
    try {
      const { getSlaPolicy, getTaskWithGiaContext } =
        await import("@/lib/services/sla-service");

      const ctx = await getTaskWithGiaContext(payload.taskId);
      if (!ctx || ctx.task.task_category !== "gia_followup" || !ctx.lead) return;
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

      const overduePolicy = await getSlaPolicy("TASK-01B");
      if (overduePolicy?.active) {
        await scheduleTaskOverdueCheck(
          payload.taskId,
          new Date(ctx.task.due_at),
          overduePolicy.threshold_minutes,
        );
      }
    } catch (err) {
      console.error("[send-task-reminder] gia due-time extension failed:", err);
    }
  },
});

// ─────────────────────────────────────────────
// Overdue escalation — check-task-overdue (Phase 2, policy TASK-01B)
// Fires at due_at + threshold. Clearing events (any one exits silently):
//   task completed/cancelled · due_at moved · a lead activity logged after due.
// Otherwise stamps tasks.overdue_at EXACTLY ONCE (UPDATE … WHERE overdue_at IS
// NULL — the losing racer gets zero rows and must not notify) and notifies the
// lead's domain managers in-app + WhatsApp.
// ─────────────────────────────────────────────

export const checkTaskOverdueTask = task({
  id: "check-task-overdue",
  retry: { maxAttempts: 3 },
  run: async (payload: { taskId: string; dueAt: string }) => {
    const {
      getSlaPolicy,
      getTaskWithGiaContext,
      hasLeadActivityAfter,
      markTaskOverdueOnce,
      getManagersByDomain,
      getProfileFullName,
    } = await import("@/lib/services/sla-service");

    // Policy per run — a deactivated TASK-01B silences pending checks too.
    const policy = await getSlaPolicy("TASK-01B");
    if (!policy?.active) return;

    const ctx = await getTaskWithGiaContext(payload.taskId);
    if (!ctx || ctx.task.task_category !== "gia_followup" || !ctx.lead) return;
    const lead = ctx.lead; // capture — narrowing doesn't survive into closures below

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

    // Clearing event 2: the agent did something on this lead after due time.
    if (await hasLeadActivityAfter(lead.id, ctx.task.due_at)) return;

    // Exactly-once stamp — losing a race (or a retry after a crash mid-notify
    // already stamped) exits without a duplicate escalation.
    const stamped = await markTaskOverdueOnce(payload.taskId, new Date());
    if (!stamped) return;

    const managers = await getManagersByDomain(lead.domain);
    if (managers.length === 0) {
      console.error(
        `[check-task-overdue] no escalation target: task=${payload.taskId} domain=${lead.domain}`,
      );
      return;
    }
    const managerIds = managers.map((m) => m.id);

    const leadFirst = lead.first_name ?? "A lead";
    const leadName = lead.last_name
      ? ` `
      : leadFirst;
    const agentName =
      (await getProfileFullName(ctx.task.assigned_to)) ?? "Unassigned";
    // IST human time, "4:00 PM" — never UTC, never ISO (template {{5}} contract).
    const dueTimeIst = new Date(ctx.task.due_at).toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (policy.channels.includes("in_app")) {
      const { createNotification } =
        await import("@/lib/services/notifications-service");
      await Promise.allSettled(
        managerIds.map((managerId) =>
          createNotification({
            recipient_id: managerId,
            type: "task_overdue_manager",
            title: `Task overdue — ${leadName}`,
            body: `${agentName}'s task "${ctx.task.title}" was due at ${dueTimeIst} IST with no activity since.`,
            action_url: `/leads/`,
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
  const tag = `task-reminder-${taskId}`;
  const page = await runs.list({ tag, status: ["DELAYED", "QUEUED"] });
  const runIds = page.data.map((r) => r.id);

  if (runIds.length === 0) return;

  // Cancel all matching runs (idempotent if already not running)
  await Promise.allSettled(runIds.map((id) => runs.cancel(id)));
}
