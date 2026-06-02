"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS, leadListKeyPrefix } from "@/lib/constants/redis-keys";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import {
  AddCallNoteSchema,
  AddLeadNoteSchema,
  UpdateLeadEmailSchema,
  UpdateLeadDomainSchema,
  UpdateLeadUtmSourceSchema,
  UpdateLeadStatusSchema,
  AssignLeadSchema,
  UpdateScratchpadSchema,
  UpdatePersonalDetailsSchema,
  CreateManualLeadSchema,
  RecordDealSchema,
  CreateLeadTaskSchema,
  SearchLeadsSchema,
} from "@/lib/validations/lead-schema";
import { formErrors } from "@/lib/validations/form-errors";
import { sanitizeText } from "@/lib/utils/sanitize";
import {
  getAgentsForDomain,
  getActiveUsersForDomain,
  searchLeadsForTask,
  type LeadSearchResult,
} from "@/lib/services/leads-service";
import { createNotification } from "@/lib/services/notifications-service";
import {
  scheduleSlaTimersForLead,
  cancelSlaTimersForLead,
  refreshActivitySlaTimers,
} from "@/lib/actions/sla";
import {
  sendLeadAssignmentNotification,
  sendFounderLeadNotification,
} from "@/lib/services/whatsapp-api";
import { TASK_TYPE_LABELS } from "@/lib/constants/task-types";
import { scheduleTaskReminder } from "@/trigger/task-reminders";
import type { ActionResult } from "@/lib/types/index";
import type { LeadStatus, AppDomain, Task } from "@/lib/types/database";

