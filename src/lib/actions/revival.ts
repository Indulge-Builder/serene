"use server";

// Lead Revival — server actions. The MANUAL revive path (the Revive button, both
// mount points) + the review-tab dismiss + the settings policy write.
//
// reviveLeadAction wraps reviveLeadCore (lead-mutations.ts) — the SAME core the
// daily sweep calls for auto-revive — so a manual revive creates the identical
// "Revived" task with cache/activity/SLA-reminder rails inherited (R-01). Revival
// NEVER mutates the lead's status or columns.
//
// Rule S-01: Zod first. A-18: requireProfile guard. Q-03: { data, error }, never throw.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/actions/_auth";
import { reviveLeadCore } from "@/lib/services/lead-mutations";
import {
  markCandidateResolved,
  getOpenCandidateForLead,
  updateRevivalPolicy,
} from "@/lib/services/revival-service";
import {
  ReviveLeadSchema,
  DismissRevivalCandidateSchema,
  UpdateRevivalPolicySchema,
} from "@/lib/validations/revival-schema";
import { formErrors } from "@/lib/validations/form-errors";
import { nextBusinessDeadline } from "@/lib/utils/sla";
import { REVIVAL_TASK_DUE_BUSINESS_MINUTES } from "@/lib/constants/revival";
import type { ActionResult } from "@/lib/types/index";
import type { RevivalPolicyRow } from "@/lib/types/revival";

// ─────────────────────────────────────────────
// Action: reviveLeadAction — manual revive (review tab row + dossier).
// ─────────────────────────────────────────────
export async function reviveLeadAction(
  input: unknown,
): Promise<ActionResult<{ leadId: string; taskId: string }>> {
  // 1. Validate (S-01)
  const parsed = ReviveLeadSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };
  const { leadId, candidateId } = parsed.data;

  // 2. Auth (A-18)
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const supabase = await createClient();

  // 3. Fetch lead for access check (mirrors updateLeadStatus — per-resource gate
  //    after the role guard).
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_to, domain, slug")
    .eq("id", leadId)
    .single();

  if (!lead) return { data: null, error: formErrors.generic };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";

  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  // 4. Revive task via the shared core (E2 path + "Revived" marker). Due
  //    REVIVAL_TASK_DUE_BUSINESS_MINUTES into business hours, like a cadence task.
  const dueAt = nextBusinessDeadline(new Date(), REVIVAL_TASK_DUE_BUSINESS_MINUTES).toISOString();
  const core = await reviveLeadCore(
    { userId: caller.id, role: caller.role, domain: caller.domain, fullName: caller.full_name },
    { leadId, dueAt },
    lead.assigned_to as string | null,
  );
  if (!core.ok) return { data: null, error: formErrors.generic };

  // 5. Resolve the candidate → actioned (the human did the revive). If no
  //    candidateId was supplied (revived directly from the dossier), resolve any
  //    open candidate for the lead so the review tab clears.
  const resolveId = candidateId ?? (await getOpenCandidateForLead(leadId))?.id ?? null;
  if (resolveId) {
    await markCandidateResolved(resolveId, "actioned", caller.id);
  }

  // 6. Revalidate the RSC surfaces the task appears on (request-context only).
  const slug = (lead.slug as string | null) ?? leadId;
  revalidatePath(`/leads/${slug}`);
  revalidatePath("/leads");

  return { data: { leadId, taskId: core.task.id }, error: null };
}

// ─────────────────────────────────────────────
// Action: dismissRevivalCandidateAction — review tab "not now" (no task).
// ─────────────────────────────────────────────
export async function dismissRevivalCandidateAction(
  input: unknown,
): Promise<ActionResult<{ candidateId: string }>> {
  const parsed = DismissRevivalCandidateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };
  const { candidateId, leadId } = parsed.data;

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const supabase = await createClient();

  // Access check — the caller must be able to see the lead (RLS on the candidate
  // SELECT enforces this too, but the action gate is the code-level A-09 layer).
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_to, domain")
    .eq("id", leadId)
    .single();
  if (!lead) return { data: null, error: formErrors.generic };

  const hasAccess =
    (caller.role === "agent" && lead.assigned_to === caller.id) ||
    (caller.role === "manager" && lead.domain === (caller.domain as string)) ||
    caller.role === "admin" ||
    caller.role === "founder";
  if (!hasAccess) return { data: null, error: formErrors.unauthorized };

  const ok = await markCandidateResolved(candidateId, "dismissed", caller.id);
  if (!ok) return { data: null, error: formErrors.generic };

  revalidatePath("/leads");
  return { data: { candidateId }, error: null };
}

// ─────────────────────────────────────────────
// Action: updateRevivalPolicyAction — /settings revival panel write.
// ─────────────────────────────────────────────
export async function updateRevivalPolicyAction(
  input: unknown,
): Promise<ActionResult<RevivalPolicyRow>> {
  const parsed = UpdateRevivalPolicySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;

  const { triggerStatus, silenceDays, dailyCapPerAgent, active } = parsed.data;
  const patch: { silence_days?: number; daily_cap_per_agent?: number; active?: boolean } = {};
  if (silenceDays !== undefined) patch.silence_days = silenceDays;
  if (dailyCapPerAgent !== undefined) patch.daily_cap_per_agent = dailyCapPerAgent;
  if (active !== undefined) patch.active = active;

  const updated = await updateRevivalPolicy(triggerStatus, patch);
  if (!updated) return { data: null, error: formErrors.generic };

  revalidatePath("/settings");
  return { data: updated, error: null };
}
