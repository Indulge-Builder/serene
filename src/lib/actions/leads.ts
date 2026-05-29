'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AddCallNoteSchema,
  UpdateLeadStatusSchema,
  AssignLeadSchema,
  UpdateScratchpadSchema,
  UpdatePersonalDetailsSchema,
  CreateManualLeadSchema,
} from '@/lib/validations/lead-schema';
import { formErrors } from '@/lib/validations/form-errors';
import { sanitizeText } from '@/lib/utils/sanitize';
import { getAgentsForDomain } from '@/lib/services/leads-service';
import { createNotification } from '@/lib/services/notifications-service';
import { scheduleSlaTimersForLead, cancelSlaTimersForLead, refreshActivitySlaTimers } from '@/lib/actions/sla';
import type { ActionResult } from '@/lib/types/index';
import type { LeadStatus, AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Auth helper — get current user's profile
// TD-001: this is a duplicate of getCurrentProfile() in profiles-service.ts
// (Rule A-03 / Rule 04 violation). Replace with:
//   import { getCurrentProfile } from '@/lib/services/profiles-service';
// and remove this function when leads.ts is next touched. See docs/tech-debt.md.
// ─────────────────────────────────────────────
async function getCallerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, domain, full_name')
    .eq('id', user.id)
    .single();

  return profile ?? null;
}