// ─────────────────────────────────────────────
// Action: addLeadCallNote
// All DB writes execute in one transaction via the add_lead_call_note RPC.
// This action owns: Zod validation, auth, access check, SLA side-effects.
// ─────────────────────────────────────────────
export async function addLeadCallNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string }>> {
  // 1. Validate
  const parsed = AddCallNoteSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, content, callOutcome } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Verify access to this lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, assigned_to, domain, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 4. All DB writes in one atomic round-trip via RPC
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcResult, error: rpcError } = await (admin as any).rpc(
    "add_lead_call_note",
    {
      p_lead_id: leadId,
      p_author_id: caller.id,
      p_content: content,
      p_call_outcome: callOutcome,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { data: null, error: formErrors.generic };

  const {
    note_id: noteId,
    did_auto_advance: didAutoAdvance,
    assigned_to: assignedTo,
    domain,
    old_status: oldStatus,
  } = rpcResult as {
    note_id: string;
    did_auto_advance: boolean;
    assigned_to: string | null;
    domain: string;
    old_status: string;
  };

  // Redis invalidation — awaited so the next dossier load never reads stale data
  try {
    await Promise.all([
      redis.del(REDIS_KEYS.leadRowId(leadId)),
      redis.del(REDIS_KEYS.leadNotes(leadId)),
      redis.del(REDIS_KEYS.leadActivities(leadId)),
    ]);
  } catch (e) {
    console.warn('[leads-action] redis del failed on call note', e);
  }

  // Invalidate dossier RSC cache so the server component reflects the new status/note
  revalidatePath(`/leads/${(lead.slug as string | null) ?? leadId}`);

  // 5. SLA side-effects (fire-and-forget, non-fatal — cannot go in the RPC)
  const postStatus = didAutoAdvance ? "touched" : oldStatus;

  if (didAutoAdvance) {
    scheduleSlaTimersForLead({
      leadId,
      status: "touched",
      assignedAt: now,
      assignedTo: assignedTo ?? caller.id,
      domain,
    }).catch(() => {});
  } else if (assignedTo && ["touched", "in_discussion"].includes(postStatus)) {
    refreshActivitySlaTimers({
      leadId,
      status: postStatus,
      assignedTo,
      domain,
    }).catch(() => {});
  }

  return { data: { noteId: noteId as string }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadStatus
// All DB writes execute in one transaction via the update_lead_status RPC.
// This action owns: Zod validation, auth, access check, won notifications, SLA side-effects.
// ─────────────────────────────────────────────
export async function updateLeadStatus(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  // 1. Validate
  const parsed = UpdateLeadStatusSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, status, reason } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch lead for access check
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, assigned_to, domain, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 4. All DB writes in one atomic round-trip via RPC
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcResult, error: rpcError } = await (admin as any).rpc(
    "update_lead_status",
    {
      p_lead_id: leadId,
      p_actor_id: caller.id,
      p_status: status,
      p_reason: reason ?? null,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { data: null, error: formErrors.generic };

  const result = rpcResult as {
    changed: boolean;
    old_status?: string;
    new_status?: string;
    assigned_to?: string | null;
    domain?: string;
    first_name?: string | null;
    last_name?: string | null;
  };

  // RPC returned early — status was already the same
  if (!result.changed) return { data: { leadId }, error: null };

  // Invalidate dossier RSC cache so the server component reflects the new status
  revalidatePath(`/leads/${(lead.slug as string | null) ?? leadId}`);

  // Redis invalidation — awaited so the next dossier load never reads stale data
  try {
    await Promise.all([
      redis.del(REDIS_KEYS.leadRowId(leadId)),
      redis.del(REDIS_KEYS.leadActivities(leadId)),
    ]);
  } catch (e) {
    console.warn('[leads-action] redis del failed on status update', e);
  }

  const { assigned_to: assignedTo, domain, first_name, last_name } = result;

  // 5. Won: notify all active managers/admins/founders in the domain
  if (status === "won") {
    const displayName = last_name
      ? `${first_name ?? "A lead"} ${last_name}`
      : (first_name ?? "A lead");

    const { data: managers } = await admin
      .from("profiles")
      .select("id")
      .eq("domain", domain as AppDomain)
      .in("role", ["manager", "admin", "founder"])
      .eq("is_active", true);

    if (managers && managers.length > 0) {
      await Promise.all(
        managers.map((m: { id: string }) =>
          createNotification({
            recipient_id: m.id,
            type: "lead_won",
            title: `Lead won — ${displayName}`,
            body: `Marked won by ${caller.full_name}`,
            action_url: `/leads/${leadId}`,
          }),
        ),
      );
    }
  }

  // 6. SLA side-effects (fire-and-forget, non-fatal — cannot go in the RPC)
  if (TERMINAL_SLA_STATUSES.has(status)) {
    cancelSlaTimersForLead({ leadId }).catch(() => {});
  } else if (assignedTo) {
    scheduleSlaTimersForLead({
      leadId,
      status,
      assignedAt: now,
      assignedTo,
      domain: domain as string,
    }).catch(() => {});
  }

  return { data: { leadId }, error: null };
}

// Terminal statuses for SLA purposes (no new timers)
const TERMINAL_SLA_STATUSES = new Set<LeadStatus>(["won", "lost", "junk"]);

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
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };
  if (!["manager", "admin", "founder"].includes(caller.role)) {
    return { data: null, error: formErrors.unauthorized };
  }

  const admin = createAdminClient();

  // 3. Fetch lead's current status + domain before the update (eliminates post-update SELECT)
  const { data: existingLead } = await admin
    .from("leads")
    .select("status, domain, first_name, last_name, phone")
    .eq("id", leadId)
    .single();

  if (!existingLead) return { data: null, error: "Lead not found." };

  // 4. Reassign + clear scratchpad (per spec: incoming agent starts blank)
  const assignedAt = new Date().toISOString();
  await admin
    .from("leads")
    .update({
      assigned_to: agentId,
      assigned_at: assignedAt,
      private_scratchpad: null,
      status_changed_at: assignedAt,
      last_activity_at: assignedAt,
    })
    .eq("id", leadId);

  // 5. Log agent_assigned activity
  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: caller.id,
    action_type: "agent_assigned",
    details: { assigned_to: agentId, method: "manual" },
  });

  // Redis invalidation — fire-and-forget, never blocks the response
  void Promise.all([
    redis.del(REDIS_KEYS.leadRowId(leadId)),
    redis.del(REDIS_KEYS.leadActivities(leadId)),
  ]).catch(() => {});

  // 6. Notify the receiving agent — fire-and-forget, non-fatal
  createNotification({
    recipient_id: agentId,
    type: "lead_assigned",
    title: "New lead assigned to you",
    body: `Assigned by ${caller.full_name}`,
    action_url: `/leads/${leadId}`,
  }).catch(() => {});

  const assignLeadName = existingLead.last_name
    ? `${existingLead.first_name} ${existingLead.last_name}`
    : existingLead.first_name;

  void sendLeadAssignmentNotification(
    agentId,
    assignLeadName,
    existingLead.phone ?? "",
    existingLead.domain as string,
  ).catch((err) => {
    console.error("[leads] assignment notification failed (non-fatal):", err);
  });

  const { data: assignedAgent } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", agentId)
    .single();

  void sendFounderLeadNotification(
    existingLead.domain as string,
    assignedAgent?.full_name ?? "Unknown Agent",
    assignLeadName,
    existingLead.phone ?? "",
  ).catch((err) => {
    console.error("[leads] founder notification failed (non-fatal):", err);
  });

  // 7. SLA: schedule timers using the pre-fetched status + domain (no post-update SELECT)
  scheduleSlaTimersForLead({
    leadId,
    status: existingLead.status as string,
    assignedAt,
    assignedTo: agentId,
    domain: existingLead.domain as string,
  }).catch(() => {});

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
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("assigned_to")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const canEdit =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!canEdit) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();
  await admin
    .from("leads")
    .update({ private_scratchpad: content })
    .eq("id", leadId);

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
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("assigned_to, domain, personal_details")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 3. Merge into existing JSONB — sanitize, strip empty strings, preserve prior keys
  const existing = (lead.personal_details ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...existing };
  for (const [k, rawV] of Object.entries(details)) {
    const v = sanitizeText(String(rawV));
    if (v === "") {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }

  const admin = createAdminClient();
  await admin
    .from("leads")
    .update({ personal_details: merged })
    .eq("id", leadId);

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
    const phoneIssue = parsed.error.issues.find((i) => i.path[0] === "phone");
    if (phoneIssue) return { data: null, error: formErrors.phoneInvalid };
    return { data: null, error: formErrors.generic };
  }

  const fields = parsed.data;

  // 2. Auth check (Rule A-01)
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  // 3. Domain enforcement: agents cannot submit to any domain other than their own (Rule S-06, S-14)
  const resolvedDomain =
    caller.role === "agent" ? caller.domain : fields.domain;

  // 4. Resolve assigned_to — defaults to caller; verify cross-domain if explicitly provided
  const admin = createAdminClient();
  let assignedTo: string | null = fields.assigned_to ?? caller.id;

  if (fields.assigned_to && fields.assigned_to !== caller.id) {
    // Only manager/admin/founder can assign to another agent
    if (caller.role === "agent") {
      return { data: null, error: formErrors.unauthorized };
    }
    // Verify the target agent exists in the resolved domain
    const { data: targetAgent } = await admin
      .from("profiles")
      .select("id, domain, role, is_active, full_name")
      .eq("id", fields.assigned_to)
      .single();

    if (
      !targetAgent ||
      targetAgent.domain !== resolvedDomain ||
      !targetAgent.is_active
    ) {
      return {
        data: null,
        error: "The selected user is not available in this domain.",
      };
    }
    assignedTo = fields.assigned_to;
  }

  // Agent name for notifications — targetAgent is set only when assigning to another agent
  const assignedAgentName =
    fields.assigned_to && fields.assigned_to !== caller.id
      ? ((
          await admin
            .from("profiles")
            .select("full_name")
            .eq("id", fields.assigned_to)
            .single()
        ).data?.full_name ?? "Unknown Agent")
      : caller.full_name;

  // 5. sanitizeText on text fields (already done by Zod transforms in schema)
  //    normalizeToE164 on phone (already done by Zod transform in schema)
  const { first_name, last_name, phone, email, utm_source } = fields;

  // 6. Duplicate check via get_active_lead_by_phone (Rule S-09 / dedup spec)
  //    Cast through unknown: RPC function not yet in generated DB types
  const { data: existingLeads } = await (
    admin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: { id: string }[] | null }>;
    }
  ).rpc("get_active_lead_by_phone", { p_phone: phone });

  if (existingLeads && existingLeads.length > 0) {
    return {
      data: { leadId: existingLeads[0].id, duplicate: true },
      error: null,
    };
  }

  // 7. INSERT lead — utm_source from modal when set; form_data empty for manual leads
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("leads")
    .insert({
      first_name,
      last_name: last_name ?? null,
      email: email ?? null,
      phone,
      domain: resolvedDomain,
      assigned_to: assignedTo,
      assigned_at: assignedTo ? now : null,
      status: "new",
      status_changed_at: assignedTo ? now : null,
      last_activity_at: assignedTo ? now : null,
      lead_intent: null,
      platform: null,
      campaign_id: null,
      ad_name: null,
      utm_source: utm_source ?? null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      form_data: {},
      last_call_outcome: null,
      private_scratchpad: null,
      personal_details: null,
      archived_at: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { data: null, error: formErrors.generic };
  }

  const leadId = inserted.id as string;

  // 8. INSERT lead_created activity
  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: caller.id,
    action_type: "lead_created",
    details: {
      source: "manual",
      utm_source: utm_source ?? null,
      domain: resolvedDomain,
    },
  });

  // 9. INSERT agent_assigned activity if assigned_to is set
  if (assignedTo) {
    await admin.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: caller.id,
      action_type: "agent_assigned",
      details: { assigned_to: assignedTo, method: "manual" },
    });

    // Notify the assigned agent (only when it differs from the caller)
    if (assignedTo !== caller.id) {
      createNotification({
        recipient_id: assignedTo,
        type: "lead_assigned",
        title: "New lead assigned to you",
        body: `Manually added by ${caller.full_name}`,
        action_url: `/leads/${leadId}`,
      }).catch(() => {});
    }

    const manualLeadName = last_name
      ? `${first_name} ${last_name}`
      : first_name;

    void sendLeadAssignmentNotification(
      assignedTo,
      manualLeadName,
      phone,
      resolvedDomain as string,
    ).catch((err) => {
      console.error("[leads] assignment notification failed (non-fatal):", err);
    });

    void sendFounderLeadNotification(
      resolvedDomain as string,
      assignedAgentName,
      manualLeadName,
      phone,
    ).catch((err) => {
      console.error("[leads] founder notification failed (non-fatal):", err);
    });
  }

  // 10. SLA: schedule timers for new lead if assigned
  if (assignedTo) {
    scheduleSlaTimersForLead({
      leadId,
      status: "new",
      assignedAt: now,
      assignedTo,
      domain: resolvedDomain as string,
    }).catch(() => {}); // fire-and-forget, non-fatal
  }

  // 11. Invalidate list cache for this caller so the new lead appears immediately.
  //     Scans all cached page keys for this role+domain+userId triple and deletes them.
  //     Fire-and-forget — a scan failure never blocks the response.
  void (async () => {
    try {
      const prefix = leadListKeyPrefix(caller.role, caller.domain as string, caller.id);
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
        cursor = Number(nextCursor);
        if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]));
      } while (cursor !== 0);
    } catch { /* non-fatal */ }
  })();

  // 12. Return success
  return { data: { leadId }, error: null };
}

