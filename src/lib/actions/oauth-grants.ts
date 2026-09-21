'use server';

// Disconnect an AI app from the profile page's "Connected AI apps" card. Session-gated,
// Zod-first, `{ data, error }` (Rule 10). The OAuth server revokes as the signed-in user.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireProfile } from './_auth';
import { parseActionInput } from './_validation';
import { revokeConnectedApp } from '@/lib/services/oauth-server-service';
import { formErrors } from '@/lib/validations/form-errors';

const revokeSchema = z.object({ clientId: z.string().trim().min(8).max(200) });

export async function revokeConnectedAppAction(
  input: unknown,
): Promise<{ data: { clientId: string } | null; error: string | null }> {
  const parsed = parseActionInput(revokeSchema, input);
  if (!parsed.ok) return { data: null, error: formErrors.generic };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const { error } = await revokeConnectedApp(parsed.data.clientId);
  if (error) {
    console.error('[oauth-grants-action] revoke failed:', error);
    return { data: null, error: formErrors.generic };
  }
  revalidatePath('/profile');
  return { data: { clientId: parsed.data.clientId }, error: null };
}
