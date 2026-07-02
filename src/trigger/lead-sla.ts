/**
 * lead-sla.ts
 * Gia SLA Engine — Trigger.dev jobs.
 *
 * Three exports:
 *   scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds)
 *     — schedules a delayed job; writes trigger_run_id back to lead_sla_timers
 *   cancelLeadSlasByLeadTask(leadId)
 *     — cancels all DELAYED/QUEUED runs tagged for this lead; updates DB rows
 *   fireLeadSlaTask (Trigger.dev task definition — must be exported for scan)
 *     — the delayed job that fires on SLA breach; contains the stale-fire guard
 *
 * ── Idempotency guarantee ────────────────────────────────────────────────────
 * scheduleLeadSlasTask passes idempotencyKey: `lead-sla-${leadId}-${ruleCode}`.
 * Same guarantee as task-reminders.ts: Trigger.dev v3 deduplicates by key for
 * all non-terminal run states including DELAYED.
 *
 * ── Stale-fire guard ─────────────────────────────────────────────────────────
 * fireLeadSlaTask re-reads the lead from DB on every fire. If the lead status
 * no longer matches the rule's statusTrigger, the job exits cleanly.
 * The job payload is the snapshot at scheduling time — stale by definition.
 *
 * ── Double-scheduling guard ──────────────────────────────────────────────────
 * Two simultaneous webhooks for the same lead → idempotency key ensures only
 * one DELAYED run exists per (leadId, ruleCode) pair at any time.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { task, tasks, runs } from '@trigger.dev/sdk/v3';

// Rule codes are free text since the config-driven engine (migration 0111):
// SLA-xx status rules and CAD-xx cadence ticks ride the same task.

// ─── Payload types ────────────────────────────────────────────────────────────

interface _ScheduleLeadSlasPayloadDoc {
  leadId:           string;
  ruleCode:         string;
  fireAt:           string;  // ISO string (Date serialised for Trigger.dev payload)
  assignedAgentId:  string | null;  // null = lead is unassigned (manager/founder rules still fire)
  domainManagerIds: string[];
}

interface FireSlaBreachPayload {
  leadId:   string;
  ruleCode: string;
}

// ─── Task definition — must be exported for Trigger.dev scan ─────────────────

export const fireLeadSlaTask = task({
  id:    'fire-lead-sla',
  retry: { maxAttempts: 3 },
  run:   async (payload: FireSlaBreachPayload) => {
    // Dynamic imports to avoid SSR import of server-only modules at module level.
    const { fireSlaBreachHandler } = await import('@/lib/actions/sla');
    const result = await fireSlaBreachHandler(payload.leadId, payload.ruleCode);
    if (result.error) {
      // Non-fatal: log the error but don't throw — we don't want infinite retries
      // on stale-fire scenarios (those are intentional no-ops, not errors).
      // Actual errors will be caught by the retry logic via thrown Error below.
      if (result.error !== 'STALE_FIRE') {
        throw new Error(`[fire-lead-sla] breach handler failed: ${result.error}`);
      }
    }
  },
});

// ─── Schedule a delayed SLA job for one rule ─────────────────────────────────

export async function scheduleLeadSlasTask(
  leadId:           string,
  ruleCode:         string,
  fireAt:           Date,
  assignedAgentId:  string | null,
  domainManagerIds: string[],
  opts?: {
    /**
     * Appended to the idempotency key. Daily cadence ticks (CAD-xx) pass the
     * IST date of fireAt so "one tick per lead per rule per day" is structural
     * — without it the key would dedupe tomorrow's tick against today's
     * completed run (Trigger.dev keys outlive terminal runs within their TTL).
     */
    idempotencySuffix?: string;
  },
): Promise<void> {
  const idempotencyKey = opts?.idempotencySuffix
    ? `lead-sla-${leadId}-${ruleCode}-${opts.idempotencySuffix}`
    : `lead-sla-${leadId}-${ruleCode}`;

  if (fireAt <= new Date()) {
    // Fire time is in the past — trigger immediately rather than skip
    // (SLA already breached at the moment of scheduling)
    await tasks.trigger<typeof fireLeadSlaTask>(
      'fire-lead-sla',
      { leadId, ruleCode } satisfies FireSlaBreachPayload,
      {
        idempotencyKey,
        tags: [`lead-sla-${leadId}`, `sla-rule-${ruleCode}`],
      },
    );
  } else {
    await tasks.trigger<typeof fireLeadSlaTask>(
      'fire-lead-sla',
      { leadId, ruleCode } satisfies FireSlaBreachPayload,
      {
        delay: fireAt,
        idempotencyKey,
        tags: [`lead-sla-${leadId}`, `sla-rule-${ruleCode}`],
      },
    );
  }

  // Write trigger_run_id back to lead_sla_timers via service-role admin client.
  // This is best-effort — if it fails, the timer still fires correctly.
  try {
    const { updateSlaTimerRunId } = await import('@/lib/services/sla-service');
    // Look up the timer row for this lead+ruleCode to get its id
    const { getSlaTimerForLeadAndRule } = await import('@/lib/services/sla-service');
    const timer = await getSlaTimerForLeadAndRule(leadId, ruleCode);
    if (timer) {
      // The run ID isn't directly returned by tasks.trigger — we look it up via tag
      const page = await runs.list({
        tag:    `lead-sla-${leadId}`,
        status: ['DELAYED', 'QUEUED', 'EXECUTING'],
      });
      const match = page.data.find((r) => r.taskIdentifier === 'fire-lead-sla');
      if (match) {
        await updateSlaTimerRunId(timer.id, match.id);
      }
    }
  } catch {
    // Non-fatal — timer still fires; run_id is informational only
  }
}

// ─── Cancel all pending SLA runs for a lead ──────────────────────────────────

export async function cancelLeadSlasByLeadTask(leadId: string): Promise<void> {
  const { cancelRunsByTag } = await import('@/lib/trigger/cancel-runs');
  await cancelRunsByTag(`lead-sla-${leadId}`);

  // Update all pending timer rows for this lead in DB
  try {
    const { cancelSlaTimersForLeadInDb } = await import('@/lib/services/sla-service');
    await cancelSlaTimersForLeadInDb(leadId);
  } catch {
    // Non-fatal — Trigger.dev cancellation already happened above
  }
}