// ─────────────────────────────────────────────
// Action: addLeadCallNote
// ─────────────────────────────────────────────
export async function addLeadCallNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string }>> {
  // 1. Validate
  const parsed = AddCallNoteSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, content, callOutcome } = parsed.data;

  // 2. Auth check
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Verify access to this lead
  const { data: lead } = await supabase
    .from('leads')
    .select('id, status, assigned_to, domain, call_count')
    .eq('id', leadId)
    .single();

  if (!lead) return { data: null, error: 'Lead not found.' };

  const hasAccess =
    (caller.role === 'agent' && lead.assigned_to === caller.id) ||
    (caller.role === 'manager' && lead.domain === (caller.domain as string)) ||
    caller.role === 'admin' ||
    caller.role === 'founder';

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();

  // 4. Insert note (append-only)
  const { data: note, error: noteError } = await admin
    .from('lead_notes')
    .insert({
      lead_id:      leadId,
      author_id:    caller.id,
      content,
      call_outcome: callOutcome,
    })
    .select('id')
    .single();

  if (noteError || !note) return { data: null, error: formErrors.generic };

  // 5. Update call_count + last_call_outcome on lead
  const newCallCount = (lead.call_count as number) + 1;
  const currentStatus = lead.status as LeadStatus;
  const shouldAutoAdvance = currentStatus === 'new';

  await admin
    .from('leads')
    .update({
      call_count:        newCallCount,
      last_call_outcome: callOutcome,
      ...(shouldAutoAdvance ? { status: 'touched' as const } : {}),
    })
    .eq('id', leadId);

  // 6. Log call_logged activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'call_logged',
    details:     { outcome: callOutcome, call_count: newCallCount },
  });

  // 7. Log note_added activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'note_added',
    details:     { call_outcome: callOutcome },
  });

  // 8. Log status_changed if auto-advanced new → touched
  if (shouldAutoAdvance) {
    await admin.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    caller.id,
      action_type: 'status_changed',
      details:     { old_status: 'new', new_status: 'touched' },
    });
  }

  // 9. SLA: update last_activity_at on lead
  const now = new Date().toISOString();
  await admin.from('leads').update({ last_activity_at: now }).eq('id', leadId);

  // 10. SLA: if auto-advanced new→touched, full SLA reset via scheduleSlaTimersForLead;
  //     otherwise refresh only SLA-02/03 timers (SLA-01 not touched by activity).
  const postStatus = shouldAutoAdvance ? 'touched' : (currentStatus as string);
  const assignedTo = lead.assigned_to as string | null;

  if (shouldAutoAdvance) {
    // Status changed — full SLA reschedule (SLA-01 cancelled, SLA-02/03 scheduled)
    scheduleSlaTimersForLead({
      leadId,
      status:     'touched',
      assignedAt: now,
      assignedTo: assignedTo ?? caller.id,
      domain:     lead.domain as string,
    }).catch(() => {}); // fire-and-forget, non-fatal
  } else if (assignedTo && ['touched', 'in_discussion'].includes(postStatus)) {
    // Activity on an existing non-new lead — refresh only SLA-02/03 timers
    refreshActivitySlaTimers({
      leadId,
      status:     postStatus,
      assignedTo,
      domain:     lead.domain as string,
    }).catch(() => {}); // fire-and-forget, non-fatal
  }

  return { data: { noteId: note.id as string }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadStatus
// ─────────────────────────────────────────────
export async function updateLeadStatus(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  // 1. Validate
  const parsed = UpdateLeadStatusSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, status, reason } = parsed.data;

  // 2. Auth check
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch lead for access check + old status
  const { data: lead } = await supabase
    .from('leads')
    .select('id, status, assigned_to, domain, first_name, last_name')
    .eq('id', leadId)
    .single();

  if (!lead) return { data: null, error: 'Lead not found.' };

  const hasAccess =
    (caller.role === 'agent' && lead.assigned_to === caller.id) ||
    (caller.role === 'manager' && lead.domain === (caller.domain as string)) ||
    caller.role === 'admin' ||
    caller.role === 'founder';

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  const oldStatus = lead.status as LeadStatus;
  if (oldStatus === status) return { data: { leadId }, error: null };

  const admin = createAdminClient();

  // 4. Update lead status + status_changed_at
  const statusChangedAt = new Date().toISOString();
  await admin.from('leads').update({ status, status_changed_at: statusChangedAt }).eq('id', leadId);

  // 5. Log status_changed activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'status_changed',
    details:     { old_status: oldStatus, new_status: status, ...(reason ? { reason } : {}) },
  });

  // 6. Side effects — won: notify managers in the lead's domain
  if (status === 'won') {
    const firstName   = (lead.first_name as string | null) ?? 'A lead';
    const lastName    = lead.last_name as string | null;
    const displayName = lastName ? `${firstName} ${lastName}` : firstName;

    // Fetch all managers in this domain to notify
    const { data: managers } = await admin
      .from('profiles')
      .select('id')
      .eq('domain', lead.domain as AppDomain)
      .in('role', ['manager', 'admin', 'founder'])
      .eq('is_active', true);

    if (managers && managers.length > 0) {
      await Promise.all(
        managers.map((m: { id: string }) =>
          createNotification({
            recipient_id: m.id,
            type:         'lead_won',
            title:        `Lead won — ${displayName}`,
            body:         `Marked won by ${caller.full_name}`,
            action_url:   `/leads/${leadId}`,
          }),
        ),
      );
    }
  }

  // 7. Side effects — nurturing: auto-create follow-up task in 3 months
  if (status === 'nurturing') {
    const dueAt = new Date();
    dueAt.setMonth(dueAt.getMonth() + 3);

    const { data: task } = await admin
      .from('tasks')
      .insert({
        assigned_to: (lead.assigned_to as string | null) ?? caller.id,
        created_by:  caller.id,
        module:      'gia',
        task_type:   'general_follow_up',
        status:      'to_do',
        due_at:      dueAt.toISOString(),
      })
      .select('id')
      .single();

    if (task) {
      await admin.from('task_gia_meta').insert({
        task_id:      task.id as string,
        lead_id:      leadId,
        call_outcome: null,
      });
    }
  }

  // SLA: reschedule or cancel timers based on new status
  const assignedAgentId = lead.assigned_to as string | null;
  if (TERMINAL_SLA_STATUSES.has(status)) {
    // Terminal → cancel all timers, schedule none
    cancelSlaTimersForLead({ leadId }).catch(() => {});
  } else if (assignedAgentId) {
    // Non-terminal → full reschedule from now
    scheduleSlaTimersForLead({
      leadId,
      status,
      assignedAt: statusChangedAt,
      assignedTo: assignedAgentId,
      domain:     lead.domain as string,
    }).catch(() => {});
  }

  return { data: { leadId }, error: null };
}

// Terminal statuses for SLA purposes (no new timers)
const TERMINAL_SLA_STATUSES = new Set<LeadStatus>(['won', 'lost', 'junk']);