type LeadEditContext = {
  id: string;
  assigned_to: string | null;
  domain: string;
  slug: string | null;
};

async function assertLeadFieldEditAccess(
  leadId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      caller: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;
      lead: LeadEditContext;
    }
> {
  const caller = await getCurrentProfile();
  if (!caller) return { ok: false, error: formErrors.unauthorized };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_to, domain, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { ok: false, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { ok: false, error: formErrors.unauthorized };

  return { ok: true, caller, lead };
}

function revalidateLeadDossier(lead: LeadEditContext) {
  const segment = lead.slug ?? lead.id;
  revalidatePath(`/leads/${segment}`);
  // Fire-and-forget Redis invalidation — never blocks the action response
  void redis.del(REDIS_KEYS.leadRowId(lead.id)).catch(() => {});
  if (lead.slug) void redis.del(REDIS_KEYS.leadRowSlug(lead.slug)).catch(() => {});
  void redis.del(REDIS_KEYS.leadActivities(lead.id)).catch(() => {});
}

// ─────────────────────────────────────────────
// Action: updateLeadEmail
// ─────────────────────────────────────────────
export async function updateLeadEmail(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  const parsed = UpdateLeadEmailSchema.safeParse(input);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((i) => i.path[0] === "email");
    if (emailIssue) return { data: null, error: emailIssue.message };
    return { data: null, error: formErrors.generic };
  }

  const { leadId, email } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ email })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: access.caller.id,
    action_type: "note_added",
    details: { type: "lead_email_updated" },
  });

  revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadDomain — manager+ only (agents cannot move domains)
