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

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/actions/_auth';
import { UpdateSlaPolicySchema } from '@/lib/validations/sla-policy-schema';
import { updateSlaPolicy } from '@/lib/services/sla-service';
import type { SlaPolicyPatch } from '@/lib/services/sla-service';
import { formErrors } from '@/lib/validations/form-errors';
import type { SlaPolicy } from '@/lib/types/database';
import type { ActionResult } from '@/lib/types/index';

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
