'use server';

/**
 * sla.ts — Gia SLA Engine server actions (config-driven since migration 0111)
 *
 * Four exported actions (callable from leads.ts hook points):
 *   scheduleSlaTimersForLead   — cancel existing + schedule new timers for a status
 *   cancelSlaTimersForLead     — cancel all timers for a lead (terminal statuses)
 *   refreshActivitySlaTimers   — refresh status timers after call activity
 *   armCadenceForOutcome       — arm the daily outcome cadence after a call note
 *
 * One internal handler (callable by Trigger.dev only):
 *   fireSlaBreachHandler       — fires on timer expiry; reads the policy row per
 *                                fire; branches on trigger_kind (status breach
 *                                vs outcome cadence tick); stale-fire guard
 *   fireSlaBreachAction        — thin Zod-validated wrapper over fireSlaBreachHandler
 *
 * CONFIG SOURCE: the sla_policies table, read PER RUN via the admin client
 * (getSlaPolicies / getSlaPolicy in sla-service). Never cache policies at
 * module scope — Trigger.dev workers are long-lived and a threshold edit must
 * apply on the next fire. SLA_RULES in constants/sla.ts is the parity
 * reference for the 0111 seed, not an engine input.
 *
 * Rule S-01: Every server action validates input with Zod before touching the DB.
 * Rule A-03: All DB queries go through lib/services/.
 * Rule Q-03: Return { data, error }. Never throw. Never void.
 */

import 'server-only';
import { z }                  from 'zod';
import { createAdminClient }  from '@/lib/supabase/admin';
import {
  SLA_AUTO_TASK_TITLES,
  CADENCE_OUTCOMES,
  CADENCE_RULE_BY_OUTCOME,
  CADENCE_ARMABLE_STATUSES,
  CADENCE_FRESHNESS_DAYS,
  CADENCE_TASK_DUE_BUSINESS_MINUTES,
  CADENCE_TASK_TITLES,
  STATUS_CADENCE_TASK_TITLES,
  isCadenceCode,
} from '@/lib/constants/sla';
import type { CadenceOutcome } from '@/lib/constants/sla';
import { nextBusinessDeadline, buildAgentShiftOverride } from '@/lib/utils/sla';
import type { AgentShiftOverride } from '@/lib/utils/sla';
import { toISTMidnight, toIst } from '@/lib/utils/ist';
import {
  getSlaPolicies,
  getSlaPolicy,
  createSlaTimer,
  cancelSlaTimersForLeadInDb,
  getManagersByDomain,
  getActiveFounders,
  getOpenGiaFollowupTask,
  markSlaTimerFired,
} from '@/lib/services/sla-service';
import { getAgentRoutingConfigAdmin } from '@/lib/services/agent-routing-service';
import { createNotification }                       from '@/lib/services/notifications-service';
import {
  sendSlaAgentNotification,
  sendSlaManagerNotification,
}                                                   from '@/lib/services/whatsapp-api';
import type { LeadStatus, SlaPolicy, Task } from '@/lib/types/database';
import type { ActionResult } from '@/lib/types/index';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ScheduleSlaSchema = z.object({
  leadId:     z.string().uuid(),
  status:     z.string(),
  assignedAt: z.string().datetime(),
  assignedTo: z.string().uuid(),
  domain:     z.string(),
});

const CancelSlaSchema = z.object({
  leadId: z.string().uuid(),
});

const FireSlaBreachSchema = z.object({
  leadId:   z.string().uuid(),
  ruleCode: z.string().min(1),
});

const RefreshActivitySlaSchema = z.object({
  leadId:     z.string().uuid(),
  status:     z.string(),
  assignedTo: z.string().uuid(),
  domain:     z.string(),
});

const ArmCadenceSchema = z.object({
  leadId:     z.string().uuid(),
  outcome:    z.string(),
  assignedTo: z.string().uuid(),
  domain:     z.string(),
  status:     z.string(),
});

