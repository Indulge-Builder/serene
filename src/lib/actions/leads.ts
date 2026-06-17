"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { invalidateLeadCaches } from "@/lib/services/lead-cache";
import {
  addLeadNoteCore,
  updateLeadStatusCore,
  assignLeadCore,
  createLeadTaskCore,
} from "@/lib/services/lead-mutations";
import { extractServiceInterests } from "@/lib/services/lead-ingestion";
import {
  AddCallNoteSchema,
  AddLeadNoteSchema,
  UpdateLeadEmailSchema,
  UpdateLeadDomainSchema,
  UpdateLeadSourceSchema,
  UpdateLeadCitySchema,
  UpdateLeadInterestsSchema,
  UpdateLeadStatusSchema,
  AssignLeadSchema,
  UpdatePersonalDetailsSchema,
  CreateManualLeadSchema,
  CreateLeadTaskSchema,
  SearchLeadsSchema,
  ExportLeadsSchema,
} from "@/lib/validations/lead-schema";
import { formErrors } from "@/lib/validations/form-errors";
import { sanitizeText } from "@/lib/utils/sanitize";
import { canonicalizePhone } from "@/lib/utils/phone";
import { LEAD_ASSIGNABLE_ROLES } from "@/lib/constants/roles";
import { isGiaDomain } from "@/lib/constants/domains";
import {
  searchLeadsForTask,
  getLeadsForExport,
  getActivitiesAndNotesForExport,
  type LeadSearchResult,
  type LeadExportItem,
  type LeadActivityWithActor,
  type LeadNoteWithAuthor,
} from "@/lib/services/leads-service";
import {
  scheduleSlaTimersForLead,
  refreshActivitySlaTimers,
  armCadenceForOutcome,
} from "@/lib/actions/sla";
import type { ActionResult, Profile } from "@/lib/types/index";
import type { Task } from "@/lib/types/database";

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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

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
  const slug = lead.slug as string | null;
  await invalidateLeadCaches(
    "addLeadCallNote",
    { leadId, slug, domain: lead.domain as string },
    { row: true, notes: true, activities: true, lists: true },
  );

  // Invalidate dossier + list RSC cache
  revalidatePath(`/leads/${slug ?? leadId}`);
  revalidatePath("/leads");

  // 5. SLA side-effects (fire-and-forget, non-fatal — cannot go in the RPC)
  // armCadenceForOutcome is chained AFTER the schedule/refresh settles — their
  // cancel-all sweeps every run tagged to this lead and would otherwise kill
  // the freshly armed cadence tick. It no-ops unless the outcome is in the
  // cadence set (rnr / switched_off / wrong_number) and the status is armable.
  const postStatus = didAutoAdvance ? "touched" : oldStatus;

  if (didAutoAdvance) {
    const slaAssignee = assignedTo ?? caller.id;
    scheduleSlaTimersForLead({
      leadId,
      status: "touched",
      assignedAt: now,
      assignedTo: slaAssignee,
      domain,
    })
      .then(() =>
        armCadenceForOutcome({
          leadId,
          outcome: callOutcome,
          assignedTo: slaAssignee,
          domain,
          status: "touched",
        }),
      )
      .catch(() => {});
  } else if (assignedTo && ["touched", "in_discussion"].includes(postStatus)) {
    refreshActivitySlaTimers({
      leadId,
      status: postStatus,
      assignedTo,
      domain,
    })
      .then(() =>
        armCadenceForOutcome({
          leadId,
          outcome: callOutcome,
          assignedTo,
          domain,
          status: postStatus,
        }),
      )
      .catch(() => {});
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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

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

  const slug = lead.slug as string | null;

  // Shared mutation core (RPC + awaited invalidation + won-notify fan-out + SLA branch).
  // Same core the Elaya update_lead_status tool executes on confirmation.
  const core = await updateLeadStatusCore(
    { userId: caller.id, role: caller.role, domain: caller.domain, fullName: caller.full_name },
    { leadId, status, reason: reason ?? null },
    { slug, domain: lead.domain as string },
  );
  if (!core.ok) return { data: null, error: formErrors.generic };

  // RPC returned early — status was already the same. No RSC cache work needed.
  if (!core.result.changed) return { data: { leadId }, error: null };

  // Invalidate dossier + list RSC cache (request-context only — stays in the action,
  // not in the core; the Elaya/WhatsApp path has no RSC page to revalidate).
  revalidatePath(`/leads/${slug ?? leadId}`);
  revalidatePath("/leads");

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
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const admin = createAdminClient();

  // 3. Fetch lead + agent name in parallel — eliminates post-update SELECTs
  const [{ data: existingLead }, { data: assignedAgent }] = await Promise.all([
    admin
      .from("leads")
      .select("status, domain, slug, first_name, last_name, phone")
      .eq("id", leadId)
      .single(),
    admin
      .from("profiles")
      .select("full_name, domain, is_active")
      .eq("id", agentId)
      .single(),
  ]);

  if (!existingLead) return { data: null, error: "Lead not found." };

  // Shared mutation core: S-06 manager domain-scope check + reassign + activity +
  // awaited invalidation. Returns the notify input — the action applies after().
  // Same core the Elaya reassign_lead tool executes on confirmation.
  const core = await assignLeadCore(
    { userId: caller.id, role: caller.role, domain: caller.domain, fullName: caller.full_name },
    { leadId, agentId },
    {
      existingLead: {
        status: existingLead.status as string | null,
        domain: existingLead.domain as string,
        slug: existingLead.slug as string | null,
        first_name: existingLead.first_name as string | null,
        last_name: existingLead.last_name as string | null,
        phone: existingLead.phone as string | null,
      },
      assignedAgent: assignedAgent
        ? {
            full_name: assignedAgent.full_name as string | null,
            domain: assignedAgent.domain as string | null,
            is_active: assignedAgent.is_active as boolean,
          }
        : null,
    },
  );

  if (!core.ok) {
    return {
      data: null,
      error:
        core.error === "agent_unavailable"
          ? "The selected user is not available in this domain."
          : formErrors.unauthorized,
    };
  }

  // 6–7. All assignment side-effects via shared orchestrator.
  const { notifyLeadAssigned } = await import(
    "@/lib/services/lead-assignment-notify"
  );
  // after(): the action returns to the client immediately while Vercel keeps the
  // lambda alive until notifyLeadAssigned's awaited Gupshup sends settle. A bare
  // void here would be orphaned when the lambda freezes after the action returns.
  after(
    notifyLeadAssigned(core.notify).catch((err) => {
      console.error("[leads:assignLead] notifyLeadAssigned failed (non-fatal):", err);
    }),
  );

  revalidatePath("/leads");

  return { data: { leadId }, error: null };
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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

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

  // 3. Merge into existing JSONB — sanitize, strip empty strings, preserve prior keys.
  //    city is a dedicated column; never write it into personal_details JSONB.
  const existing = (lead.personal_details ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...existing };
  for (const [k, rawV] of Object.entries(details)) {
    if (k === 'city') continue; // city lives in leads.city, not personal_details
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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // 3. Domain enforcement (Rule S-06, S-14): agents are PINNED to their own
  //    domain — they cannot submit a lead to any other domain. Manager+ MAY pick
  //    a target domain (the Add Lead modal exposes the Domain dropdown to them);
  //    by product decision a manager creating into another domain is intentional,
  //    not a leak (audit #1, confirmed intended). The leads.domain app_domain
  //    CHECK + the GIA_DOMAIN_ENUM Zod gate on fields.domain bound the value set.
  const resolvedDomain =
    caller.role === "agent" ? caller.domain : fields.domain;

  // 3b. The leads.domain app_domain CHECK only admits Gia domains. fields.domain
  //     (manager+) is already gated by GIA_DOMAIN_ENUM in the schema, but an
  //     agent's pinned caller.domain bypasses that gate — an agent whose profile
  //     domain isn't a Gia domain would throw an unhandled INSERT CHECK violation.
  //     Reject cleanly instead (audit #17).
  if (!resolvedDomain || !isGiaDomain(resolvedDomain)) {
    return { data: null, error: "Your account is not set up for a lead domain. Contact an admin." };
  }

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
    // The target must be a lead-carrying role (agent/manager). Without this, a
    // manager could assign a lead to a guest/admin/founder who isn't in the pool
    // and isn't meant to carry leads (audit #6).
    if (!LEAD_ASSIGNABLE_ROLES.includes(targetAgent.role)) {
      return {
        data: null,
        error: "The selected user cannot be assigned leads.",
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
  //    Canonicalize phone so the stored value + dedup key match the webhook and
  //    WhatsApp paths exactly (audit #3) — the schema already produced E.164, so
  //    this is idempotent here, but it keeps all three paths on one key.
  const { first_name, last_name, email, source } = fields;
  const phone = canonicalizePhone(fields.phone);

  // 5b. Interests: drop out-of-vocabulary values for the RESOLVED domain —
  //     the exact same best-effort dropper as the webhook/WhatsApp paths
  //     (never rejects the submission, never blocks the INSERT).
  const serviceInterests = extractServiceInterests(
    { interests: fields.service_interests },
    resolvedDomain,
  );

  // 6. Duplicate check via get_active_lead_by_phone (Rule S-09 / dedup spec).
  //    The RPC returns ONLY active leads (new/touched/in_discussion/nurturing).
  const { data: existingLeads } = await admin.rpc("get_active_lead_by_phone", {
    p_phone: phone,
  });

  if (existingLeads && existingLeads.length > 0) {
    // Active duplicate — log a duplicate_submission on the existing lead so the
    // re-enquiry is visible in its timeline (parity with the webhook path, audit #15),
    // then return the existing lead without inserting.
    const existingId = existingLeads[0].id;
    const { error: dupActivityError } = await admin.from("lead_activities").insert({
      lead_id: existingId,
      actor_id: caller.id,
      action_type: "duplicate_submission",
      details: { source: "manual", lead_source: source ?? null, domain: resolvedDomain },
    });
    if (dupActivityError) {
      console.error("[leads:createManualLead] duplicate_submission activity insert failed:", dupActivityError.message);
    }
    return {
      data: { leadId: existingId, duplicate: true },
      error: null,
    };
  }

  // 6b. Returning-prospect chain: if a TERMINAL (won/lost/junk) lead exists for
  //     this phone, link the new lead to it via previous_lead_id — parity with
  //     the webhook path, which the manual path previously skipped (audit #3 dedup).
  let previousLeadId: string | null = null;
  const { data: terminalLead } = await admin
    .from("leads")
    .select("id")
    .eq("phone", phone)
    .is("archived_at", null)
    .in("status", ["won", "lost", "junk"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (terminalLead) previousLeadId = terminalLead.id as string;

  // 7. INSERT lead — source from modal when set; form_data empty for manual leads
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("leads")
    .insert({
      first_name,
      last_name: last_name ?? null,
      email: email ?? null,
      phone,
      previous_lead_id: previousLeadId,
      domain: resolvedDomain,
      assigned_to: assignedTo,
      assigned_at: assignedTo ? now : null,
      status: "new",
      status_changed_at: assignedTo ? now : null,
      last_activity_at: assignedTo ? now : null,
      lead_intent: null,
      source: source ?? null,
      medium: null,
      utm_campaign: null,
      attribution: null,
      service_interests: serviceInterests,
      form_data: {},
      last_call_outcome: null,
      personal_details: null,
      archived_at: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // 23505 = the active-phone unique index (0137) rejected a concurrent insert
    // that raced past dedup (audit #1). Resolve to the lead that won the race.
    if (insertError?.code === "23505") {
      const { data: raced } = await admin.rpc("get_active_lead_by_phone", { p_phone: phone });
      if (raced && raced.length > 0) {
        return { data: { leadId: raced[0].id, duplicate: true }, error: null };
      }
    }
    return { data: null, error: formErrors.generic };
  }

  const leadId = inserted.id as string;

  // 8. INSERT lead_created activity — error-checked (audit #14); non-fatal, the
  //    lead row stands even if the audit log insert fails.
  const { error: createdActivityError } = await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: caller.id,
    action_type: "lead_created",
    details: {
      source: "manual",
      lead_source: source ?? null,
      domain: resolvedDomain,
    },
  });
  if (createdActivityError) {
    console.error("[leads:createManualLead] lead_created activity insert failed:", createdActivityError.message);
  }

  // 9. INSERT agent_assigned activity if assigned_to is set
  if (assignedTo) {
    const { error: assignedActivityError } = await admin.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: caller.id,
      action_type: "agent_assigned",
      details: { assigned_to: assignedTo, method: "manual" },
    });
    if (assignedActivityError) {
      console.error("[leads:createManualLead] agent_assigned activity insert failed:", assignedActivityError.message);
    }
  }

  // 10. All assignment side-effects (WhatsApp, in-app, SLA) via shared orchestrator.
  // Called UNCONDITIONALLY (not gated on assignedTo): the founder must always be
  // told a new lead entered the system, and the manager/founder escalation timers
  // (SLA-01B/01C) must arm even when the lead has no agent. notifyLeadAssigned
  // internally skips the agent WhatsApp + in-app steps when assignedTo is null.
  const manualLeadName = last_name ? `${first_name} ${last_name}` : first_name;
  {
    const { notifyLeadAssigned } = await import(
      "@/lib/services/lead-assignment-notify"
    );
    // after(): action returns immediately; Vercel keeps the lambda alive until the
    // awaited Gupshup sends inside notifyLeadAssigned settle. void would orphan them.
    after(
      notifyLeadAssigned({
        leadId,
        assignedTo,
        agentName:   assignedTo ? assignedAgentName : null,
        leadName:    manualLeadName,
        leadPhone:   phone,
        domain:      resolvedDomain as string,
        isNew:       true,
        isDuplicate: false,
        actorId:     caller.id,
        scheduleSla: true,
        assignedAt:  now,
      }).catch((err) => {
        console.error("[leads:createManualLead] notifyLeadAssigned failed (non-fatal):", err);
      }),
    );
  }

  // 11. Invalidate list + dashboard caches. Two INCR calls atomically void all
  //     cached list pages for agent + manager roles in this domain. Volume keys
  //     are deliberately not deleted — their read-side keys embed an ISO from:to
  //     range a del cannot enumerate; freshness is TTL-only (120s).
  await invalidateLeadCaches(
    "createManualLead",
    { domain: resolvedDomain as string },
    { lists: true, dashboard: true },
  );

  revalidatePath("/leads");

  // 12. Return success
  return { data: { leadId }, error: null };
}

type LeadEditContext = {
  id: string;
  assigned_to: string | null;
  domain: string;
  slug: string | null;
};

async function assertLeadFieldEditAccess(leadId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      caller: Profile;
      lead: LeadEditContext;
    }
> {
  const auth = await requireProfile();
  if (!auth.ok) return { ok: false, error: auth.result.error };
  const caller = auth.profile;

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

async function revalidateLeadDossier(lead: LeadEditContext) {
  const segment = lead.slug ?? lead.id;
  await invalidateLeadCaches(
    "dossier",
    { leadId: lead.id, slug: lead.slug, domain: lead.domain },
    { row: true, activities: true },
  );
  revalidatePath(`/leads/${segment}`);
  revalidatePath("/leads");
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

  await revalidateLeadDossier(access.lead);
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

  await revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadSource
// ─────────────────────────────────────────────
export async function updateLeadSource(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  const parsed = UpdateLeadSourceSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, source } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ source })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: access.caller.id,
    action_type: "note_added",
    details: { type: "lead_source_updated", source },
  });

  await revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadCity
