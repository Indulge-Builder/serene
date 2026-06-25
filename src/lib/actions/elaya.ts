'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/actions/_auth';
import {
  resolveElayaChatSeed,
  updateElayaPersona,
  type ElayaChatSeed,
} from '@/lib/services/elaya-service';
import { formErrors } from '@/lib/validations/form-errors';
import { sanitizeText } from '@/lib/utils/sanitize';
import { UpdateElayaPersonaSchema } from '@/lib/validations/elaya-persona-schema';
import type { ElayaPersonaPrefs } from '@/lib/constants/elaya-persona';
import type { ActionResult } from '@/lib/types';

// ─────────────────────────────────────────────────────────
// getElayaChatSeedAction
// THE client entry for seeding ElayaChatShell from a 'use client' context
// (the floating Elaya widget). A client widget cannot call elaya-service
// directly (it pulls next/headers into the client bundle — A-15), so the
// seeding crosses a server boundary here. Returns the EXACT same seed the
// /elaya RSC page resolves (both go through resolveElayaChatSeed — R-01), so
// the widget continues the user's single active conversation, not a fork.
//
// No Zod: it takes no user input — identity is read from the verified profile,
// never the client (the 24h session + cap are still server-enforced).
// ─────────────────────────────────────────────────────────
export async function getElayaChatSeedAction(): Promise<ActionResult<ElayaChatSeed>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  try {
    const seed = await resolveElayaChatSeed(auth.profile);
    return { data: seed, error: null };
  } catch (err) {
    console.error('[elaya-action] seed resolve failed:', err);
    return { data: null, error: formErrors.elayaUnavailable };
  }
}

// ─────────────────────────────────────────────────────────
// updateElayaPersonaAction (Jarvis Phase 2)
// THE /profile write for the per-user Elaya persona ("how Elaya talks to me").
// Zod → requireProfile() (any role; identity from the verified profile, never the
// client) → sanitize the free-text note → merge into user_context.context.persona
// (the service preserves context.learned). STYLE ONLY — this can never widen what
// the user may see or do; persona is read into the prompt as guidance, the toolset
// + scope are the code-side gate (the Golden Rule).
// ─────────────────────────────────────────────────────────
export async function updateElayaPersonaAction(
  input: unknown,
): Promise<ActionResult<{ saved: true }>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const parsed = UpdateElayaPersonaSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: formErrors.generic };

  // Build the prefs object — omit empty fields (an unset field = Elaya's default).
  // The note is sanitised; an empty/blank note clears it (omitted from the object).
  const cleanNote = parsed.data.note ? sanitizeText(parsed.data.note).trim() : '';
  const prefs: ElayaPersonaPrefs = {
    ...(parsed.data.language ? { language: parsed.data.language } : {}),
    ...(parsed.data.tone     ? { tone:     parsed.data.tone }     : {}),
    ...(parsed.data.depth    ? { depth:    parsed.data.depth }    : {}),
    ...(parsed.data.length   ? { length:   parsed.data.length }   : {}),
    ...(cleanNote.length > 0 ? { note: cleanNote } : {}),
  };

  const ok = await updateElayaPersona(auth.profile.id, prefs);
  if (!ok) return { data: null, error: formErrors.generic };

  revalidatePath('/profile');
  return { data: { saved: true }, error: null };
}