// ─── SLA timestamp formatter ──────────────────────────────────────────────────

function formatSlaTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'unknown';
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:      '2-digit',
    month:    'short',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   true,
  });
}

// ─── Terminal statuses — no new SLA timers after these ───────────────────────

const TERMINAL_STATUSES = new Set<string>(['won', 'lost', 'junk']);

// ─── Fire-and-forget activity logger ─────────────────────────────────────────
// lead_activities.action_type has no restrictive CHECK — 'sla_breach' is valid
// by convention (documented in migration 0027). We cast to bypass the TS union.

async function logSlaActivity(
  admin:   ReturnType<typeof createAdminClient>,
  leadId:  string,
  details: Record<string, unknown>,
): Promise<void> {
  type ActivityInsert = {
    lead_id:     string;
    actor_id:    null;
    action_type: string;  // broader type to accept 'sla_breach' outside the union
    details:     Record<string, unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    null,
    action_type: 'sla_breach',
    details,
  } as ActivityInsert);
}

// ─── Shift-override resolution (shared) ──────────────────────────────────────

async function resolveAgentShift(agentId: string): Promise<AgentShiftOverride | null> {
  const agentRoutingConfig = await getAgentRoutingConfigAdmin(agentId);
  return agentRoutingConfig
    ? buildAgentShiftOverride(
        agentRoutingConfig.shift_start,
        agentRoutingConfig.shift_end,
        agentRoutingConfig.shift_days,
      )
    : null;
}

/** IST calendar-date key (YYYY-MM-DD) — the cadence idempotency suffix. */
function istDateKey(d: Date): string {
  const ist = toIst(d);
  return `${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}`;
}

/** Deadline for a status policy: hours_mode picks shift / business / clock math. */
function policyDeadline(
  policy:     SlaPolicy,
  from:       Date,
  agentShift: AgentShiftOverride | null,
): Date {
  if (policy.hours_mode === 'clock') {
    return new Date(from.getTime() + policy.threshold_minutes * 60_000);
  }
  const shift = policy.hours_mode === 'agent_shift' ? (agentShift ?? undefined) : undefined;
  return nextBusinessDeadline(from, policy.threshold_minutes, shift);
}

// ─── scheduleSlaTimersForLead ─────────────────────────────────────────────────

/**
 * Cancels any existing SLA timers for this lead, then schedules new ones
 * for all active status policies matching the given status.
 *
 * For terminal statuses (won/lost/junk): cancels only, never schedules.
 * Called after assignment (status='new') and after status transitions.
 */
export async function scheduleSlaTimersForLead(input: unknown): Promise<ActionResult<null>> {
  // 1. Zod validate (Rule S-01)
  const parsed = ScheduleSlaSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: 'Invalid SLA schedule input.' };

  const { leadId, status, assignedAt, assignedTo, domain } = parsed.data;

  // 2. Cancel existing timers first (clear the slate)
  await cancelSlaTimersForLeadInternal(leadId);

  // 3. Terminal statuses → cancel only, do not schedule
  if (TERMINAL_STATUSES.has(status)) {
    return { data: null, error: null };
  }

  // 4. Active status policies for this status — read per run, never cached
  const policies = (await getSlaPolicies()).filter(
    (p) => p.trigger_kind === 'status' && p.trigger_value === status,
  );
  if (policies.length === 0) return { data: null, error: null };

  // 5. Resolve manager IDs for this domain (payload context for manager rules)
  const managers = await getManagersByDomain(domain);
  const managerIds = managers.map((m) => m.id);

  const fromDate = new Date(assignedAt);

  // 6. Resolve agent shift override once (used by all agent_shift policies in this batch)
  const agentShiftOverride = await resolveAgentShift(assignedTo);

  // 7. Schedule each applicable policy
  const { scheduleLeadSlasTask } = await import('@/trigger/lead-sla');

  await Promise.allSettled(
    policies.map(async (policy) => {
      const fireAt = policyDeadline(policy, fromDate, agentShiftOverride);

      // Create timer row in DB first
      await createSlaTimer(leadId, policy.code, fireAt);

      // Schedule Trigger.dev job. Cadence policies (CAD-) get the date-scoped
      // idempotency suffix — their re-arms must not dedupe against a prior
      // completed run (same convention as the daily outcome ticks).
      await scheduleLeadSlasTask(
        leadId,
        policy.code,
        fireAt,
        assignedTo,
        managerIds,
        isCadenceCode(policy.code) ? { idempotencySuffix: istDateKey(fireAt) } : undefined,
      );
    }),
  );

  return { data: null, error: null };
}