// ─────────────────────────────────────────────
export async function updateLeadCity(
  input: unknown,
): Promise<ActionResult<{ leadId: string }>> {
  const parsed = UpdateLeadCitySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId, city } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("leads")
    .update({ city: city ?? null })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await revalidateLeadDossier(access.lead);
  return { data: { leadId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateLeadInterests (call-intelligence Phase 1.1b)
// Same field-edit path as email/source/city: assertLeadFieldEditAccess →
// admin update → activity entry → revalidateLeadDossier (dual-key row del
// via invalidateLeadCaches — never hand-rolled). Out-of-vocabulary values
// dropped against the lead's domain via extractServiceInterests (the same
// dropper as every ingestion path). Activity logs old → new — interests
// drive what agents pitch; an unlogged change is a hole in the lead story.
// ─────────────────────────────────────────────
export async function updateLeadInterests(
  input: unknown,
): Promise<ActionResult<{ leadId: string; interests: string[] }>> {
  const parsed = UpdateLeadInterestsSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const { leadId } = parsed.data;
  const access = await assertLeadFieldEditAccess(leadId);
  if (!access.ok) return { data: null, error: access.error };

  const interests = extractServiceInterests(
    { interests: parsed.data.interests },
    access.lead.domain,
  );

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("leads")
    .select("service_interests")
    .eq("id", leadId)
    .single();
  const oldInterests = current?.service_interests ?? [];

  // No-op edit: skip the write and the activity row entirely.
  if (
    oldInterests.length === interests.length &&
    oldInterests.every((v, i) => v === interests[i])
  ) {
    return { data: { leadId, interests }, error: null };
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({ service_interests: interests })
    .eq("id", leadId);

  if (updateError) return { data: null, error: formErrors.generic };

  await admin.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: access.caller.id,
    action_type: "note_added",
    details: {
      type: "lead_interests_updated",
      old: oldInterests,
      new: interests,
    },
  });

  await revalidateLeadDossier(access.lead);
  return { data: { leadId, interests }, error: null };
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

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

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

  // Shared mutation core (RPC + awaited cache invalidation). Same core the Elaya
  // add_lead_note tool calls — the write inherits invalidation identically.
  const core = await addLeadNoteCore(
    { userId: caller.id, role: caller.role, domain: caller.domain, fullName: caller.full_name },
    { leadId, content },
  );
  if (!core.ok) return { data: null, error: formErrors.generic };

  return { data: { noteId: core.noteId }, error: null };
}

// ─────────────────────────────────────────────
// Action: recordDeal
// Thin wrapper — canonical implementation lives in deals.ts.
// "use server" files cannot use re-export syntax; async wrapper is required.
// ─────────────────────────────────────────────
export async function recordDeal(input: unknown): Promise<ActionResult<{ leadId: string }>> {
  const { recordDeal: _recordDeal } = await import("@/lib/actions/deals");
  return _recordDeal(input);
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
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

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

  // Shared mutation core: RPC (tasks + task_gia_meta) + Trigger.dev reminder +
  // assignee dashboard-cache del. Assigns to the lead's current assignee, fall
  // back to the actor. Same core the Elaya create_lead_task tool calls.
  const core = await createLeadTaskCore(
    { userId: caller.id, role: caller.role, domain: caller.domain, fullName: caller.full_name },
    { leadId, taskType, description: description ?? null, priority, dueAt: dueAt ?? null },
    lead.assigned_to as string | null,
  );

  if (!core.ok) return { data: null, error: formErrors.generic };

  // Invalidate dossier RSC cache so LeadTasksAsync refetches after router.refresh()
  // (request-context only — stays in the action, not the core).
  const dossierSegment = (lead.slug as string | null) ?? leadId;
  revalidatePath(`/leads/${dossierSegment}`);

  return { data: core.task, error: null };
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

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const results = await searchLeadsForTask(
    parsed.data.query,
    caller.role,
    caller.domain,
    caller.id,
  );

  return { data: results, error: null };
}

// ─────────────────────────────────────────────
// Action: exportLeadsAction
// Returns plain JSON data — XLSX/CSV building happens entirely client-side.
// Never imports xlsx here; never builds a file buffer server-side.
// ─────────────────────────────────────────────
export type ExportPayload = {
  leads:      LeadExportItem[];
  activities: LeadActivityWithActor[];
  notes:      LeadNoteWithAuthor[];
  totalCount: number;
};

export async function exportLeadsAction(
  input: unknown,
): Promise<ActionResult<ExportPayload>> {
  "use server";

  const parsed = ExportLeadsSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  // Guest role cannot export
  const auth = await requireProfile(["agent", "manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const { filters, selectedIds } = parsed.data;

  // Cast to LeadFilters — safe because ExportLeadsSchema mirrors the shape
  const leadsFilters = {
    status:            (filters.status as string[] | null) ?? null,
    last_call_outcome: (filters.last_call_outcome as string[] | null) ?? null,
    domain:            (filters.domain as string | null) ?? null,
    agent_id:          filters.agent_id ?? null,
    source:            filters.source ?? null,
    campaign:          filters.campaign ?? null,
    date_from:         filters.date_from ?? null,
    date_to:           filters.date_to ?? null,
    search:            filters.search ?? null,
    // Manager My/All view — re-apply the same default as leads/page.tsx so an
    // export from the default (My Leads) view scopes to the manager's own leads,
    // matching the table. 'view' only ever narrows a manager to assigned_to =
    // caller.id; it can never widen access (agent stays own-scoped regardless).
    view:
      caller.role === "manager"
        ? (filters.view === "all" ? "all" : "mine")
        : (filters.view ?? null),
    sort_order:        filters.sort_order ?? "desc",
    page:              1,
    pageSize:          5000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { leads, totalCount } = await getLeadsForExport(
    caller.role,
    caller.id,
    caller.domain,
    leadsFilters,
    selectedIds,
  );

  if (totalCount > 5000) {
    return {
      data:  null,
      error: "Export exceeds 5,000 leads. Apply filters to narrow the set.",
    };
  }

  const leadIds = leads.map((l) => l.id);
  const { activities, notes } = await getActivitiesAndNotesForExport(leadIds);

  return {
    data: { leads, activities, notes, totalCount },
    error: null,
  };
}
