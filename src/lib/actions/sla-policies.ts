'use server';

/**
 * sla-policies.ts — the /settings follow-up engine panel write path.
 *
 * Separate from actions/sla.ts on purpose: that file is the Trigger.dev-facing
 * engine (sessionless, admin-client by design — the requireProfile exceptions
 * table). This one is a normal session-based admin/founder action.
 *
 * sla_policies has no write RLS (migration 0111) — this admin-gated action on
 * the admin client IS the sanctioned write path. The engine reads policies per
 * job run, so an active/channel edit applies on the very next fire; threshold
 * edits apply to timers scheduled after the change (already-armed timers keep
 * their computed fire time).
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/actions/_auth';
import { CreateSlaPolicySchema, UpdateSlaPolicySchema } from '@/lib/validations/sla-policy-schema';
import { createSlaPolicy, updateSlaPolicy } from '@/lib/services/sla-service';
import type { NewSlaPolicy, SlaPolicyPatch } from '@/lib/services/sla-service';
import { formErrors } from '@/lib/validations/form-errors';
import type { SlaPolicy } from '@/lib/types/database';
import type { ActionResult } from '@/lib/types/index';

/**
 * Reserved code prefixes the engine treats specially — a user rule must NEVER
 * carry one. CAD- = cadence (self-re-arming daily task generator, isCadenceCode);
 * SLA- = the seeded breach rules (SLA-04 has a call_count guard branch); TASK- =
 * the task-due family. The generated code is always USR-, but we assert against
 * these structurally as defense-in-depth.
 */
const RESERVED_CODE_PREFIXES = ['SLA-', 'CAD-', 'TASK-'] as const;

/** Inert, collision-free rule code for a user-authored policy. USR- guarantees
 *  it never matches isCadenceCode (CAD-) or the SLA-04 call_count branch. */
function generateUserPolicyCode(): string {
  return `USR-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function updateSlaPolicyAction(input: unknown): Promise<ActionResult<SlaPolicy>> {
  // 1. Zod validate (Rule S-01)
  const parsed = UpdateSlaPolicySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  // 2. Admin/founder only (Rule 09 / A-18)
  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const { code, active, thresholdMinutes, channels, hoursMode } = parsed.data;

  const patch: SlaPolicyPatch = {};
  if (active !== undefined)           patch.active            = active;
  if (thresholdMinutes !== undefined) patch.threshold_minutes = thresholdMinutes;
  if (channels !== undefined)         patch.channels          = channels;
  if (hoursMode !== undefined)        patch.hours_mode        = hoursMode;

  const updated = await updateSlaPolicy(code, patch);
  if (!updated) return { data: null, error: formErrors.generic };

  revalidatePath('/settings');
  return { data: updated, error: null };
}

/**
 * createSlaPolicyAction — the /settings "New rule" write path. Mirrors
 * updateSlaPolicyAction exactly (Zod → requireProfile(['admin','founder']) →
 * admin-client write → revalidatePath) plus one safety step: the rule code is
 * SYSTEM-GENERATED as an inert USR-<id> (never user-supplied — the schema has
 * no code field), and the generated code is asserted clear of every reserved
 * prefix before it touches the DB. trigger_value is already validated against
 * trigger_kind in the schema. A new row arms automatically — the engine reads
 * sla_policies per job run, so the next matching lead picks it up, no deploy.
 */
export async function createSlaPolicyAction(input: unknown): Promise<ActionResult<SlaPolicy>> {
  // 1. Zod validate (Rule S-01) — trigger_value-vs-kind is enforced here
  const parsed = CreateSlaPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? formErrors.generic };
  }

  // 2. Admin/founder only (Rule 09 / A-18)
  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const { triggerKind, triggerValue, recipientRole, thresholdMinutes, hoursMode, channels, active } =
    parsed.data;

  // 3. System-generate the code — never user-supplied. Assert it is inert
  //    (no reserved prefix) as a structural backstop before the DB write.
  const code = generateUserPolicyCode();
  if (RESERVED_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    // Can only happen on a code-generation bug — fail closed, never insert.
    console.error('[sla-policies-action] refused reserved-prefix code:', code);
    return { data: null, error: formErrors.generic };
  }

  // 4. Insert. auto_task stays false — a user-authored rule is a notification
  //    rule; auto-task and cadence behaviours are seeded engine rules only.
  const policy: NewSlaPolicy = {
    code,
    trigger_kind:      triggerKind,
    trigger_value:     triggerValue,
    threshold_minutes: thresholdMinutes,
    recipient_role:    recipientRole,
    auto_task:         false,
    channels,
    hours_mode:        hoursMode,
    active,
  };

  const created = await createSlaPolicy(policy);
  if (!created) return { data: null, error: formErrors.generic };

  revalidatePath('/settings');
  return { data: created, error: null };
}