// ─── cancelSlaTimersForLead ───────────────────────────────────────────────────

/**
 * Cancels all pending SLA timers for a lead.
 * Called when a lead reaches a terminal status, or before rescheduling.
 */
export async function cancelSlaTimersForLead(input: unknown): Promise<ActionResult<null>> {
  // 1. Zod validate (Rule S-01)
  const parsed = CancelSlaSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: 'Invalid SLA cancel input.' };

  const { leadId } = parsed.data;
  await cancelSlaTimersForLeadInternal(leadId);
  return { data: null, error: null };
}

// Internal helper (not exported — called by scheduleSlaTimersForLead)
async function cancelSlaTimersForLeadInternal(leadId: string): Promise<void> {
  const { cancelLeadSlasByLeadTask } = await import('@/trigger/lead-sla');
  await Promise.allSettled([
    cancelLeadSlasByLeadTask(leadId),
    cancelSlaTimersForLeadInDb(leadId),
  ]);
}

// ─── refreshActivitySlaTimers ─────────────────────────────────────────────────

/**
 * Refreshes the status timers after call activity (touched + in_discussion only).
 * Called by addLeadCallNote after a call note is logged.
 *
 * SLA-01 timers are NOT refreshed by activity — a call on a new lead
 * auto-advances the status to touched (handled by the addLeadCallNote hook),
 * and 'new' policies never match the touched/in_discussion gate below.
 * Cadence runs are cancelled by the cancel-all and re-armed by the caller's
 * follow-up armCadenceForOutcome call.
 */
export async function refreshActivitySlaTimers(input: unknown): Promise<ActionResult<null>> {
  // 1. Zod validate (Rule S-01)
  const parsed = RefreshActivitySlaSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: 'Invalid SLA refresh input.' };

  const { leadId, status, assignedTo, domain } = parsed.data;

  // Only refresh for touched and in_discussion statuses
  if (!['touched', 'in_discussion'].includes(status)) {
    return { data: null, error: null };
  }

  const { cancelLeadSlasByLeadTask, scheduleLeadSlasTask } = await import('@/trigger/lead-sla');

  // Cancel all current timers for this lead (simplest correct approach —
  // cancel-all then re-schedule only the applicable policies)
  await cancelLeadSlasByLeadTask(leadId);
  await cancelSlaTimersForLeadInDb(leadId);

  // Resolve managers for domain
  const managers   = await getManagersByDomain(domain);
  const managerIds = managers.map((m) => m.id);
  const now        = new Date();

  // Resolve agent shift override once
  const agentShiftOverride = await resolveAgentShift(assignedTo);

  // Active status policies for the current status — read per run, never cached
  const policies = (await getSlaPolicies()).filter(
    (p) => p.trigger_kind === 'status' && p.trigger_value === status,
  );

  await Promise.allSettled(
    policies.map(async (policy) => {
      const fireAt = policyDeadline(policy, now, agentShiftOverride);

      await createSlaTimer(leadId, policy.code, fireAt);
      await scheduleLeadSlasTask(
        leadId,
        policy.code,
        fireAt,
        assignedTo,
        managerIds,
        isCadenceCode(policy.code) ? { idempotencySuffix: istDateKey(fireAt) } : undefined,
      );
    }),
  );

  return { data: null, error: null };
}

