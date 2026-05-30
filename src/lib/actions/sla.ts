'use server';

/**
 * sla.ts — Gia SLA Engine server actions
 *
 * Three exported actions (callable from leads.ts hook points):
 *   scheduleSlaTimersForLead   — cancel existing + schedule new timers for a status
 *   cancelSlaTimersForLead     — cancel all timers for a lead (terminal statuses)
 *   refreshActivitySlaTimers   — refresh only SLA-02/03 timers after call activity
 *
 * One internal handler (callable by Trigger.dev only):
 *   fireSlaBreachHandler       — fires on SLA breach; stale-fire guard; notifications; auto-task
 *   fireSlaBreachAction        — thin Zod-validated wrapper over fireSlaBreachHandler
 *
 * Rule S-01: Every server action validates input with Zod before touching the DB.
 * Rule A-03: All DB queries go through lib/services/.
 * Rule Q-03: Return { data, error }. Never throw. Never void.
 */

import 'server-only';
import { z }                  from 'zod';
import { createAdminClient }  from '@/lib/supabase/admin';
import {
  SLA_RULES,
  SLA_AUTO_TASK_TITLES,
  getRulesForStatus,
  getActivityRefreshRules,
} from '@/lib/constants/sla';
import type { SlaRuleCode }                         from '@/lib/constants/sla';
import { nextBusinessDeadline }                     from '@/lib/utils/sla';
import {
  createSlaTimer,
  cancelSlaTimersForLeadInDb,
  getManagersByDomain,
  getOpenGiaFollowupTask,
  markSlaTimerFired,
  getSlaTimerForLeadAndRule,
} from '@/lib/services/sla-service';
import { createNotification }                       from '@/lib/services/notifications-service';
import {
  sendSlaAgentNotification,
  sendSlaManagerNotification,
}                                                   from '@/lib/services/whatsapp-api';
import type { LeadStatus, AppDomain } from '@/lib/types/database';
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

// ─── scheduleSlaTimersForLead ─────────────────────────────────────────────────

/**
 * Cancels any existing SLA timers for this lead, then schedules new ones
 * for all SLA rules that apply to the given status.
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

  // 4. Get applicable rules for this status
  const applicableRules = getRulesForStatus(status);
  if (applicableRules.length === 0) return { data: null, error: null };

  // 5. Resolve manager IDs for this domain (used by manager rules)
  const managers = await getManagersByDomain(domain);
  const managerIds = managers.map((m) => m.id);

  const fromDate = new Date(assignedAt);

  // 6. Schedule each applicable rule
  const { scheduleLeadSlasTask } = await import('@/trigger/lead-sla');

  await Promise.allSettled(
    applicableRules.map(async (ruleCode) => {
      const rule    = SLA_RULES[ruleCode];
      const fireAt  = nextBusinessDeadline(fromDate, rule.businessMinutes);

      // Create timer row in DB first
      await createSlaTimer(leadId, ruleCode, fireAt);

      // Schedule Trigger.dev job
      await scheduleLeadSlasTask(
        leadId,
        ruleCode,
        fireAt,
        assignedTo,
        managerIds,
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
 * Refreshes only the SLA-02/03 timers (touched + in_discussion rules).
 * Called by addLeadCallNote after a call note is logged.
 *
 * SLA-01 timers are NOT refreshed by activity — a call on a new lead
 * auto-advances the status to touched (handled by updateLeadStatus hook).
 * This function only affects SLA-02A/02B and SLA-03A/03B.
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

  // Cancel only the activity-refresh rules for this lead
  const refreshRuleCodes = getActivityRefreshRules();
  const { cancelLeadSlasByLeadTask, scheduleLeadSlasTask } = await import('@/trigger/lead-sla');

  // Cancel all current timers for this lead (simplest correct approach —
  // cancel-all then re-schedule only the applicable rules)
  await cancelLeadSlasByLeadTask(leadId);
  await cancelSlaTimersForLeadInDb(leadId);

  // Resolve managers for domain
  const managers   = await getManagersByDomain(domain);
  const managerIds = managers.map((m) => m.id);
  const now        = new Date();

  // Re-schedule only the rules that apply to the current status
  const applicableRefreshRules = refreshRuleCodes.filter((code) =>
    getRulesForStatus(status).includes(code),
  );

  await Promise.allSettled(
    applicableRefreshRules.map(async (ruleCode) => {
      const rule   = SLA_RULES[ruleCode];
      const fireAt = nextBusinessDeadline(now, rule.businessMinutes);

      await createSlaTimer(leadId, ruleCode, fireAt);
      await scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedTo, managerIds);
    }),
  );

  return { data: null, error: null };
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

  return fireSlaBreachHandler(parsed.data.leadId, parsed.data.ruleCode as SlaRuleCode);
}

// ─── fireSlaBreachHandler ─────────────────────────────────────────────────────

/**
 * Core SLA breach logic. Called via fireSlaBreachAction.
 *
 * Steps:
 *  1. Re-read lead from DB (stale-fire guard)
 *  2. Special check for SLA-04: call_count < 3 guard
 *  3. Resolve recipient(s)
 *  4. Create notification(s)
 *  5. Auto-task creation (agent rules only, dedup guard)
 *  6. Log sla_breach activity
 *  7. Mark timer as fired
 *
 * Returns 'STALE_FIRE' error string (not a crash) when the lead has moved on.
 */
