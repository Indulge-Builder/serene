'use server';

/**
 * notification-prefs.ts — the /profile per-user notification control write path.
 *
 * The user edits their OWN preferences on the SESSION client — owner-only RLS
 * (migration 0133) double-enforces that user_id = auth.uid(). No admin client, no
 * admin gate: this is a self-edit, like the push subscribe/unsubscribe actions.
 *
 * SPARSE-ROW INVARIANT: a row exists only to record an opt-out. When BOTH channels
 * return to on, the row is DELETEd (back to the implicit-on default), so the table
 * holds only deliberate mutes. When either is off, the row is upserted on the
 * (user_id, notification_key) PK.
 */

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/actions/_auth';
import { createClient } from '@/lib/supabase/server';
import { SetNotificationPrefSchema } from '@/lib/validations/notification-prefs-schema';
import { formErrors } from '@/lib/validations/form-errors';
import type { ActionResult } from '@/lib/types/index';

export async function setNotificationPrefAction(
  input: unknown,
): Promise<ActionResult<{ notificationKey: string; inApp: boolean; whatsapp: boolean }>> {
  // 1. Zod validate (Rule 02) — key checked against the catalog enum here.
  const parsed = SetNotificationPrefSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  // 2. Any authenticated user manages their own prefs (Rule 09 / A-18).
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const userId = auth.profile.id;

  const { notificationKey, inApp, whatsapp } = parsed.data;
  const supabase = await createClient();

  // 3a. Both channels on → the implicit default. Drop any stored opt-out row so
  //     the table stays sparse. Idempotent (no row to delete is fine).
  if (inApp && whatsapp) {
    const { error } = await supabase
      .from('notification_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('notification_key', notificationKey);

    if (error) {
      console.error('[notification-prefs-action] delete failed:', error);
      return { data: null, error: formErrors.generic };
    }
    revalidatePath('/profile');
    return { data: { notificationKey, inApp, whatsapp }, error: null };
  }

  // 3b. Either channel off → record the opt-out. Upsert on the (user_id, key) PK.
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId, notification_key: notificationKey, in_app: inApp, whatsapp },
      { onConflict: 'user_id,notification_key' },
    );

  if (error) {
    console.error('[notification-prefs-action] upsert failed:', error);
    return { data: null, error: formErrors.generic };
  }

  revalidatePath('/profile');
  return { data: { notificationKey, inApp, whatsapp }, error: null };
}