// ─── armCadenceForOutcome ─────────────────────────────────────────────────────

/**
 * Arms the daily outcome cadence after a call note. Called by addLeadCallNote
 * AFTER scheduleSlaTimersForLead / refreshActivitySlaTimers settle (their
 * cancel-all would otherwise kill the freshly armed tick).
 *
 * No-op unless the outcome is in CADENCE_OUTCOMES and the status is armable
 * (new/touched/in_discussion — never junk/lost/nurturing or terminal).
 *
 * Duplicate-storm protection is three layers, all required:
 *   1. date-scoped idempotency key on the tick run (this function + re-arm)
 *   2. the open-task guard at tick time (getOpenGiaFollowupTask)
 *   3. the 7-day freshness window at tick time (last_call_outcome_at)
 */
export async function armCadenceForOutcome(input: unknown): Promise<ActionResult<null>> {
  // 1. Zod validate (Rule S-01)
  const parsed = ArmCadenceSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: 'Invalid cadence arm input.' };

  const { leadId, outcome, assignedTo, status } = parsed.data;

  if (!(CADENCE_OUTCOMES as readonly string[]).includes(outcome)) {
    return { data: null, error: null };
  }
  if (!(CADENCE_ARMABLE_STATUSES as readonly string[]).includes(status)) {
    return { data: null, error: null };
  }

  const code = CADENCE_RULE_BY_OUTCOME[outcome as CadenceOutcome];
  const policy = await getSlaPolicy(code);
  if (!policy || !policy.active) return { data: null, error: null };

  await scheduleCadenceTick(leadId, code, assignedTo, policy);
  return { data: null, error: null };
}

/**
 * Schedules the next cadence tick.
 *
 * Outcome cadences (CAD-01x): the start of the agent's NEXT shift day — never
 * "now + 24h". An RNR logged 19:30 ticks tomorrow at shift open, not at 19:30
 * tomorrow (which would be off-shift).
 *
 * Status cadences (CAD-02A, migration 0114): threshold_minutes ahead via the
 * same hours_mode math as status breaches — 2880 business minutes = the next
 * 48-business-hour mark on the agent's shift.
 *
 * Idempotency key is date-scoped (lead-sla-{lead}-{code}-{IST date of fireAt})
 * so one tick per lead per rule per day is structural.
 */
async function scheduleCadenceTick(
  leadId:     string,
  code:       string,
  assignedTo: string,
  policy:     SlaPolicy,
): Promise<void> {
  const agentShift = policy.hours_mode === 'agent_shift'
    ? await resolveAgentShift(assignedTo)
    : null;

  let fireAt: Date;
  if (policy.trigger_kind === 'outcome') {
    // Next IST midnight, advanced to the next shift/business open (IST has no
    // DST — the fixed +24h hop is safe). nextBusinessDeadline with 0 minutes is
    // exactly "advance to the next working open".
    const nextIstMidnight = new Date(toISTMidnight(new Date()).getTime() + 24 * 3_600_000);
    fireAt = nextBusinessDeadline(nextIstMidnight, 0, agentShift ?? undefined);
  } else {
    fireAt = policyDeadline(policy, new Date(), agentShift);
  }

  await createSlaTimer(leadId, code, fireAt);

  const { scheduleLeadSlasTask } = await import('@/trigger/lead-sla');
  await scheduleLeadSlasTask(leadId, code, fireAt, assignedTo, [], {
    idempotencySuffix: istDateKey(fireAt),
  });
}

// ─── fireSlaBreachAction ──────────────────────────────────────────────────────

/**
 * Entry point called by Trigger.dev's fireLeadSlaTask.
 * Thin Zod-validated wrapper over fireSlaBreachHandler.
 * Not called from UI.
 */
