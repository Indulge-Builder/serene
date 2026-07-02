// Lead mutation cores — THE shared, context-free body of the four action-shaped
// lead writes. SERVER ONLY.
//
// Why this file exists (R-01 / Q-13): the four lead-write actions in
// src/lib/actions/leads.ts begin with requireProfile() (a SESSION) + a session
// Supabase client. Elaya's write tools must run the SAME mutations from a context
// with NO session (the WhatsApp webhook uses the admin client; in-app the identity
// must be the Elaya principal, not re-derived from cookies). So the mutation body —
// the SECURITY DEFINER RPC + every context-free side-effect (cache invalidation,
// SLA timers, won-notifications) — lives here, taking an explicit actor. Both the
// action (session caller) and the write tool (Elaya principal) are thin callers.
//
// The underlying RPCs (add_lead_plain_note / update_lead_status / create_lead_gia_task)
// are SECURITY DEFINER and take an explicit actor id (p_author_id / p_actor_id /
// p_created_by) — they never read auth.uid() for the write, so they are reusable
// verbatim under the admin client with a principal-derived actor.
//
// The trust boundary is the CALLER (Q-13): each caller verifies access to the lead
// (session hasAccess in the action; getLeadBySlug + canAccessLead in the tool) BEFORE
// calling a core. The cores do NOT re-fetch for access — exactly as the RPCs already
// trust the action layer today.
//
// What deliberately does NOT live here (request/action-context only — cannot run in
// the WhatsApp after()/webhook context):
//   • revalidatePath  — stays in the action wrapper; off-channel there is no RSC page
//     to revalidate and the awaited invalidateLeadCaches below is what guarantees
//     freshness on the next in-app read.
//   • after(notifyLeadAssigned) — assignLeadCore RETURNS the notify input; the caller
//     applies its own lifecycle (action → after(); Elaya executor → plain await inside
//     a context that already keeps the lambda alive).

import { createAdminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/constants/redis-keys";
import { invalidateLeadCaches } from "@/lib/services/lead-cache";
import { getOpenRevivedTask } from "@/lib/services/revival-service";
import { createNotification } from "@/lib/services/notifications-service";
import { getDomainDecisionMakers } from "@/lib/services/profiles-service";
import {
  scheduleSlaTimersForLead,
  cancelSlaTimersForLead,
  refreshActivitySlaTimers,
  armCadenceForOutcome,
} from "@/lib/actions/sla";
import { TASK_TYPE_LABELS } from "@/lib/constants/task-types";
import {
  resolveDealShapeForDomain,
  type DealCategory,
  type DealDuration,
} from "@/lib/constants/deal-types";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import {
  REVIVAL_TASK_TYPE,
  REVIVAL_TASK_PRIORITY,
  REVIVAL_TASK_MARKER,
  REVIVED_TASK_TITLE,
  REVIVED_TASK_DESCRIPTION,
} from "@/lib/constants/revival";
import { scheduleTaskReminder } from "@/trigger/task-reminders";
import type { LeadAssignedNotifyInput } from "@/lib/services/lead-assignment-notify";
import type { UserRole } from "@/lib/types";
import type { AppDomain, CallOutcome, LeadStatus, Task } from "@/lib/types/database";

// ─────────────────────────────────────────────
// Caller identity — principal-derived, NEVER from a session inside the core.
// (The action passes its requireProfile() caller; the tool passes the Elaya
// principal. Both are already verified by the caller.)
// ─────────────────────────────────────────────
export type MutationActor = {
  userId: string;
  role: UserRole;
  domain: AppDomain;
  fullName: string;
};

// Terminal statuses for SLA purposes (no new timers) — mirrors leads.ts.
const TERMINAL_SLA_STATUSES = new Set<LeadStatus>(["won", "lost", "junk"]);

// ─────────────────────────────────────────────
// addLeadNoteCore — plain note (no call outcome). Mirrors addLeadNote.
// add_lead_plain_note RPC: note insert + last_activity_at bump + activity log.
// ─────────────────────────────────────────────
export async function addLeadNoteCore(
  actor: MutationActor,
  input: { leadId: string; content: string },
): Promise<{ ok: true; noteId: string } | { ok: false }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "add_lead_plain_note",
    {
      p_lead_id: input.leadId,
      p_author_id: actor.userId,
      p_content: input.content,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { ok: false };

  // Awaited so the next dossier load never reads stale data (P-08). Same scope
  // flags as addLeadNote ({ notes, activities }, leadId-only key).
  await invalidateLeadCaches(
    "addLeadNoteCore",
    { leadId: input.leadId },
    { notes: true, activities: true },
  );

  return { ok: true, noteId: (rpcResult as { note_id: string }).note_id };
}

// ─────────────────────────────────────────────
// addLeadCallNoteCore — a CALL note (carries an outcome). THE shared body of the
// addLeadCallNote action (R-01), so an Elaya log_call tool records a call IDENTICALLY
// to one logged in the app: the add_lead_call_note RPC (note + last_call_outcome +
// call_count + new→touched auto-advance, all atomic) + cache invalidation + the SLA
// cadence chain. This is what plain add_lead_note does NOT do — a note alone never
// sets the outcome, advances the status, or arms the follow-up cadence.
//
// The SLA side-effects are fire-and-forget .then().catch() (no revalidatePath, no
// after()) so they are context-free and belong in the core. armCadenceForOutcome is
// chained AFTER schedule/refresh settle — their cancel-all would sweep the freshly
// armed cadence tick (the exact ordering invariant the action documents).
// revalidatePath stays in the caller (request-context only).
// ─────────────────────────────────────────────
export async function addLeadCallNoteCore(
  actor: MutationActor,
  input: { leadId: string; content: string; callOutcome: CallOutcome },
  // The lead's slug/domain — the caller already fetched the lead for its access
  // check, so it passes these rather than the core re-querying (mirrors the
  // updateLeadStatusCore ctx pattern). slug drives the dual-key row invalidation.
  ctx: { slug: string | null; domain: string },
): Promise<{ ok: true; noteId: string } | { ok: false }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "add_lead_call_note",
    {
      p_lead_id: input.leadId,
      p_author_id: actor.userId,
      p_content: input.content,
      p_call_outcome: input.callOutcome,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { ok: false };

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

  // Awaited (P-08) — same scope flags as the addLeadCallNote action.
  await invalidateLeadCaches(
    "addLeadCallNoteCore",
    { leadId: input.leadId, slug: ctx.slug, domain: ctx.domain },
    { row: true, notes: true, activities: true, lists: true },
  );

  // SLA cadence chain (fire-and-forget, non-fatal) — byte-identical to the action.
  const postStatus = didAutoAdvance ? "touched" : oldStatus;
  if (didAutoAdvance) {
    const slaAssignee = assignedTo ?? actor.userId;
    scheduleSlaTimersForLead({
      leadId: input.leadId,
      status: "touched",
      assignedAt: now,
      assignedTo: slaAssignee,
      domain,
    })
      .then(() =>
        armCadenceForOutcome({
          leadId: input.leadId,
          outcome: input.callOutcome,
          assignedTo: slaAssignee,
          domain,
          status: "touched",
        }),
      )
      .catch(() => {});
  } else if (assignedTo && ["touched", "in_discussion"].includes(postStatus)) {
    refreshActivitySlaTimers({
      leadId: input.leadId,
      status: postStatus,
      assignedTo,
      domain,
    })
      .then(() =>
        armCadenceForOutcome({
          leadId: input.leadId,
          outcome: input.callOutcome,
          assignedTo,
          domain,
          status: postStatus,
        }),
      )
      .catch(() => {});
  }

  return { ok: true, noteId: noteId as string };
}

// ─────────────────────────────────────────────
// createLeadTaskCore — gia_followup task + task_gia_meta. Mirrors createLeadTaskAction.
// Assigns to the lead's current assignee, falling back to the actor.
// ─────────────────────────────────────────────
export async function createLeadTaskCore(
  actor: MutationActor,
  input: {
    leadId: string;
    taskType: "call" | "whatsapp_message" | "other";
    description: string | null;
    priority: "urgent" | "high" | "normal";
    dueAt: string | null;
  },
  leadAssignee: string | null,
): Promise<{ ok: true; task: Task } | { ok: false }> {
  const title = TASK_TYPE_LABELS[input.taskType];
  const assignedTo = leadAssignee ?? actor.userId;

  const admin = createAdminClient();

  const { data: rows, error: rpcError } = await admin.rpc(
    "create_lead_gia_task",
    {
      p_lead_id: input.leadId,
      p_assigned_to: assignedTo,
      p_created_by: actor.userId,
      p_task_type: input.taskType,
      p_title: title,
      // Explicit nulls (not undefined) are intentional — PostgREST sends SQL NULL;
      // the generated optional-arg types only admit undefined, hence the assertions.
      p_description: input.description as string | undefined,
      p_priority: input.priority,
      p_due_at: (input.dueAt ? new Date(input.dueAt).toISOString() : null) as string | undefined,
    },
  );

  if (rpcError || !rows || (rows as Task[]).length === 0) return { ok: false };

  const task = (rows as Task[])[0];

  // Trigger.dev reminder — fire-and-forget, never blocks. Context-free.
  if (input.dueAt) {
    scheduleTaskReminder(task.id, new Date(input.dueAt), assignedTo).catch(() => {});
  }

  // Refresh the assignee's cached lists (the person who now owns the task —
  // assignedTo, not necessarily the actor). Since the gia_followup collapse
  // (0138) a lead task is a `personal` task, so it now also lives in the
  // assignee's My Tasks page-1 list — del that key too or the new task is
  // invisible there (and on the calendar) until the 30s TTL lapses, even though
  // the dossier (live read) shows it. That split is exactly the "task shows on
  // the lead but not in My Tasks" symptom this del fixes.
  try {
    await Promise.all([
      redis.del(REDIS_KEYS.dashboardAgentTasks(assignedTo)),
      redis.del(REDIS_KEYS.task.personalPage1(assignedTo)),
    ]);
  } catch (e) {
    console.warn("[lead-mutations] redis del failed on createLeadTaskCore", e);
  }

  return { ok: true, task };
}

// ─────────────────────────────────────────────
// reviveLeadCore — THE shared body of a lead revival (Phase R1).
//
// A revive is NOT a new kind of write: it is a normal gia_followup task created
// through createLeadTaskCore (the E2 path — same RPC, same Trigger.dev reminder,
// same dashboard-cache del), so it inherits cache invalidation + activity logging
// + SLA-reminder rails identically (R-01). The ONLY revival-specific bits are
// post-creation MARKER writes on the just-created task: a distinct "Revived" title
// and the task_gia_meta.call_outcome = 'revived' marker the UI badges off.
//
// Revival NEVER touches the leads row — no status, no column. Both the manual
// reviveLeadAction (session caller) and the daily sweep (admin, no session) call
// THIS core, so they create the identical Revived task.
// ─────────────────────────────────────────────
export async function reviveLeadCore(
  actor: MutationActor,
  input: { leadId: string; dueAt: string | null },
  leadAssignee: string | null,
): Promise<{ ok: true; task: Task; alreadyRevived?: boolean } | { ok: false }> {
  // Idempotency guard (audit #10): if an OPEN 'revived'-marked gia task already
  // exists for this lead, do NOT create a second one — return the existing task
  // flagged alreadyRevived. This closes the daily-sweep crash/retry window where
  // the Revived task landed but the 'actioned' candidate row did not, which the
  // silence anti-join would otherwise re-qualify into a duplicate revive. The
  // manual Revive button inherits the same protection (a no-op double-tap returns
  // the existing task instead of stacking follow-ups).
  const existing = await getOpenRevivedTask(input.leadId);
  if (existing) {
    return { ok: true, task: existing, alreadyRevived: true };
  }

  // Reuse the E2 task path verbatim — a call-type follow-up, normal priority.
  const created = await createLeadTaskCore(
    actor,
    {
      leadId: input.leadId,
      taskType: REVIVAL_TASK_TYPE,
      description: REVIVED_TASK_DESCRIPTION,
      priority: REVIVAL_TASK_PRIORITY,
      dueAt: input.dueAt,
    },
    leadAssignee,
  );
  if (!created.ok) return { ok: false };

  const admin = createAdminClient();

  // Marker writes on the just-created task (NOT new task-creation logic):
  //   • a distinct "Revived" title so it reads as a revival in every task surface;
  //   • task_gia_meta.call_outcome = 'revived' — the badge key (idx_task_gia_meta_lead_id).
  // Both are best-effort: a marker failure leaves a valid (if generically-titled)
  // follow-up task rather than orphaning the revive.
  try {
    await admin.from("tasks").update({ title: REVIVED_TASK_TITLE }).eq("id", created.task.id);
    await admin
      .from("task_gia_meta")
      .update({ call_outcome: REVIVAL_TASK_MARKER })
      .eq("task_id", created.task.id);
  } catch (e) {
    console.warn("[lead-mutations] revive marker write failed (non-fatal)", e);
  }

  return { ok: true, task: { ...created.task, title: REVIVED_TASK_TITLE } };
}

// ─────────────────────────────────────────────
// updateLeadStatusCore — lead status change. Mirrors updateLeadStatus.
// update_lead_status RPC: lead UPDATE + activity + optional nurturing task.
// Owns: cache invalidation, won-notification fan-out, SLA branch.
// Returns the RPC result so the caller can decide on revalidatePath.
// ─────────────────────────────────────────────
export type UpdateLeadStatusCoreResult = {
  changed: boolean;
  oldStatus: string | null;
  newStatus: string | null;
};

export async function updateLeadStatusCore(
  actor: MutationActor,
  input: { leadId: string; status: LeadStatus; reason: string | null },
  leadCtx: { slug: string | null; domain: string },
): Promise<{ ok: true; result: UpdateLeadStatusCoreResult } | { ok: false }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "update_lead_status",
    {
      p_lead_id: input.leadId,
      p_actor_id: actor.userId,
      p_status: input.status,
      // Explicit null (not undefined) is intentional — PostgREST sends SQL NULL.
      p_reason: input.reason as string | undefined,
      p_now: now,
    },
  );

  if (rpcError || !rpcResult) return { ok: false };

  const result = rpcResult as {
    changed: boolean;
    old_status?: string;
    new_status?: string;
    assigned_to?: string | null;
    domain?: string;
    first_name?: string | null;
    last_name?: string | null;
  };

  // RPC returned early — status was already the same. Nothing to invalidate.
  if (!result.changed) {
    return { ok: true, result: { changed: false, oldStatus: null, newStatus: null } };
  }

  // Awaited (P-08). Same scope flags as updateLeadStatus.
  await invalidateLeadCaches(
    "updateLeadStatusCore",
    { leadId: input.leadId, slug: leadCtx.slug, domain: leadCtx.domain },
    { row: true, activities: true, lists: true, dashboard: true },
  );

  const { assigned_to: assignedTo, domain, first_name, last_name } = result;

  // Won: notify all active managers/admins/founders in the domain (context-free).
  // Identical to updateLeadStatus — ordering preserved (won fan-out BEFORE SLA branch).
  if (input.status === "won") {
    const displayName = last_name
      ? `${first_name ?? "A lead"} ${last_name}`
      : (first_name ?? "A lead");

    const managers = await getDomainDecisionMakers(
      ((domain as AppDomain) ?? actor.domain) as string,
    );

    if (managers.length > 0) {
      await Promise.all(
        managers.map((m: { id: string }) =>
          createNotification({
            recipient_id: m.id,
            type: "lead_won",
            notificationKey: "lead_won",  // SEAM A — per-user control plane (0133)
            title: `Lead won — ${displayName}`,
            body: `Marked won by ${actor.fullName}`,
            action_url: `/leads/${input.leadId}`,
          }),
        ),
      );
    }
  }

  // SLA side-effects (non-fatal). AWAITED inside the core — never bare
  // `.catch(() => {})`: a detached Trigger.dev call can be orphaned when the
  // Vercel lambda freezes on response flush (A-16), and the swallow hid every
  // failure. Both callers keep the lambda alive across this awaited core (the
  // action returns after it; the Elaya executor runs inside an outer after()/
  // stream) — the same lifecycle assignLeadCore relies on. Errors are logged,
  // never thrown: the lead write already succeeded.
  try {
    if (TERMINAL_SLA_STATUSES.has(input.status)) {
      await cancelSlaTimersForLead({ leadId: input.leadId });
    } else if (assignedTo) {
      await scheduleSlaTimersForLead({
        leadId: input.leadId,
        status: input.status,
        assignedAt: now,
        assignedTo,
        domain: domain as string,
      });
    }
  } catch (err) {
    console.error(
      "[lead-mutations:updateLeadStatusCore] SLA side-effect failed (non-fatal):",
      err,
    );
  }

  return {
    ok: true,
    result: {
      changed: true,
      oldStatus: result.old_status ?? null,
      newStatus: result.new_status ?? null,
    },
  };
}