// ─────────────────────────────────────────────
// Action: assignLead (manual reassign)
// ─────────────────────────────────────────────
export async function assignLead(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  // 1. Validate
  const parsed = AssignLeadSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, agentId } = parsed.data;

  // 2. Auth — only manager, admin, founder can manually assign
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!['manager', 'admin', 'founder'].includes(caller.role)) {
    return { data: null, error: formErrors.unauthorized };
  }

  const admin = createAdminClient();

  // 3. Reassign + clear scratchpad (per spec: incoming agent starts blank)
  const assignedAt = new Date().toISOString();
  await admin
    .from('leads')
    .update({
      assigned_to:        agentId,
      assigned_at:        assignedAt,
      private_scratchpad: null,
      status_changed_at:  assignedAt,
      last_activity_at:   assignedAt,
    })
    .eq('id', leadId);

  // 4. Log agent_assigned activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'agent_assigned',
    details:     { assigned_to: agentId, method: 'manual' },
  });

  // 5. Notify the receiving agent — fire-and-forget, non-fatal
  createNotification({
    recipient_id: agentId,
    type:         'lead_assigned',
    title:        'New lead assigned to you',
    body:         `Assigned by ${caller.full_name}`,
    action_url:   `/leads/${leadId}`,
  }).catch(() => {});

  // 6. SLA: fetch lead's current status + domain to schedule timers
  const { data: assignedLead } = await admin
    .from('leads')
    .select('status, domain')
    .eq('id', leadId)
    .single();

  if (assignedLead) {
    scheduleSlaTimersForLead({
      leadId,
      status:     assignedLead.status as string,
      assignedAt,
      assignedTo: agentId,
      domain:     assignedLead.domain as string,
    }).catch(() => {}); // fire-and-forget, non-fatal
  }

  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateScratchpad (debounced auto-save)
// ─────────────────────────────────────────────
export async function updateScratchpad(
  input: unknown,
): Promise<ActionResult<null>> {
  // 1. Validate
  const parsed = UpdateScratchpadSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, content } = parsed.data;

  // 2. Auth — only assigned agent, admin, founder
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from('leads')
    .select('assigned_to')
    .eq('id', leadId)
    .single();

  if (!lead) return { data: null, error: 'Lead not found.' };

  const canEdit =
    (caller.role === 'agent' && lead.assigned_to === caller.id) ||
    caller.role === 'admin' ||
    caller.role === 'founder';

  if (!canEdit) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();
  await admin.from('leads').update({ private_scratchpad: content }).eq('id', leadId);

  return { data: null, error: null };
}

// ─────────────────────────────────────────────
// Action: updatePersonalDetails (agent-collected enrichment)
// ─────────────────────────────────────────────
export async function updatePersonalDetails(
  input: unknown,
): Promise<ActionResult<null>> {
  // 1. Validate
  const parsed = UpdatePersonalDetailsSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, details } = parsed.data;

  // 2. Auth — assigned agent, manager, admin, founder
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from('leads')
    .select('assigned_to, domain, personal_details')
    .eq('id', leadId)
    .single();

  if (!lead) return { data: null, error: 'Lead not found.' };

  const hasAccess =
    (caller.role === 'agent' && lead.assigned_to === caller.id) ||
    (caller.role === 'manager' && lead.domain === (caller.domain as string)) ||
    caller.role === 'admin' ||
    caller.role === 'founder';

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 3. Merge into existing JSONB — sanitize, strip empty strings, preserve prior keys
  const existing = (lead.personal_details ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...existing };
  for (const [k, rawV] of Object.entries(details)) {
    const v = sanitizeText(String(rawV));
    if (v === '') {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }

  const admin = createAdminClient();
  await admin.from('leads').update({ personal_details: merged }).eq('id', leadId);

  return { data: null, error: null };
}