export async function fireSlaBreachAction(
  leadId:   string,
  ruleCode: string,
): Promise<ActionResult<null>> {
  // 1. Zod validate (Rule S-01 — even Trigger.dev callbacks validate inputs)
  const parsed = FireSlaBreachSchema.safeParse({ leadId, ruleCode });
  if (!parsed.success) return { data: null, error: 'Invalid SLA breach input.' };

  return fireSlaBreachHandler(parsed.data.leadId, parsed.data.ruleCode);
}

// ─── fireSlaBreachHandler ─────────────────────────────────────────────────────

/**
 * Core timer-fire logic. Called via fireSlaBreachAction.
 *
 * Steps:
 *  1. Load the policy row for this code (per fire — stale config impossible)
 *  2. Re-read lead from DB INCLUDING last_call_outcome(+_at) (stale-fire guard)
 *  3. Branch on trigger_kind: 'outcome' → cadence tick; 'status' → breach
 *  4. Breach: SLA-04 call_count guard → recipient resolution (agent/manager/
 *     founder) → channel-gated notifications → auto-task → activity → mark fired
 *
 * Returns 'STALE_FIRE' error string (not a crash) when the lead has moved on
 * or the policy was deactivated.
 */
export async function fireSlaBreachHandler(
  leadId:   string,
  ruleCode: string,
): Promise<ActionResult<null>> {
  const admin = createAdminClient();

  // ─ Step 1: Load policy per fire — never module-cached ──────────────────────
  const policy = await getSlaPolicy(ruleCode);
  if (!policy) {
    console.error(`[sla] unknown rule code at fire time: ${ruleCode} (lead=${leadId})`);
    return { data: null, error: 'STALE_FIRE' };
  }
  if (!policy.active) {
    await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'policy_inactive' }).catch(() => {});
    return { data: null, error: 'STALE_FIRE' };
  }

  // ─ Step 2: Re-read lead — stale-fire guard ─────────────────────────────────
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id, status, assigned_to, domain, call_count, first_name, last_name, phone, last_activity_at, status_changed_at, last_call_outcome, last_call_outcome_at')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    // Lead deleted or inaccessible — not an error, just a no-op
    return { data: null, error: 'STALE_FIRE' };
  }

  // ─ Step 3: Cadence ticks take their own path ───────────────────────────────
  // Every CAD-prefixed code is a cadence regardless of trigger_kind: outcome
  // cadences (CAD-01x) and the in_discussion status cadence (CAD-02A, 0114).
  if (policy.trigger_kind === 'outcome' || isCadenceCode(policy.code)) {
    return runCadenceTick(admin, lead, policy);
  }

  const leadStatus = lead.status as LeadStatus;

  if (leadStatus !== policy.trigger_value) {
    // Lead has moved on — stale fire, log and exit cleanly
    await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'stale_fire', status_at_fire: leadStatus }).catch(() => {});
    return { data: null, error: 'STALE_FIRE' };
  }

  // ─ Step 4: SLA-04 extra guard — call_count ─────────────────────────────────
  if (ruleCode.startsWith('SLA-04')) {
    const callCount = (lead.call_count as number) ?? 0;
    if (callCount >= 3) {
      // Call count threshold already met — stale fire
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'stale_fire_call_count', call_count: callCount }).catch(() => {});
      return { data: null, error: 'STALE_FIRE' };
    }
  }

  // ─ Step 5: Resolve recipient ──────────────────────────────────────────────
  const leadDomain    = lead.domain as string;
  const assignedTo    = lead.assigned_to as string | null;
  const leadFirstName = (lead.first_name as string | null) ?? 'A lead';
  const leadLastName  = lead.last_name as string | null;
  const leadName      = leadLastName ? `${leadFirstName} ${leadLastName}` : leadFirstName;
  const leadPhone     = (lead.phone as string | null) ?? '';
  const lastUpdatedAt = formatSlaTimestamp(
    (lead.last_activity_at as string | null) ?? (lead.status_changed_at as string | null),
  );

  const ruleDesc  = describePolicy(policy);
  const sendInApp = policy.channels.includes('in_app');
  const sendWa    = policy.channels.includes('whatsapp');

  if (policy.recipient_role === 'agent') {
    if (!assignedTo) {
      // No agent assigned — log but don't crash
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'no_agent_assigned' }).catch(() => {});
      return { data: null, error: null };
    }

    // ─ Notify agent ───────────────────────────────────────────────────────
    if (sendInApp) {
      await createNotification({
        recipient_id: assignedTo,
        type:         'sla_breach_agent',
        title:        `SLA breach — ${leadName}`,
        body:         ruleDesc,
        action_url:   `/leads/${leadId}`,
      }).catch(() => {}); // fire-and-forget, non-fatal
    }

    // Awaited so the WhatsApp send completes before this handler (and the
    // Trigger.dev run that invokes it) finishes. A bare void could let the run be
    // marked complete and the worker move on before the Gupshup fetch settles.
    // sendSlaAgentNotification swallows its own errors, so this never throws.
    if (sendWa) {
      await sendSlaAgentNotification(
        assignedTo,
        leadName,
        leadPhone,
        leadStatus,
        lastUpdatedAt,
      ).catch((err) => console.error('[sla] agent WA notification failed:', err));
    }

    // ─ Auto-task (policy-gated, agent rules only) ─────────────────────────
    const taskTitle = SLA_AUTO_TASK_TITLES[ruleCode as keyof typeof SLA_AUTO_TASK_TITLES];
    if (policy.auto_task && taskTitle) {
      // Check for existing open gia_followup task for this lead + agent
      const existingTask = await getOpenGiaFollowupTask(leadId, assignedTo);
      if (!existingTask) {
        // Create auto-task — mirrors nurturing side-effect pattern in updateLeadStatus
        const { data: newTask } = await admin
          .from('tasks')
          .insert({
            assigned_to:   assignedTo,
            created_by:    assignedTo, // system-generated; use agent as owner
            module:        'gia',
            task_type:     'other',
            title:         taskTitle,
            description:   `SLA rule ${ruleCode} — ${ruleDesc}`,
            status:        'to_do',
            priority:      ruleCode === 'SLA-01A' ? 'urgent' : 'high',
            task_category: 'gia_followup',
            due_at:        null,
          } as const)
          .select('id')
          .single();

        if (newTask) {
          await admin.from('task_gia_meta').insert({
            task_id:      newTask.id as string,
            lead_id:      leadId,
            call_outcome: null,
          });
        }
      }
    }

  } else {
    // ─ Manager / founder escalation rules ───────────────────────────────────
    const isFounderRule = policy.recipient_role === 'founder';
    const recipients = isFounderRule
      ? await getActiveFounders()
      : await getManagersByDomain(leadDomain);
    const recipientIds = recipients.map((m) => m.id);

    if (recipientIds.length === 0) {
      // No escalation targets — log warning, do not crash
      console.error(
        `[sla] sla_no_escalation_target: lead=${leadId} rule=${ruleCode} domain=${leadDomain}`,
      );
      // Log activity but continue — non-fatal
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'no_escalation_target', domain: leadDomain }).catch(() => {});
      return { data: null, error: null };
    }

    // Notify all recipients in-app
    if (sendInApp) {
      await Promise.allSettled(
        recipientIds.map((recipientId) =>
          createNotification({
            recipient_id: recipientId,
            type:         isFounderRule ? 'sla_breach_founder' : 'sla_breach_manager',
            title:        `SLA escalation — ${leadName}`,
            body:         ruleDesc,
            action_url:   `/leads/${leadId}`,
          }),
        ),
      );
    }

    // Resolve agent name for WA template (one targeted fetch)
    let agentName = 'Unassigned';
    if (assignedTo) {
      const { data: agentProfile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', assignedTo)
        .single();
      agentName = (agentProfile?.full_name as string | null) ?? 'Unassigned';
    }

    // Awaited so the send completes before the Trigger.dev run finishes (see note
    // on sendSlaAgentNotification above). Swallows its own errors; never throws.
    // Founder rules reuse the SLA manager template — same five params.
    if (sendWa) {
      await sendSlaManagerNotification(
        recipientIds,
        leadName,
        leadPhone,
        agentName,
        leadStatus,
        lastUpdatedAt,
      ).catch((err) => console.error('[sla] manager/founder WA notification failed:', err));
    }
  }

  // ─ Step 6: Log sla_breach activity ────────────────────────────────────────
  const recipientId = policy.recipient_role === 'agent' ? assignedTo : null;
  await logSlaActivity(admin, leadId, {
    rule_code:    ruleCode,
    recipient:    policy.recipient_role,
    recipient_id: recipientId,
    lead_status:  leadStatus,
  }).catch(() => {});

  // ─ Step 7: Mark timer as fired ────────────────────────────────────────────
  await markSlaTimerFired(leadId, ruleCode).catch(() => {});

  return { data: null, error: null };
}