// ─────────────────────────────────────────────
// recordDealCore — THE shared body of recording a won deal (FEATURE 1 / log_deal).
//
// Why a core (R-01 / Q-13): the recordDeal ACTION (deals.ts) begins with a SESSION
// (requireProfile) + the admin-client insert + a lead→won flip. Elaya's log_deal
// write tool must record the IDENTICAL deal from a sessionless context (WhatsApp
// webhook / the SSE stream after the cookie session is gone), with the Elaya
// principal as the actor. So the context-free body lives here, taking an explicit
// MutationActor; both the action and the Elaya proposal-resolver are thin callers.
//
// Order guarantee (mirrors the action): the deals INSERT must succeed BEFORE the
// status flip. If the insert fails, the lead is NOT flipped. If the flip fails, the
// orphaned deal row is harmless (no lead is won, so it won't appear on /deals via
// the role-scoped query).
//
// The Won flip reuses updateLeadStatusCore — so the lead inherits its full
// side-effect set (lead_won notification fan-out, terminal-SLA cancel, cache
// invalidation) identically to any other Won. recordDealCore therefore does NOT
// fire its own deal_created notification (the lead_won fan-out already reaches the
// same recipients — exactly the reason the action's notifyDealCreated is walk-in-only).
//
// deal_type is DERIVED from the lead's domain via resolveDealShapeForDomain — never
// model/client-supplied. The caller has already fetched the lead + checked access.
// revalidatePath('/deals') is request-context-only → stays in the caller.
// ─────────────────────────────────────────────
export type RecordDealCoreContext = {
  lead: {
    id: string;
    status: string | null;
    domain: string;
    slug: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    assigned_to: string | null;
  };
};

