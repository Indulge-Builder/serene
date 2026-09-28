'use server';

// Elaya's voice channel — the one action behind the Call button (2026-09-28, 0247).
//
// startElayaVoiceCallAction — takes NOTHING (identity is the verified profile,
//   never client-supplied; the usage.ts posture) → requireProfile → the SAME
//   hasElayaAccess predicate every Elaya door asks → the voice_enabled switch →
//   LiveKit configured → mint the join grant. Returns { data: {url, token, room},
//   error } and never throws. The call itself (the cap, the session, both
//   message rows, the tools, the resolver) is the Python brain's, reached by
//   the voice worker; this action never touches a conversation.

import { requireProfile } from '@/lib/actions/_auth';
import { hasElayaAccess } from '@/lib/utils/route-access';
import { isElayaVoiceEnabled } from '@/lib/services/llm-providers-service';
import {
  isElayaVoiceConfigured,
  mintElayaVoiceGrant,
  type ElayaVoiceGrant,
} from '@/lib/services/elaya-voice-service';
import { formErrors } from '@/lib/validations/form-errors';
import type { ActionResult } from '@/lib/types';

export async function startElayaVoiceCallAction(): Promise<ActionResult<ElayaVoiceGrant>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  if (!hasElayaAccess(profile)) {
    return { data: null, error: formErrors.elayaNotEnabled };
  }
  if (!(await isElayaVoiceEnabled())) {
    return { data: null, error: formErrors.elayaVoiceNotEnabled };
  }
  if (!isElayaVoiceConfigured()) {
    console.error('[elaya-voice] voice_enabled is true but LIVEKIT_* is not configured');
    return { data: null, error: formErrors.elayaVoiceUnavailable };
  }

  try {
    const grant = await mintElayaVoiceGrant({ id: profile.id, full_name: profile.full_name });
    if (!grant) return { data: null, error: formErrors.elayaVoiceUnavailable };
    return { data: grant, error: null };
  } catch (e) {
    // D-05: the failure shape only.
    console.error('[elaya-voice] grant failed:', e instanceof Error ? e.message : e);
    return { data: null, error: formErrors.elayaVoiceUnavailable };
  }
}
