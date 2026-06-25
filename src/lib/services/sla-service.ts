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
import { mapRows }           from '@/lib/utils/rows';
import { isCadenceCode }     from '@/lib/constants/sla';
import { goingColdCutoff } from '@/lib/constants/leads';
import type { LeadSlaTimer, Profile, Task, AppDomain, SlaPolicy, SlaHoursMode, SlaRecipientRole } from '@/lib/types/database';

// Engine rule codes are free text since the config-driven engine (0111):
// SLA-xx, CAD-xx, TASK-xx all ride the same timer/idempotency machinery.

// ─── Policy reads (config-driven engine, migration 0111) ────────────────────
// Read PER JOB RUN via the admin client — sessionless Trigger.dev context.
// NEVER cache at module scope (Phase 2 failure mode #1): a threshold edit in
// sla_policies must apply on the very next fire.

/** All active policies. Returns [] on error — callers treat that as "no rules". */
export async function getSlaPolicies(): Promise<SlaPolicy[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sla_policies')
    .select('*')
    .eq('active', true);

  if (error) {
    console.error('[sla-service] getSlaPolicies error:', error);
    return [];
  }
  return (data ?? []) as SlaPolicy[];
}

/**
 * ALL policy rows (including inactive) for the /settings follow-up engine
 * panel. Session client — the 0111 RLS (admin/founder SELECT) double-enforces
 * the page's role gate. Ordered by code so rule families group naturally.
 */
export async function getAllSlaPolicies(): Promise<SlaPolicy[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sla_policies')
    .select('*')
    .order('code', { ascending: true });

  if (error) {
    console.error('[sla-service] getAllSlaPolicies error:', error);
    return [];
  }
  return (data ?? []) as SlaPolicy[];
}

/** The editable subset of a policy row — identity fields (code, trigger,
 *  recipient, auto_task) are never UI-writable. */
export interface SlaPolicyPatch {
  threshold_minutes?: number;
  channels?:          string[];
  hours_mode?:        SlaHoursMode;
  active?:            boolean;
}

/**
 * Updates one policy row. Admin client — sla_policies has no write RLS by
 * design (0111); the admin/founder-gated action is the trust boundary.
 * Threshold edits apply to timers scheduled AFTER the change; active/channel
 * edits apply on the very next fire (policies are read per run).
 */
export async function updateSlaPolicy(
  code:  string,
  patch: SlaPolicyPatch,
): Promise<SlaPolicy | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sla_policies')
    .update(patch)
    .eq('code', code)
    .select()
    .single();

  if (error) {
    console.error('[sla-service] updateSlaPolicy error:', error);
    return null;
  }
  return data as SlaPolicy;
}

/** A brand-new policy row authored through the /settings "New rule" form. The
 *  code is action-generated (inert USR-<id>) — never user-supplied. */
export interface NewSlaPolicy {
  code:              string;
  trigger_kind:      'status' | 'outcome' | 'task_due';
  trigger_value:     string;
  threshold_minutes: number;
  recipient_role:    'agent' | 'manager' | 'founder';
  auto_task:         boolean;
  channels:          string[];
  hours_mode:        SlaHoursMode;
  active:            boolean;
}

/**
 * Inserts a new policy row. Admin client — sla_policies has no write RLS by
 * design (0111); the admin/founder-gated action is the trust boundary. A new
 * row arms automatically: the engine reads getSlaPolicies() per job run, so
 * the next matching lead picks it up with no deploy. Returns null on conflict
 * (duplicate code — astronomically unlikely with USR-<uuid>) or error.
 */
export async function createSlaPolicy(policy: NewSlaPolicy): Promise<SlaPolicy | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sla_policies')
    .insert(policy)
    .select()
    .single();

  if (error) {
    console.error('[sla-service] createSlaPolicy error:', error);
    return null;
  }
  return data as SlaPolicy;
}