// ─── runCadenceTick ───────────────────────────────────────────────────────────

type CadenceLeadRow = {
  id:                   string;
  status:               string;
  assigned_to:          string | null;
  last_call_outcome:    string | null;
  last_call_outcome_at: string | null;
};

/**
 * One cadence tick for one lead. Guards, in order — each stale exit
 * returns WITHOUT re-arming (the cadence dies until a new qualifying call
 * note / status change re-arms it):
 *   1. agent still assigned
 *   2. OUTCOME cadences (CAD-01x): status still armable (new/touched/
 *      in_discussion — junk/lost/nurturing/terminal never receive cadence
 *      tasks); latest outcome still this policy's outcome; outcome logged
 *      within CADENCE_FRESHNESS_DAYS (pre-go-live/stale outcomes never arm —
 *      a NULL last_call_outcome_at always fails here)
 *   3. STATUS cadences (CAD-02A): lead still in the trigger status
 *
 * Then the open-task guard: if any open gia_followup task exists for this
 * lead+agent (a prior cadence task, an SLA auto-task, or one the agent made
 * in the call flow), SKIP creation — the overdue rule covers the open task —
 * but still re-arm tomorrow. Otherwise create the follow-up task (due
 * CADENCE_TASK_DUE_BUSINESS_MINUTES into the shift), wire its due reminder,
 * and re-arm tomorrow.
 *
 * Deliberately writes NO lead_activities rows on create/skip — a daily
 * engine tick would silt up the dossier activity log; lead_sla_timers rows
 * are the audit trail and the created task is itself visible.
 */
