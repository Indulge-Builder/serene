'use server';
// ALL writes of the operating teammate's page (0257): a person's move on an intervention (seen /
// snoozed / resolved / dismissed; the recipient themself, or admin / founder) and the founder's
// switch (mode + the live queendoms; admin / founder). Zod → requireProfile → core → revalidate.
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/actions/_auth';
import { parseActionInput } from '@/lib/actions/_validation';
import { sanitizeText } from '@/lib/utils/sanitize';
import { formErrors } from '@/lib/validations/form-errors';
import { SetInterventionStateSchema, SetTeammateModeSchema } from '@/lib/validations/elaya-teammate-schema';
import { setInterventionStateCore, setTeammateModeCore } from '@/lib/services/elaya-teammate';
import { createAdminClient } from '@/lib/supabase/admin';
import { ELAYA_TEAMMATE_PATH } from '@/lib/constants/elaya-teammate';
import type { ActionResult } from '@/lib/types';

const ELEVATED = ['admin', 'founder'] as const;

export async function setInterventionStateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(SetInterventionStateSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  // The recipient may move their own row; admin and founder may move any.
  if (!(ELEVATED as readonly string[]).includes(auth.profile.role)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0257 is not in the generated types until the next regen
    const { data } = await (createAdminClient() as any).from('elaya_interventions').select('recipient_id').eq('id', parsed.data.id).maybeSingle();
    if ((data as { recipient_id: string | null } | null)?.recipient_id !== auth.profile.id) return { data: null, error: formErrors.unauthorized };
  }
  const note = parsed.data.note ? sanitizeText(parsed.data.note) : null;
  const res = await setInterventionStateCore(parsed.data.id, parsed.data.state, auth.profile.id, note);
  if (res.error) return { data: null, error: formErrors.generic };
  revalidatePath(ELAYA_TEAMMATE_PATH);
  return { data: { id: parsed.data.id }, error: null };
}

export async function setTeammateModeAction(input: unknown): Promise<ActionResult<{ saved: true }>> {
  const parsed = parseActionInput(SetTeammateModeSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ELEVATED]);
  if (!auth.ok) return auth.result;
  const res = await setTeammateModeCore(parsed.data.mode, parsed.data.queendomIds);
  if (res.error) return { data: null, error: formErrors.generic };
  revalidatePath(ELAYA_TEAMMATE_PATH);
  return { data: { saved: true }, error: null };
}