/** Single policy by code — includes inactive rows (caller checks .active). */
export async function getSlaPolicy(code: string): Promise<SlaPolicy | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sla_policies')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('[sla-service] getSlaPolicy error:', error);
    return null;
  }
  return data as SlaPolicy | null;
}

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
  ruleCode: string,
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
 * Returns an open (non-terminal) lead follow-up task for a lead assigned to a specific agent.
 * Used before auto-task creation (SLA breach handler + cadence tick) to avoid duplicates.
 *
 * "Open" = status NOT IN (completed, cancelled, error).
 *
 * Inner-joins task_gia_meta on the lead in ONE query. (The original two-step
 * form only inspected the agent's single most-recent open gia task — an open
 * task for THIS lead behind a newer one for another lead slipped past the
 * dedup guard. Fixed for the Phase 2 cadence, which leans on this guard.)
 */
export async function getOpenGiaFollowupTask(
  leadId:     string,
  assignedTo: string,
): Promise<Task | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tasks')
    .select('*, task_gia_meta!inner(lead_id)')
    .eq('assigned_to', assignedTo)
    .eq('task_gia_meta.lead_id', leadId)
    .not('status', 'in', '("completed","cancelled","error")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[sla-service] getOpenGiaFollowupTask error:', error);
    return null;
  }
  if (!data) return null;

  // Strip the joined meta — callers expect a plain Task row
  const { task_gia_meta: _meta, ...task } = data as Task & { task_gia_meta: unknown };
  return task as Task;
}

/**
 * Returns all active founders. Used by SLA-01C (founder escalation) —
 * founders are org-wide, never domain-filtered (matches the founder-alert
 * convention in whatsapp-api.ts).
 */
export async function getActiveFounders(): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'founder')
    .eq('is_active', true);

  if (error) {
    console.error('[sla-service] getActiveFounders error:', error);
    return [];
  }
  return (data ?? []) as Pick<Profile, 'id' | 'full_name'>[];
}

/** Full name for a profile id — template-param resolution in the task_due jobs. */
export async function getProfileFullName(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[sla-service] getProfileFullName error:', error);
    return null;
  }
  return (data?.full_name as string | null) ?? null;
}

// ─── Task + lead context for the task_due jobs ───────────────────────────────

export interface TaskGiaContext {
  task: Task;
  lead: {
    id:          string;
    first_name:  string | null;
    last_name:   string | null;
    phone:       string | null;
    domain:      string;
    assigned_to: string | null;
  } | null; // null when the task is not a gia_followup (no meta row)
}

/**
 * Re-reads a task at job-fire time with its linked lead (via task_gia_meta).
 * Used by the due-reminder and overdue-escalation jobs — the job payload is a
 * snapshot at scheduling time and stale by definition.
 */
export async function getTaskWithGiaContext(taskId: string): Promise<TaskGiaContext | null> {
  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    if (error) console.error('[sla-service] getTaskWithGiaContext task error:', error);
    return null;
  }

  const { data: meta } = await admin
    .from('task_gia_meta')
    .select('lead_id, leads(id, first_name, last_name, phone, domain, assigned_to)')
    .eq('task_id', taskId)
    .maybeSingle();

  const leadRow = (meta as { leads?: TaskGiaContext['lead'] } | null)?.leads ?? null;
  return { task: task as Task, lead: leadRow };
}

// ─── Task + assignee context for the lead-agnostic task reminders ────────────

export interface TaskAssigneeContext {
  task: Task;
  assignee: {
    id:         string;
    phone:      string | null;
    first_name: string; // already split from full_name; 'there' fallback
    full_name:  string | null;
    domain:     string;
    reports_to: string | null; // the assignee's direct manager (profiles.id)
  } | null; // null when the task has no assignee or the profile is missing
}

/**
 * Re-reads a task at job-fire time with its ASSIGNED agent's phone + first name.
 * The lead-agnostic twin of getTaskWithGiaContext — used by the due-soon (-30m)
 * and agent-overdue (at-due) WhatsApp reminders, which fire for EVERY task, not
 * just lead-linked ones. Never depends on a task_gia_meta row.
 */