async function runCadenceTick(
  admin:  ReturnType<typeof createAdminClient>,
  lead:   CadenceLeadRow,
  policy: SlaPolicy,
): Promise<ActionResult<null>> {
  const leadId     = lead.id;
  const assignedTo = lead.assigned_to;
  const isOutcomeCadence = policy.trigger_kind === 'outcome';

  if (!assignedTo) return { data: null, error: 'STALE_FIRE' };

  if (isOutcomeCadence) {
    if (!(CADENCE_ARMABLE_STATUSES as readonly string[]).includes(lead.status)) {
      return { data: null, error: 'STALE_FIRE' };
    }

    if (lead.last_call_outcome !== policy.trigger_value) {
      return { data: null, error: 'STALE_FIRE' };
    }

    // Freshness window — the guard that keeps historical/backfilled outcomes
    // from sustaining a cadence. NULL timestamp = never fresh.
    const outcomeAt = lead.last_call_outcome_at ? new Date(lead.last_call_outcome_at).getTime() : null;
    const freshnessFloor = Date.now() - CADENCE_FRESHNESS_DAYS * 24 * 3_600_000;
    if (!outcomeAt || outcomeAt < freshnessFloor) {
      return { data: null, error: 'STALE_FIRE' };
    }
  } else {
    // Status cadence (CAD-02A): the only liveness condition is the lead still
    // sitting in the trigger status — leaving it disarms via the cancel-all,
    // and this guard covers the race where the fire beat the cancel.
    if (lead.status !== policy.trigger_value) {
      return { data: null, error: 'STALE_FIRE' };
    }
  }

  // Open-task guard — one open cadence/gia task per lead, structurally.
  const existingTask = await getOpenGiaFollowupTask(leadId, assignedTo);

  if (!existingTask) {
    const agentShift = policy.hours_mode === 'agent_shift'
      ? await resolveAgentShift(assignedTo)
      : null;
    const dueAt = nextBusinessDeadline(
      new Date(),
      CADENCE_TASK_DUE_BUSINESS_MINUTES,
      agentShift ?? undefined,
    );

    const title = isOutcomeCadence
      ? CADENCE_TASK_TITLES[policy.trigger_value as CadenceOutcome]
      : (STATUS_CADENCE_TASK_TITLES[policy.code] ?? 'Follow up on lead');
    const description = isOutcomeCadence
      ? `Daily follow-up cadence (${policy.code}) — last outcome "${policy.trigger_value}" on ${formatSlaTimestamp(lead.last_call_outcome_at)}`
      : `Recurring follow-up cadence (${policy.code}) — lead has been ${policy.trigger_value.replace(/_/g, ' ')} with no activity for ${Math.round(policy.threshold_minutes / 60)} business hours`;

    // Atomic two-INSERT via the canonical RPC (tasks + task_gia_meta) —
    // tasks only ever via create_lead_gia_task (Phase 2 reuse directive).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error: rpcError } = await (admin as any).rpc('create_lead_gia_task', {
      p_lead_id:     leadId,
      p_assigned_to: assignedTo,
      p_created_by:  assignedTo, // system-generated; agent owns it (SLA auto-task convention)
      p_task_type:   'call',
      p_title:       title,
      p_description: description,
      p_priority:    'normal',
      p_due_at:      dueAt.toISOString(),
    });

    if (rpcError || !rows || (rows as Task[]).length === 0) {
      console.error(`[sla] cadence task creation failed: lead=${leadId} rule=${policy.code}`, rpcError);
      // Do not re-arm on a failed write — Trigger.dev retries this run.
      return { data: null, error: 'cadence_task_insert_failed' };
    }

    const task = (rows as Task[])[0]!;

    // Due reminder rides the existing task-reminder machinery (TASK-01A/B
    // pick it up from there).
    const { scheduleTaskReminder } = await import('@/trigger/task-reminders');
    await scheduleTaskReminder(task.id, dueAt, assignedTo).catch((err) =>
      console.error('[sla] cadence reminder scheduling failed (non-fatal):', err),
    );
  }
  // else: open task already covers this lead — skip creation; the overdue
  // rule (TASK-01B) chases it. Still re-arm below.

  await markSlaTimerFired(leadId, policy.code).catch(() => {});

  // Re-arm — outcome cadences repeat daily until the outcome/status changes
  // or the freshness window closes; status cadences repeat threshold_minutes
  // apart until the lead leaves the trigger status (exits above).
  await scheduleCadenceTick(leadId, policy.code, assignedTo, policy);

  return { data: null, error: null };
}

// ─── Rule description helper ──────────────────────────────────────────────────

function describePolicy(policy: SlaPolicy): string {
  const mins = policy.threshold_minutes;
  const hours = mins < 60 ? null : Math.floor(mins / 60);
  const timeStr = hours
    ? hours < 24
      ? `${hours} business hours`
      : `${Math.floor(hours / 8)} business days`
    : `${mins} business minutes`;

  const statusLabel: Record<string, string> = {
    new:           'New lead',
    touched:       'Touched lead',
    in_discussion: 'Lead in discussion',
    nurturing:     'Active lead (nurturing)',
  };

  const statusStr = statusLabel[policy.trigger_value] ?? policy.trigger_value;
  return `${statusStr} has had no ${policy.recipient_role === 'agent' ? 'follow-up' : 'progress'} in ${timeStr}`;
}