export async function recordDealCore(
  actor: MutationActor,
  input: {
    leadId: string;
    deal_amount: number;
    deal_duration?: DealDuration | null;
    deal_category?: DealCategory | null;
  },
  ctx: RecordDealCoreContext,
): Promise<
  | { ok: true; dealId: string; contactName: string; wonChanged: boolean }
  | { ok: false; error: string }
> {
  const { lead } = ctx;

  // deal_type is DERIVED from the lead's domain — never client/model-supplied.
  if (!isGiaDomain(lead.domain)) {
    return { ok: false, error: "Deals can only be recorded for Gia-domain leads." };
  }
  const resolved = resolveDealShapeForDomain(lead.domain as GiaDomain, {
    deal_duration: input.deal_duration,
    deal_category: input.deal_category,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const admin = createAdminClient();

  const contactName =
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unknown";

  // Step 1: insert the deal (must succeed before the status flip).
  const { data: inserted, error: insertError } = await admin
    .from("deals")
    .insert({
      lead_id:       lead.id,
      contact_name:  contactName,
      contact_phone: lead.phone ?? "",
      contact_email: lead.email ?? null,
      domain:        lead.domain as AppDomain,
      deal_amount:   input.deal_amount,
      deal_type:     resolved.shape.deal_type,
      deal_duration: resolved.shape.deal_duration,
      deal_category: resolved.shape.deal_category,
      assigned_to:   lead.assigned_to ?? null,
      won_at:        new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: "I couldn't record that deal just now." };
  }
  const dealId = (inserted as { id: string }).id;

  // Step 2: flip the lead to Won via the shared status core (inherits the lead_won
  // fan-out + terminal-SLA cancel + cache invalidation). A no-op flip (already Won)
  // still leaves a valid deal row — wonChanged just reflects whether the row moved.
  const flip = await updateLeadStatusCore(
    actor,
    { leadId: lead.id, status: "won", reason: null },
    { slug: lead.slug, domain: lead.domain },
  );

  return {
    ok: true,
    dealId,
    contactName,
    wonChanged: flip.ok ? flip.result.changed : false,
  };
}

// ─────────────────────────────────────────────
// assignLeadCore — manual reassignment. Mirrors assignLead.
// Owns: manager domain-scope check, leads UPDATE, agent_assigned activity,
// cache invalidation. RETURNS the notifyLeadAssigned input — the caller applies
// the lifecycle construct (action → after(); Elaya executor → plain await).
// ─────────────────────────────────────────────
export type AssignLeadCoreContext = {
  existingLead: {
    status: string | null;
    domain: string;
    slug: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
  assignedAgent: {
    full_name: string | null;
    domain: string | null;
    is_active: boolean;
  } | null;
};

export async function assignLeadCore(
  actor: MutationActor,
  input: { leadId: string; agentId: string },
  ctx: AssignLeadCoreContext,
): Promise<
  | { ok: true; notify: LeadAssignedNotifyInput }
  | { ok: false; error: "unauthorized" | "agent_unavailable" }
> {
  const { existingLead, assignedAgent } = ctx;

  // Baseline (ALL roles, incl. admin/founder): the target must exist and be active.
  // Previously only the manager branch validated the assignee, so an admin/founder
  // reassign (esp. via Elaya's reassign_lead) could land a lead on a deactivated or
  // non-existent account (Low finding). Cross-DOMAIN assignment stays allowed for
  // admin/founder by design — only existence + active are universal.
  if (!assignedAgent || !assignedAgent.is_active) {
    return { ok: false, error: "agent_unavailable" };
  }

  // Rule S-06 — a manager may only reassign leads inside their own domain, and
  // only to an active agent of the lead's domain. Admin/founder unrestricted on
  // domain. (Identical to assignLead. The caller has already confirmed role ∈ manager+.)
  if (actor.role === "manager") {
    if (existingLead.domain !== actor.domain) {
      return { ok: false, error: "unauthorized" };
    }
    if (assignedAgent.domain !== existingLead.domain) {
      return { ok: false, error: "agent_unavailable" };
    }
  }

  const assignedAgentName = assignedAgent?.full_name ?? "Unknown Agent";

  const admin = createAdminClient();
  const assignedAt = new Date().toISOString();

  await admin
    .from("leads")
    .update({
      assigned_to: input.agentId,
      assigned_at: assignedAt,
      status_changed_at: assignedAt,
      last_activity_at: assignedAt,
    })
    .eq("id", input.leadId);

  await admin.from("lead_activities").insert({
    lead_id: input.leadId,
    actor_id: actor.userId,
    action_type: "agent_assigned",
    details: { assigned_to: input.agentId, method: "manual" },
  });

  // Awaited (P-08). Same scope flags as assignLead.
  await invalidateLeadCaches(
    "assignLeadCore",
    { leadId: input.leadId, slug: existingLead.slug, domain: existingLead.domain },
    { row: true, activities: true, lists: true },
  );

  const leadName = existingLead.last_name
    ? `${existingLead.first_name} ${existingLead.last_name}`
    : (existingLead.first_name ?? "A lead");

  return {
    ok: true,
    notify: {
      leadId: input.leadId,
      assignedTo: input.agentId,
      agentName: assignedAgentName,
      leadName,
      leadPhone: existingLead.phone ?? "",
      domain: existingLead.domain,
      isNew: false,
      isDuplicate: false,
      actorId: actor.userId,
      scheduleSla: true,
      leadStatus: existingLead.status ?? "new",
      assignedAt,
    } satisfies LeadAssignedNotifyInput,
  };
}