export async function getTaskWithAssignee(taskId: string): Promise<TaskAssigneeContext | null> {
  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    if (error) console.error('[sla-service] getTaskWithAssignee task error:', error);
    return null;
  }

  const assignedTo = (task as Task).assigned_to;
  if (!assignedTo) return { task: task as Task, assignee: null };

  const { data: profile } = await admin
    .from('profiles')
    .select('id, phone, full_name, domain, reports_to')
    .eq('id', assignedTo)
    .maybeSingle();

  if (!profile) return { task: task as Task, assignee: null };

  const first =
    (profile.full_name as string | null)?.trim().split(/\s+/)[0] || 'there';

  return {
    task: task as Task,
    assignee: {
      id:         profile.id as string,
      phone:      (profile.phone as string | null) ?? null,
      first_name: first,
      full_name:  (profile.full_name as string | null) ?? null,
      domain:     profile.domain as string,
      reports_to: (profile.reports_to as string | null) ?? null,
    },
  };
}

/**
 * Resolves the escalation targets for a NON-lead overdue task: the assignee's
 * direct manager (profiles.reports_to) when set, else all managers/admins/
 * founders in the assignee's domain (the lead-task escalation pool, keyed off
 * the assignee instead of a lead). Returns [] only when neither yields a target.
 */
export async function getAssigneeManagers(assignee: {
  domain:     string;
  reports_to: string | null;
}): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  // Prefer the direct manager.
  if (assignee.reports_to) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('id', assignee.reports_to)
      .eq('is_active', true)
      .maybeSingle();

    if (error) console.error('[sla-service] getAssigneeManagers reports_to error:', error);
    if (data) return [data as Pick<Profile, 'id' | 'full_name'>];
    // reports_to set but inactive/missing → fall through to domain managers.
  }

  return getManagersByDomain(assignee.domain);
}

/**
 * Stamps tasks.overdue_at exactly once. Returns true only for the call that
 * actually wrote the stamp — a second fire (or a race) gets false and must
 * not notify. The WHERE overdue_at IS NULL is the exactly-once guarantee.
 */
