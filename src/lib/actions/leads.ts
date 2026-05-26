'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AddCallNoteSchema,
  UpdateLeadStatusSchema,
  AssignLeadSchema,
  UpdateScratchpadSchema,
} from '@/lib/validations/lead-schema';
import { formErrors } from '@/lib/validations/form-errors';
import type { ActionResult } from '@/lib/types/index';
import type { LeadStatus } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Auth helper — get current user's profile
// ─────────────────────────────────────────────
async function getCallerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, domain')
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
    .select('id, status, assigned_to, domain')
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

  // 4. Update lead status
  await admin.from('leads').update({ status }).eq('id', leadId);

  // 5. Log status_changed activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'status_changed',
    details:     { old_status: oldStatus, new_status: status, ...(reason ? { reason } : {}) },
  });

  // 6. Side effects — nurturing: auto-create follow-up task in 3 months
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
        status:      'pending',
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

  return { data: { leadId }, error: null };
}

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
  await admin
    .from('leads')
    .update({
      assigned_to:        agentId,
      assigned_at:        new Date().toISOString(),
      private_scratchpad: null,
    })
    .eq('id', leadId);

  // 4. Log agent_assigned activity
  await admin.from('lead_activities').insert({
    lead_id:     leadId,
    actor_id:    caller.id,
    action_type: 'agent_assigned',
    details:     { assigned_to: agentId, method: 'manual' },
  });

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