export async function fireSlaBreachHandler(
  leadId:   string,
  ruleCode: SlaRuleCode,
): Promise<ActionResult<null>> {
  const rule = SLA_RULES[ruleCode];
  const admin = createAdminClient();

  // ─ Step 1: Re-read lead — stale-fire guard ─────────────────────────────────
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id, status, assigned_to, domain, call_count, first_name, last_name, phone, last_activity_at, status_changed_at')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    // Lead deleted or inaccessible — not an error, just a no-op
    return { data: null, error: 'STALE_FIRE' };
  }

  const leadStatus = lead.status as LeadStatus;

  // Map 'active' status trigger → 'nurturing' (active = nurturing in our schema)
  const triggersForStatus: Record<string, string[]> = {
    'new':           ['new'],
    'touched':       ['touched'],
    'in_discussion': ['in_discussion'],
    'active':        ['nurturing'],   // SLA-04 fires on 'nurturing' status
  };

  const validStatuses = triggersForStatus[rule.statusTrigger] ?? [rule.statusTrigger];
  if (!validStatuses.includes(leadStatus)) {
    // Lead has moved on — stale fire, log and exit cleanly
    await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'stale_fire', status_at_fire: leadStatus }).catch(() => {});
    return { data: null, error: 'STALE_FIRE' };
  }

  // ─ Step 2: SLA-04 extra guard — call_count ────────────────────────────────
  if (ruleCode === 'SLA-04A' || ruleCode === 'SLA-04B') {
    const callCount = (lead.call_count as number) ?? 0;
    if (callCount >= 3) {
      // Call count threshold already met — stale fire
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'stale_fire_call_count', call_count: callCount }).catch(() => {});
      return { data: null, error: 'STALE_FIRE' };
    }
  }

  // ─ Step 3: Resolve recipient ──────────────────────────────────────────────
  const leadDomain    = lead.domain as string;
  const assignedTo    = lead.assigned_to as string | null;
  const leadFirstName = (lead.first_name as string | null) ?? 'A lead';
  const leadLastName  = lead.last_name as string | null;
  const leadName      = leadLastName ? `${leadFirstName} ${leadLastName}` : leadFirstName;
  const leadPhone     = (lead.phone as string | null) ?? '';
  const lastUpdatedAt = formatSlaTimestamp(
    (lead.last_activity_at as string | null) ?? (lead.status_changed_at as string | null),
  );

  const ruleDesc = getRuleDescription(ruleCode);

  if (rule.recipient === 'agent') {
    if (!assignedTo) {
      // No agent assigned — log but don't crash
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'no_agent_assigned' }).catch(() => {});
      return { data: null, error: null };
    }

    // ─ Step 4: Notify agent ─────────────────────────────────────────────────
    await createNotification({
      recipient_id: assignedTo,
      type:         'sla_breach_agent',
      title:        `SLA breach — ${leadName}`,
      body:         ruleDesc,
      action_url:   `/leads/${leadId}`,
    }).catch(() => {}); // fire-and-forget, non-fatal

    void sendSlaAgentNotification(
      assignedTo,
      leadName,
      leadPhone,
      leadStatus,
      lastUpdatedAt,
    ).catch((err) => console.error('[sla] agent WA notification failed:', err));

    // ─ Step 5: Auto-task (agent rules only) ──────────────────────────────────
    const taskTitle = SLA_AUTO_TASK_TITLES[ruleCode as keyof typeof SLA_AUTO_TASK_TITLES];
    if (taskTitle) {
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
            task_type:     'general_follow_up',
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
    // ─ Manager/escalation rules ─────────────────────────────────────────────
    const managers = await getManagersByDomain(leadDomain);
    const managerIds = managers.map((m) => m.id);

    if (managerIds.length === 0) {
      // Step 4 guard: no escalation targets — log warning, do not crash
      // (Sentry logging would go here in production)
      console.error(
        `[sla] sla_no_escalation_target: lead=${leadId} rule=${ruleCode} domain=${leadDomain}`,
      );
      // Log activity but continue — non-fatal
      await logSlaActivity(admin, leadId, { rule_code: ruleCode, outcome: 'no_escalation_target', domain: leadDomain }).catch(() => {});
      return { data: null, error: null };
    }

    // Notify all managers in domain
    await Promise.allSettled(
      managerIds.map((managerId) =>
        createNotification({
          recipient_id: managerId,
          type:         'sla_breach_manager',
          title:        `SLA escalation — ${leadName}`,
          body:         ruleDesc,
          action_url:   `/leads/${leadId}`,
        }),
      ),
    );

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

    void sendSlaManagerNotification(
      managerIds,
      leadName,
      leadPhone,
      agentName,
      leadStatus,
      lastUpdatedAt,
    ).catch((err) => console.error('[sla] manager WA notification failed:', err));
  }

  // ─ Step 6: Log sla_breach activity ────────────────────────────────────────
  const recipientId = rule.recipient === 'agent' ? assignedTo : null;
  await logSlaActivity(admin, leadId, {
    rule_code:    ruleCode,
    recipient:    rule.recipient,
    recipient_id: recipientId,
    lead_status:  leadStatus,
  }).catch(() => {});

  // ─ Step 7: Mark timer as fired ────────────────────────────────────────────
  await markSlaTimerFired(leadId, ruleCode).catch(() => {});

  return { data: null, error: null };
}

// ─── Rule description helper ──────────────────────────────────────────────────

function getRuleDescription(ruleCode: SlaRuleCode): string {
  const rule = SLA_RULES[ruleCode];
  const mins = rule.businessMinutes;
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
    active:        'Active lead (nurturing)',
  };

  const statusStr = statusLabel[rule.statusTrigger] ?? rule.statusTrigger;
  return `${statusStr} has had no ${rule.recipient === 'agent' ? 'follow-up' : 'progress'} in ${timeStr}`;
}