// ─────────────────────────────────────────────
export async function updateLeadDomain(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  const parsed = UpdateLeadDomainSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, domain } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  if (access.caller.role === "agent") {
    return { data: null, error: formErrors.unauthorized };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ domain })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: access.caller.id,
    action_type: "note_added",
    details: { type: "lead_domain_updated", domain },
  });

  revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadUtmSource
// ─────────────────────────────────────────────
export async function updateLeadUtmSource(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  const parsed = UpdateLeadUtmSourceSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, utm_source } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ utm_source })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: access.caller.id,
    action_type: "note_added",
    details: { type: "lead_utm_source_updated", utm_source },
  });

  revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: addLeadNote
// Inserts a plain note (no call outcome) visible to all team members.
// Uses add_lead_plain_note RPC for atomicity (note + activity log).
// ─────────────────────────────────────────────
export async function addLeadNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string }>> {
  const parsed = AddLeadNoteSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, content } = parsed.data;

  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_to, domain")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcResult, error: rpcError } = await (admin as any).rpc(
    "add_lead_plain_note",
    {
      p_lead_id: leadId,
      p_author_id: caller.id,
      p_content: content,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { data: null, error: formErrors.generic };

  // Redis invalidation — awaited so the next dossier load never reads stale data
  try {
    await Promise.all([
      redis.del(REDIS_KEYS.leadNotes(leadId)),
      redis.del(REDIS_KEYS.leadActivities(leadId)),
    ]);
  } catch (e) {
    console.warn('[leads-action] redis del failed on plain note', e);
  }

  return { data: { noteId: rpcResult.note_id }, error: null };
}