export async function markTaskOverdueOnce(taskId: string, at: Date): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tasks')
    .update({ overdue_at: at.toISOString() })
    .eq('id', taskId)
    .is('overdue_at', null)
    .select('id');

  if (error) {
    console.error('[sla-service] markTaskOverdueOnce error:', error);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * True when any lead activity was logged after the given time — the overdue
 * rule's clearing event ("the agent did *something* on this lead since due").
 */
export async function hasLeadActivityAfter(leadId: string, after: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lead_activities')
    .select('id')
    .eq('lead_id', leadId)
    .gt('created_at', after)
    .limit(1);

  if (error) {
    console.error('[sla-service] hasLeadActivityAfter error:', error);
    return false;
  }
  return (data ?? []).length > 0;
}

// ─── Writes (admin / service-role only) ──────────────────────────────────────

/**
 * Creates a new pending SLA timer row.
 * Returns the inserted row.
 */
export async function createSlaTimer(
  leadId:           string,
  ruleCode:         string,
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
export async function markSlaTimerFired(leadId: string, ruleCode: string): Promise<void> {
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

// ─── Escalation page reads (/escalations) ────────────────────────────────────
// Admin client with session-derived scope args (the manager+-gated page is the
// trust boundary — getAgentRosterByDomain pattern). domain=null → org-wide
// (admin/founder); a manager's own domain is always passed by the page.
// Deliberately un-cached: an escalation surface must never show stale breaches.

/** Fired timers older than this never surface — breaches are actionable, not historical. */
const ESCALATION_WINDOW_DAYS = 7;

export interface EscalatedLeadRow {
  leadId:       string;
  slug:         string | null;
  name:         string;
  phone:        string | null;
  domain:       string;
  status:       string;
  assigneeName: string | null;
  lastFiredAt:  string;
  /**
   * Who this lead's live breach(es) escalate to — the union of `recipient_role`
   * across every matched (status-equal) breach policy, ordered agent→manager→
   * founder. Drives the "Alerted" column. A nurturing breach, e.g., yields
   * ['agent','manager'] (SLA-04A + SLA-04B); a founder rule adds 'founder'.
   */
  recipients:   SlaRecipientRole[];
}

// Escalation-ladder order for the recipient chips (agent first, founder last).
const RECIPIENT_ORDER: Record<SlaRecipientRole, number> = { agent: 0, manager: 1, founder: 2 };

interface FiredTimerJoinRow {
  lead_id:           string;
  rule_code:         string;
  status:            string;
  fired_at:          string | null;
  scheduled_fire_at: string | null;
  leads: {
    id:         string;
    slug:       string | null;
    first_name: string | null;
    last_name:  string | null;
    phone:      string | null;
    domain:     string;
    status:     string;
    assignee:   { full_name: string | null } | null;
  } | null;
}

function leadDisplayName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || 'Unknown lead';
}

/**
 * Leads with a LIVE status-SLA breach in the last 7 days whose status STILL
 * matches the breached rule's trigger — i.e. the breach is real, the lead has
 * not moved on. Cadence fires (CAD-*) are routine engine ticks, never listed.
 * One row per lead, all breached rule codes collected, newest breach first.
 *
 * A breach is counted from EITHER source (so the page reflects reality even if
 * the Trigger.dev fire-job is late, undeployed, or a single run was missed):
 *   • a `fired` timer (the engine fired it) — breach time = fired_at;
 *   • a `pending` timer whose scheduled_fire_at is already in the past — the
 *     deadline has passed but the callback hasn't run yet. This is the same
 *     definition the fire-job itself uses (deadline passed + status unchanged),
 *     so the list never depends on the async callback having succeeded.
 * The policy/status-match guard below is what keeps a pending-overdue timer
 * honest: if the lead has moved on, it is not a live breach and is dropped.
 */
export async function getEscalatedLeads(
  domain: AppDomain | null,
  assignedTo?: string | null,
): Promise<EscalatedLeadRow[]> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const windowStart = new Date(Date.now() - ESCALATION_WINDOW_DAYS * 86_400_000).toISOString();

  let query = admin
    .from('lead_sla_timers')
    .select(
      `lead_id, rule_code, status, fired_at, scheduled_fire_at,
       leads!inner(id, slug, first_name, last_name, phone, domain, status,
         assignee:profiles!leads_assigned_to_fkey(full_name))`,
    )
    // fired (engine ran) OR pending-and-past-deadline (engine hasn't, but the
    // breach is real). The 7-day window is applied per-source below.
    .in('status', ['fired', 'pending'])
    .or(`fired_at.gte.${windowStart},and(status.eq.pending,scheduled_fire_at.lte.${nowIso})`)
    .is('leads.archived_at', null)
    .not('leads.status', 'in', '("won","lost","junk")')
    .order('scheduled_fire_at', { ascending: false })
    .limit(500);
  if (domain) query = query.eq('leads.domain', domain);
  // Self-scope (the agent escalations view): only this agent's own leads.
  if (assignedTo) query = query.eq('leads.assigned_to', assignedTo);

  const { data, error } = await query;
  if (error) {
    console.error('[sla-service] getEscalatedLeads error:', error);
    return [];
  }

  // Keep only breaches whose policy still matches the lead's current status —
  // a fired SLA-01 timer on a lead now in_discussion is resolved, not live.
  const policies = await getSlaPolicies();
  const byCode = new Map(policies.map((p) => [p.code, p]));

  const grouped = new Map<string, EscalatedLeadRow>();
  // Per-lead recipient accumulator — a Set so the same role across two breached
  // codes collapses; ordered into the row at the end.
  const recipientSets = new Map<string, Set<SlaRecipientRole>>();
  for (const row of mapRows<FiredTimerJoinRow, FiredTimerJoinRow>(data, (r) => r)) {
    const lead = row.leads;
    if (!lead) continue;
    if (isCadenceCode(row.rule_code)) continue;

    // Resolve the breach moment from whichever source applies.
    const breachedAt =
      row.status === 'fired'
        ? row.fired_at
        : row.scheduled_fire_at && row.scheduled_fire_at <= nowIso
          ? row.scheduled_fire_at
          : null;
    if (!breachedAt) continue;
    // 7-day window applies to the resolved breach moment (matches the fired path).
    if (breachedAt < windowStart) continue;

    const policy = byCode.get(row.rule_code);
    if (!policy || policy.trigger_kind !== 'status') continue;
    if (policy.trigger_value !== lead.status) continue;

    // This breach escalates to the policy's recipient role — record it.
    let roles = recipientSets.get(lead.id);
    if (!roles) recipientSets.set(lead.id, (roles = new Set<SlaRecipientRole>()));
    roles.add(policy.recipient_role);

    const existing = grouped.get(lead.id);
    if (existing) {
      if (breachedAt > existing.lastFiredAt) existing.lastFiredAt = breachedAt;
    } else {
      grouped.set(lead.id, {
        leadId:       lead.id,
        slug:         lead.slug,
        name:         leadDisplayName(lead.first_name, lead.last_name),
        phone:        lead.phone,
        domain:       lead.domain,
        status:       lead.status,
        assigneeName: lead.assignee?.full_name ?? null,
        lastFiredAt:  breachedAt,
        recipients:   [],
      });
    }
  }

  // Fold the accumulated recipient sets into each row, escalation-ladder order.
  for (const [leadId, roles] of recipientSets) {
    const row = grouped.get(leadId);
    if (row) row.recipients = [...roles].sort((a, b) => RECIPIENT_ORDER[a] - RECIPIENT_ORDER[b]);
  }

  return [...grouped.values()].sort((a, b) => b.lastFiredAt.localeCompare(a.lastFiredAt));
}

export interface OverdueTaskEscalationRow {
  taskId:       string;
  title:        string;
  dueAt:        string | null;
  overdueAt:    string;
  priority:     string;
  assigneeName: string | null;
  leadId:       string;
  leadSlug:     string | null;
  leadName:     string;
  leadDomain:   string;
}

interface OverdueTaskJoinRow {
  id:          string;
  title:       string;
  due_at:      string | null;
  overdue_at:  string | null;
  priority:    string;
  assigned_to: string | null;
  task_gia_meta: {
    lead_id: string;
    leads: {
      id:         string;
      slug:       string | null;
      first_name: string | null;
      last_name:  string | null;
      domain:     string;
    } | null;
  } | null;
}

/**
 * Open Gia follow-up tasks that are past due. Newest overdue first.
 *
 * A task counts as overdue from EITHER signal (so the page reflects reality even
 * when the Trigger.dev overdue-stamp job is late, undeployed, or skipped a run):
 *   • `overdue_at` is stamped (the engine ran the +30min clearing check) — the
 *     authoritative breach moment; OR
 *   • `due_at` is already in the past — the deadline passed but the stamp job
 *     hasn't run yet. We surface it immediately, using `due_at` as the breach
 *     moment, rather than waiting on the async callback.
 * Either way the row is a real, open, past-due follow-up.
 */
export async function getOverdueGiaTasks(
  domain: AppDomain | null,
  assignedTo?: string | null,
): Promise<OverdueTaskEscalationRow[]> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  let query = admin
    .from('tasks')
    .select(
      `id, title, due_at, overdue_at, priority, assigned_to,
       task_gia_meta!inner(lead_id,
         leads!inner(id, slug, first_name, last_name, domain))`,
    )
    // stamped overdue OR deadline already passed (stamp may simply not have run)
    .or(`overdue_at.not.is.null,and(due_at.not.is.null,due_at.lte.${nowIso})`)
    .in('status', ['to_do', 'in_progress', 'in_review'])
    .is('task_gia_meta.leads.archived_at', null)
    .order('due_at', { ascending: false })
    .limit(100);
  if (domain) query = query.eq('task_gia_meta.leads.domain', domain);
  // Self-scope (the agent escalations view): only tasks assigned to this agent.
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const { data, error } = await query;
  if (error) {
    console.error('[sla-service] getOverdueGiaTasks error:', error);
    return [];
  }

  const rows = mapRows<OverdueTaskJoinRow, OverdueTaskJoinRow>(data, (r) => r)
    .filter((r) => r.task_gia_meta?.leads)
    // Resolve the breach moment: the stamp if present, else the past due_at.
    .map((r) => ({
      ...r,
      _overdueAt: r.overdue_at ?? (r.due_at && r.due_at <= nowIso ? r.due_at : null),
    }))
    .filter((r) => r._overdueAt !== null)
    .sort((a, b) => (b._overdueAt! > a._overdueAt! ? 1 : -1));

  // Batch-resolve assignee names (tasks has no profiles FK embed alias)
  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', assigneeIds);
    for (const p of profiles ?? []) names.set(p.id as string, p.full_name as string);
  }

  return rows.map((r) => {
    const lead = r.task_gia_meta!.leads!;
    return {
      taskId:       r.id,
      title:        r.title,
      dueAt:        r.due_at,
      overdueAt:    r._overdueAt!,
      priority:     r.priority,
      assigneeName: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
      leadId:       lead.id,
      leadSlug:     lead.slug,
      leadName:     leadDisplayName(lead.first_name, lead.last_name),
      leadDomain:   lead.domain,
    };
  });
}

