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
import { COLD_LEAD_THRESHOLD_DAYS } from '@/lib/constants/leads';
import type { LeadSlaTimer, Profile, Task, AppDomain, SlaPolicy, SlaHoursMode } from '@/lib/types/database';

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
 * Returns an open (non-terminal) gia_followup task for a lead assigned to a specific agent.
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
    .eq('task_category', 'gia_followup')
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
  ruleCodes:    string[];
  lastFiredAt:  string;
}

interface FiredTimerJoinRow {
  lead_id:   string;
  rule_code: string;
  fired_at:  string | null;
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
 * Leads with a fired status-SLA timer in the last 7 days whose status STILL
 * matches the breached rule's trigger — i.e. the breach is live, the lead has
 * not moved on. Cadence fires (CAD-*) are routine engine ticks, never listed.
 * One row per lead, all breached rule codes collected, newest fire first.
 */
export async function getEscalatedLeads(domain: AppDomain | null): Promise<EscalatedLeadRow[]> {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - ESCALATION_WINDOW_DAYS * 86_400_000).toISOString();

  let query = admin
    .from('lead_sla_timers')
    .select(
      `lead_id, rule_code, fired_at,
       leads!inner(id, slug, first_name, last_name, phone, domain, status,
         assignee:profiles!leads_assigned_to_fkey(full_name))`,
    )
    .eq('status', 'fired')
    .gte('fired_at', windowStart)
    .is('leads.archived_at', null)
    .not('leads.status', 'in', '("won","lost","junk")')
    .order('fired_at', { ascending: false })
    .limit(500);
  if (domain) query = query.eq('leads.domain', domain);

  const { data, error } = await query;
  if (error) {
    console.error('[sla-service] getEscalatedLeads error:', error);
    return [];
  }

  // Keep only fires whose policy still matches the lead's current status —
  // a fired SLA-01 timer on a lead now in_discussion is resolved, not live.
  const policies = await getSlaPolicies();
  const byCode = new Map(policies.map((p) => [p.code, p]));

  const grouped = new Map<string, EscalatedLeadRow>();
  for (const row of mapRows<FiredTimerJoinRow, FiredTimerJoinRow>(data, (r) => r)) {
    const lead = row.leads;
    if (!lead || !row.fired_at) continue;
    if (isCadenceCode(row.rule_code)) continue;

    const policy = byCode.get(row.rule_code);
    if (!policy || policy.trigger_kind !== 'status') continue;
    if (policy.trigger_value !== lead.status) continue;

    const existing = grouped.get(lead.id);
    if (existing) {
      if (!existing.ruleCodes.includes(row.rule_code)) existing.ruleCodes.push(row.rule_code);
      if (row.fired_at > existing.lastFiredAt) existing.lastFiredAt = row.fired_at;
    } else {
      grouped.set(lead.id, {
        leadId:       lead.id,
        slug:         lead.slug,
        name:         leadDisplayName(lead.first_name, lead.last_name),
        phone:        lead.phone,
        domain:       lead.domain,
        status:       lead.status,
        assigneeName: lead.assignee?.full_name ?? null,
        ruleCodes:    [row.rule_code],
        lastFiredAt:  row.fired_at,
      });
    }
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
  overdue_at:  string;
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
 * Open gia_followup tasks the overdue engine has stamped (tasks.overdue_at,
 * migration 0113) — the agent missed the due time AND the +30min clearing
 * window. Newest overdue first.
 */
export async function getOverdueGiaTasks(domain: AppDomain | null): Promise<OverdueTaskEscalationRow[]> {
  const admin = createAdminClient();

  let query = admin
    .from('tasks')
    .select(
      `id, title, due_at, overdue_at, priority, assigned_to,
       task_gia_meta!inner(lead_id,
         leads!inner(id, slug, first_name, last_name, domain))`,
    )
    .not('overdue_at', 'is', null)
    .in('status', ['to_do', 'in_progress', 'in_review'])
    .is('task_gia_meta.leads.archived_at', null)
    .order('overdue_at', { ascending: false })
    .limit(100);
  if (domain) query = query.eq('task_gia_meta.leads.domain', domain);

  const { data, error } = await query;
  if (error) {
    console.error('[sla-service] getOverdueGiaTasks error:', error);
    return [];
  }

  const rows = mapRows<OverdueTaskJoinRow, OverdueTaskJoinRow>(data, (r) => r)
    .filter((r) => r.task_gia_meta?.leads);

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
      overdueAt:    r.overdue_at,
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
 */
export async function getGoingColdLeads(domain: AppDomain | null): Promise<GoingColdLeadRow[]> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() - COLD_LEAD_THRESHOLD_DAYS * 86_400_000).toISOString();

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
  if (domain) query = query.eq('domain', domain);

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