// ─────────────────────────────────────────────
// Action: recordDeal
// Called after Won confirmation. Writes deal_type, deal_duration, deal_amount
// then fires updateLeadStatus('won') atomically — both succeed or both fail.
// ─────────────────────────────────────────────
export async function recordDeal(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  // 1. Validate
  const parsed = RecordDealSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { data: null, error: first?.message ?? formErrors.generic };
  }

  const { leadId, deal_type, deal_duration, deal_amount } = parsed.data;

  // 2. Auth check
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch lead for access check
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, assigned_to, domain")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  const admin = createAdminClient();

  // 4. Write deal fields — must succeed before status change
  const { error: dealError } = await admin
    .from("leads")
    .update({
      deal_type,
      deal_duration:
        deal_type === "membership" ? (deal_duration ?? null) : null,
      deal_amount,
    })
    .eq("id", leadId);

  if (dealError) return { data: null, error: formErrors.generic };

  // 5. Mark Won — delegates to updateLeadStatus which handles notifications + SLA
  return updateLeadStatus({ leadId, status: "won" });
}

// ─────────────────────────────────────────────
// Read action: list active agents for a domain
// Called by AddLeadModal when domain select changes (manager/admin/founder)
// ─────────────────────────────────────────────
export async function listAgentsForDomain(
  domain: string,
): Promise<ActionResult<{ id: string; full_name: string }[]>> {
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const users =
    caller.role === "admin" || caller.role === "founder"
      ? await getActiveUsersForDomain(domain)
      : await getAgentsForDomain(domain);
  return { data: users, error: null };
}

