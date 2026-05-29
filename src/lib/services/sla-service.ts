/**
 * sla-service.ts — Gia SLA Engine DB queries
 *
 * All queries go through this service (Rule A-03).
 * INSERT and UPDATE operations use the admin (service-role) client —
 * RLS has no INSERT policy for lead_sla_timers (system-managed only).
 * SELECT queries use the server client — RLS scopes results by role.
 */

import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LeadSlaTimer, Profile, Task, AppDomain } from '@/lib/types/database';
import type { SlaRuleCode }   from '@/lib/constants/sla';

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Returns all SLA timers for a lead, newest first. */
export async function getSlaTimersForLead(leadId: string): Promise<LeadSlaTimer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_sla_timers')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[sla-service] getSlaTimersForLead error:', error);
    return [];
  }
  return (data ?? []) as LeadSlaTimer[];
}

/**
 * Returns the most recent pending timer for a lead + rule_code combination.
 * Used by scheduleLeadSlasTask to write back the trigger_run_id.
 */
export async function getSlaTimerForLeadAndRule(
  leadId:   string,
  ruleCode: SlaRuleCode,
): Promise<LeadSlaTimer | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lead_sla_timers')
    .select('*')
    .eq('lead_id', leadId)
    .eq('rule_code', ruleCode)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[sla-service] getSlaTimerForLeadAndRule error:', error);
    return null;
  }
  return data as LeadSlaTimer | null;
}

/**
 * Returns all managers (role='manager'), admins, and founders for a domain.
 * Used by fireSlaBreachHandler to resolve escalation targets.
 */
export async function getManagersByDomain(
  domain: string,
): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('domain', domain as AppDomain)
    .in('role', ['manager', 'admin', 'founder'])
    .eq('is_active', true);

  if (error) {
    console.error('[sla-service] getManagersByDomain error:', error);
    return [];
  }
  return (data ?? []) as Pick<Profile, 'id' | 'full_name'>[];
}

/**
 * Returns the first open (non-terminal) gia_followup task for a lead assigned to a specific agent.
 * Used by fireSlaBreachHandler before auto-task creation to avoid duplicates.
 *
 * "Open" = status NOT IN (completed, cancelled, error).
 */
export async function getOpenGiaFollowupTask(
  leadId:     string,
  assignedTo: string,
): Promise<Task | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tasks')
    .select('*')
    .eq('task_category', 'gia_followup')
    .eq('assigned_to', assignedTo)
    .not('status', 'in', '("completed","cancelled","error")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Then check task_gia_meta to confirm it's for this lead
  if (error || !data) return null;

  const task = data as Task;

  const { data: meta } = await admin
    .from('task_gia_meta')
    .select('task_id')
    .eq('task_id', task.id)
    .eq('lead_id', leadId)
    .maybeSingle();

  return meta ? task : null;
}

// ─── Writes (admin / service-role only) ──────────────────────────────────────

/**
 * Creates a new pending SLA timer row.
 * Returns the inserted row.
 */
export async function createSlaTimer(
  leadId:           string,
  ruleCode:         SlaRuleCode,
  scheduledFireAt:  Date,
): Promise<LeadSlaTimer | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lead_sla_timers')
    .insert({
      lead_id:           leadId,
      rule_code:         ruleCode,
      scheduled_fire_at: scheduledFireAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[sla-service] createSlaTimer error:', error);
    return null;
  }
  return data as LeadSlaTimer;
}

/**
 * Writes the Trigger.dev run ID back to a timer row after scheduling.
 * Best-effort — non-fatal if the row is not found.
 */
export async function updateSlaTimerRunId(
  timerId: string,
  runId:   string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('lead_sla_timers')
    .update({ trigger_run_id: runId })
    .eq('id', timerId);
}

/**
 * Cancels all pending SLA timers for a lead in the DB.
 * Called alongside cancelLeadSlasByLeadTask (Trigger.dev cancel).
 */
export async function cancelSlaTimersForLeadInDb(leadId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('lead_sla_timers')
    .update({
      status:       'cancelled' as const,
      cancelled_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('status', 'pending');
}

/**
 * Marks a single SLA timer as fired.
 * Called by fireSlaBreachHandler after successful breach processing.
 */
export async function markSlaTimerFired(leadId: string, ruleCode: SlaRuleCode): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('lead_sla_timers')
    .update({
      status:   'fired' as const,
      fired_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('rule_code', ruleCode)
    .eq('status', 'pending');
}