export interface GoingColdLeadRow {
  leadId:         string;
  slug:           string | null;
  name:           string;
  phone:          string | null;
  domain:         string;
  status:         string;
  assigneeName:   string | null;
  lastActivityAt: string | null;
}

interface ColdLeadJoinRow {
  id:               string;
  slug:             string | null;
  first_name:       string | null;
  last_name:        string | null;
  phone:            string | null;
  domain:           string;
  status:           string;
  last_activity_at: string | null;
  assignee:         { full_name: string | null } | null;
}

/**
 * Non-terminal leads with no activity for COLD_LEAD_THRESHOLD_DAYS — the exact
 * predicate behind /leads?going_cold=true and the dashboard Going Cold widget.
 * Coldest (oldest activity) first.
 *
 * Admin client (the escalations page + the Elaya tool are the trust boundary —
 * both pass session-derived scope). `scope` is optional and additive:
 *   • `{ domain }`     → one Gia domain (the escalations call; manager pinned).
 *   • `{ assignedTo }` → one agent's own leads (the Elaya agent caller — the
 *                        per-caller identity contract: an agent sees only their
 *                        own cold leads, never the whole domain's).
 * Both may be combined; absent → unscoped (admin/founder all-domains).
 *
 * NOTE: NULL `last_activity_at` (never-contacted) is excluded by `lt()` — those
 * are SLA-01A's job, not the going-cold preset (mirrors getLeadsByRole).
 */
export async function getGoingColdLeads(
  scope?: { domain?: AppDomain | null; assignedTo?: string | null },
): Promise<GoingColdLeadRow[]> {
  const admin = createAdminClient();
  const threshold = goingColdCutoff();

  let query = admin
    .from('leads')
    .select(
      `id, slug, first_name, last_name, phone, domain, status, last_activity_at,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
    )
    .is('archived_at', null)
    .not('status', 'in', '("won","lost","junk")')
    .lt('last_activity_at', threshold)
    .order('last_activity_at', { ascending: true })
    .limit(100);
  if (scope?.domain) query = query.eq('domain', scope.domain);
  if (scope?.assignedTo) query = query.eq('assigned_to', scope.assignedTo);

  const { data, error } = await query;
  if (error) {
    console.error('[sla-service] getGoingColdLeads error:', error);
    return [];
  }

  return mapRows<ColdLeadJoinRow, GoingColdLeadRow>(data, (r) => ({
    leadId:         r.id,
    slug:           r.slug,
    name:           leadDisplayName(r.first_name, r.last_name),
    phone:          r.phone,
    domain:         r.domain,
    status:         r.status,
    assigneeName:   r.assignee?.full_name ?? null,
    lastActivityAt: r.last_activity_at,
  }));
}