// ─────────────────────────────────────────────
// Action: createLeadTaskAction
// Creates a gia_followup task + task_gia_meta atomically via the
// create_lead_gia_task RPC (migration 0054).
// The task is assigned to the lead's current assignee.
// Title is derived from TASK_TYPE_LABELS — never hardcoded.
// ─────────────────────────────────────────────
export async function createLeadTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  // 1. Validate (S-01 — Zod first, always)
  const parsed = CreateLeadTaskSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, taskType, description, priority, dueAt } = parsed.data;

  // 2. Auth
  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const supabase = await createClient();

  // 3. Fetch lead — verify existence and access (S-06, A-09 layer 1)
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_to, domain, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: "Lead not found." };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 4. Derive task title from the canonical constant — never a hardcoded string
  const title = TASK_TYPE_LABELS[taskType];

  // 5. Assign to lead's current assignee, fall back to caller
  const assignedTo = (lead.assigned_to as string | null) ?? caller.id;

  const adminClient = createAdminClient();

  // 6. Atomic two-INSERT via RPC (tasks + task_gia_meta in one transaction)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: rpcError } = await (adminClient as any).rpc(
    "create_lead_gia_task",
    {
      p_lead_id: leadId,
      p_assigned_to: assignedTo,
      p_created_by: caller.id,
      p_task_type: taskType,
      p_title: title,
      p_description: description ?? null,
      p_priority: priority,
      p_due_at: dueAt ? new Date(dueAt).toISOString() : null,
    },
  );

  if (rpcError || !rows || (rows as Task[]).length === 0) {
    return { data: null, error: formErrors.generic };
  }

  const task = (rows as Task[])[0];

  // 7. Schedule Trigger.dev reminder — fire-and-forget, never blocks the action
  if (dueAt) {
    scheduleTaskReminder(task.id, new Date(dueAt), assignedTo).catch(() => {});
  }

  // 8. Invalidate dossier RSC cache so LeadTasksAsync refetches after router.refresh()
  const dossierSegment = (lead.slug as string | null) ?? leadId;
  revalidatePath(`/leads/${dossierSegment}`);

  return { data: task, error: null };
}

// ─────────────────────────────────────────────
// Action: searchLeadsAction
// Used by CreateGiaTaskModal lead picker.
// Returns leads matching query, scoped by the caller's role + domain (A-09).
// ─────────────────────────────────────────────
export async function searchLeadsAction(
  query: string,
): Promise<ActionResult<LeadSearchResult[]>> {
  "use server";

  const parsed = SearchLeadsSchema.safeParse({ query });
  if (!parsed.success) {
    return { data: null, error: "Search query is required." };
  }

  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: formErrors.unauthorized };

  const results = await searchLeadsForTask(
    parsed.data.query,
    caller.role,
    caller.domain,
    caller.id,
  );

  return { data: results, error: null };
}
