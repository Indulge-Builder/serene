/**
 * task-reminders.ts
 * One-time Trigger.dev reminder jobs for OS Tasks.
 *
 * Two exports only:
 *   scheduleTaskReminder(taskId, dueAt, assignedTo) — fires at dueAt; no-op if dueAt is in the past
 *   cancelTaskReminder(taskId)                      — cancels any pending reminder for this task
 *
 * The task definition (sendTaskReminderTask) must be exported so Trigger.dev
 * can discover it during the build scan. It does nothing more than fire a
 * task_due notification — all notification logic lives in lib/actions/, not here.
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

import { task, tasks, runs } from '@trigger.dev/sdk/v3';

// ─────────────────────────────────────────────
// Task definition — must be exported for Trigger.dev scan
// ─────────────────────────────────────────────

export const sendTaskReminderTask = task({
  id: 'send-task-reminder',
  retry: { maxAttempts: 3 },
  run: async (payload: { taskId: string; assignedTo: string }) => {
    // Dynamic import to avoid SSR import of server-only modules at module level.
    // The notification is fire-and-forget — a failed reminder never fails the job.
    const { createNotification } = await import('@/lib/services/notifications-service');
    await createNotification({
      recipient_id: payload.assignedTo,
      type:         'task_due',
      title:        'Task due now',
      body:         'A task assigned to you is due.',
      action_url:   `/tasks`,
    }).catch((err: unknown) => {
      console.error('[send-task-reminder] notification failed:', err);
    });
  },
});

// ─────────────────────────────────────────────
// Schedule a one-time reminder at dueAt
// Pre-mortem: if dueAt <= now(), this is a no-op (never errors).
// ─────────────────────────────────────────────

export async function scheduleTaskReminder(
  taskId:     string,
  dueAt:      Date,
  assignedTo: string,
): Promise<void> {
  if (dueAt <= new Date()) {
    // Due date is in the past — skip scheduling, do not error.
    return;
  }

  await tasks.trigger(
    'send-task-reminder',
    { taskId, assignedTo },
    {
      delay:          dueAt,
      idempotencyKey: `task-reminder-${taskId}`,
      tags:           [`task-reminder-${taskId}`],
    },
  );
}

// ─────────────────────────────────────────────
// Cancel any pending reminder for a task
// Uses the tag index to locate runs without storing run IDs.
// ─────────────────────────────────────────────

export async function cancelTaskReminder(taskId: string): Promise<void> {
  const tag    = `task-reminder-${taskId}`;
  const page   = await runs.list({ tag, status: ['DELAYED', 'QUEUED'] });
  const runIds = page.data.map((r) => r.id);

  if (runIds.length === 0) return;

  // Cancel all matching runs (idempotent if already not running)
  await Promise.allSettled(runIds.map((id) => runs.cancel(id)));
}