// ─────────────────────────────────────────────
// Action: createManualLead
// ─────────────────────────────────────────────
export async function createManualLead(
  input: unknown,
): Promise<ActionResult<{ leadId: string; duplicate?: boolean }>> {
  // 1. Zod validate — first line, always (Rule S-01)
  const parsed = CreateManualLeadSchema.safeParse(input);
  if (!parsed.success) {
    const phoneIssue = parsed.error.issues.find((i) => i.path[0] === 'phone');
    if (phoneIssue) return { data: null, error: formErrors.phoneInvalid };
    return { data: null, error: formErrors.generic };
  }

  const fields = parsed.data;

  // 2. Auth check (Rule A-01)
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  // 3. Domain enforcement: agents cannot submit to any domain other than their own (Rule S-06, S-14)
  const resolvedDomain =
    caller.role === 'agent' ? caller.domain : fields.domain;

  // 4. Resolve assigned_to — defaults to caller; verify cross-domain if explicitly provided
  const admin = createAdminClient();
  let assignedTo: string | null = fields.assigned_to ?? caller.id;

  if (fields.assigned_to && fields.assigned_to !== caller.id) {
    // Only manager/admin/founder can assign to another agent
    if (caller.role === 'agent') {
      return { data: null, error: formErrors.unauthorized };
    }
    // Verify the target agent exists in the resolved domain
    const { data: targetAgent } = await admin
      .from('profiles')
      .select('id, domain, role, is_active')
      .eq('id', fields.assigned_to)
      .single();

    if (
      !targetAgent ||
      targetAgent.role !== 'agent' ||
      targetAgent.domain !== resolvedDomain ||
      !targetAgent.is_active
    ) {
      return { data: null, error: 'The selected agent is not available in this domain.' };
    }
    assignedTo = fields.assigned_to;
  }

  // 5. sanitizeText on text fields (already done by Zod transforms in schema)
  //    normalizeToE164 on phone (already done by Zod transform in schema)
  const { first_name, last_name, phone, email, manual_source } = fields;

  // 6. Duplicate check via get_active_lead_by_phone (Rule S-09 / dedup spec)
  //    Uses admin client — function is SECURITY DEFINER, service role only
  //    Cast through unknown: RPC function not yet in generated DB types
  const { data: existingLeads } = await (admin as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: { id: string }[] | null }> })
    .rpc('get_active_lead_by_phone', { p_phone: phone });

  if (existingLeads && existingLeads.length > 0) {
    return { data: { leadId: existingLeads[0].id, duplicate: true }, error: null };
  }

  // 7. INSERT lead — platform = 'manual', source = null, form_data = {}, status = 'new'
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from('leads')
    .insert({
      first_name,
      last_name:          last_name ?? null,
      email:              email ?? null,
      phone,
      domain:             resolvedDomain,
      assigned_to:        assignedTo,
      assigned_at:        assignedTo ? now : null,
      status:             'new',
      status_changed_at:  assignedTo ? now : null,
      last_activity_at:   assignedTo ? now : null,
      lead_intent:        null,
      platform:           null,
      campaign_id:        null,
      ad_name:            null,
      utm_source:         null,
      utm_medium:         null,
      utm_campaign:       null,
      utm_content:        null,
      form_data:          manual_source ? { manual_source } : {},
      last_call_outcome:  null,
      private_scratchpad: null,
      personal_details:   null,
      archived_at:        null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return { data: null, error: formErrors.generic };
  }

  const leadId = inserted.id as string;

  // 8. INSERT lead_created activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'lead_created',
    details:     {
      source:        'manual',
      manual_source: manual_source ?? null,
      domain:        resolvedDomain,
    },
  });

  // 9. INSERT agent_assigned activity if assigned_to is set
  if (assignedTo) {
    await admin.from('lead_activities').insert({
      lead_id:     leadId,
      actor_id:    caller.id,
      action_type: 'agent_assigned',
      details:     { assigned_to: assignedTo, method: 'manual' },
    });

    // Notify the assigned agent (only when it differs from the caller)
    if (assignedTo !== caller.id) {
      createNotification({
        recipient_id: assignedTo,
        type:         'lead_assigned',
        title:        'New lead assigned to you',
        body:         `Manually added by ${caller.full_name}`,
        action_url:   `/leads/${leadId}`,
      }).catch(() => {});
    }
  }

  // 10. SLA: schedule timers for new lead if assigned
  if (assignedTo) {
    scheduleSlaTimersForLead({
      leadId,
      status:     'new',
      assignedAt: now,
      assignedTo,
      domain:     resolvedDomain as string,
    }).catch(() => {}); // fire-and-forget, non-fatal
  }

  // 11. Return success
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Read action: list active agents for a domain
// Called by AddLeadModal when domain select changes (manager/admin/founder)
// ─────────────────────────────────────────────
export async function listAgentsForDomain(
  domain: string,
): Promise<ActionResult<{ id: string; full_name: string }[]>> {
  const caller = await getCallerProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const agents = await getAgentsForDomain(domain);
  return { data: agents, error: null };
}
